#include "App.h"
#include "../Drivers/PiezoAdcDriver.h"
#include "../Drivers/GpioDriver.h"
#include "../Drivers/UsbSerialDriver.h"
#include "../Drivers/DisplayDriver.h"
#include "../Platform/Pico/CoreStartup.h"
#include "../Platform/Pico/PicoBoard.h"
#include "../OSAL/Time.h"
#include <stddef.h>

static App* s_app_instance = NULL;

static void core1_entry(void) {
    App_init_core1(s_app_instance);
    while (s_app_instance && s_app_instance->is_running) {
        App_run_core1(s_app_instance);
    }
}

void App_init(App* app, const Config* config) {
    if (!app) return;

    if (config) {
        app->config = *config;
    } else {
        Config_set_defaults(&app->config);
    }

    app->last_calib_progress = 255;
    app->core1_ready = false;
    app->is_running = true;
    s_app_instance = app;

    /* Initialize config service */
    ConfigService_init(&app->config_service, &app->config);

    /* Initialize inter-core typed queues */
    OsalQueue_init(&app->queue_core0_to_core1, NULL, sizeof(Core0ToCore1Message), QUEUE_CORE0_TO_CORE1_CAPACITY);
    OsalQueue_init(&app->queue_core1_to_core0, NULL, sizeof(Core1ToCore0Message), QUEUE_CORE1_TO_CORE0_CAPACITY);

    /* Launch Core 1 only after all queues and shared resources are initialized */
    CoreStartup_launch_core1(core1_entry);

    /* Initialize Core 0 */
    App_init_core0(app);

    /* Wait for Core 1 display initialization to complete so calibration progress is visible from 0% */
    while (!app->core1_ready) {
        Time_delay_us(100);
    }

    /* Initialize Watchdog */
    WatchdogService_init(&app->watchdog_service, app->config.watchdog_timeout_ms);

    /* Send initial boot status and initial sensor state to Core 1 */
    Core0ToCore1Message boot_msg = {
        .type = MSG_BOOT_STATUS,
        .timestamp_us = Time_now_us(),
        .data.boot_status = {
            .success = true,
            .message = "Schlagzaehler ready"
        }
    };
    OsalQueue_push(&app->queue_core0_to_core1, &boot_msg);

    GameController_on_sensor_state(
        &app->game_controller,
        HitDetector_get_state(&app->hit_detector),
        HitDetector_get_baseline(&app->hit_detector),
        HitDetector_get_noise(&app->hit_detector),
        HitDetector_get_threshold(&app->hit_detector)
    );

    /* Start continuous ADC DMA sampling */
    PiezoAdcDriver_start();
}

void App_init_core0(App *app)
{
    if (!app) return;

    /* Initialize core 0 drivers */
    GpioDriver_init();
    PiezoAdcDriver_init(&app->config);

    /* Initialize Core 0 components */
    HitDetector_init(&app->hit_detector, &app->config);
    ButtonController_init(&app->button_controller);
    GameController_init(&app->game_controller, &app->config, &app->queue_core0_to_core1);
    CompanionProtocol_init(&app->companion_protocol, &app->command_handler);
}

void App_init_core1(App *app)
{
    if (!app) return;

    /* Initialize Core 1 drivers */
    UsbSerialDriver_init();
    DisplayDriver_init();

    /* Initialize Core 1 components */
    DisplayPresenter_init(&app->display_presenter);
    CommandHandler_init(&app->command_handler, &app->queue_core1_to_core0);
    CompanionProtocol_init(&app->companion_protocol, &app->command_handler);

    /* Render initial 0% boot screen before calibration begins */
    DisplayPresenter_render(&app->display_presenter);
    app->core1_ready = true;
}

void App_run_core0(App* app) {
    if (!app) return;

    /* 1. Process completed ADC DMA buffer */
    uint16_t* samples = NULL;
    size_t sample_count = 0;

    if (PiezoAdcDriver_poll_buffer(&samples, &sample_count)) {
        SensorState old_sensor_state = HitDetector_get_state(&app->hit_detector);
        HitEvent hit_event;
        bool hit_occurred = HitDetector_process_buffer(&app->hit_detector, samples, sample_count, &hit_event);
        SensorState new_sensor_state = HitDetector_get_state(&app->hit_detector);

        if (old_sensor_state != new_sensor_state) {
            GameController_on_sensor_state(
                &app->game_controller,
                new_sensor_state,
                HitDetector_get_baseline(&app->hit_detector),
                HitDetector_get_noise(&app->hit_detector),
                HitDetector_get_threshold(&app->hit_detector)
            );
        }

        if (new_sensor_state == SENSOR_STATE_CALIBRATING) {
            uint8_t pct = HitDetector_get_calibration_progress(&app->hit_detector);
            if (app->last_calib_progress == 255 || pct >= app->last_calib_progress + 5 || (pct == 100 && app->last_calib_progress != 100)) {
                app->last_calib_progress = pct;
                Core0ToCore1Message prog_msg = {
                    .type = MSG_CALIBRATION_PROGRESS,
                    .timestamp_us = Time_now_us(),
                    .data.calibration_progress.progress_percent = pct
                };
                OsalQueue_push(&app->queue_core0_to_core1, &prog_msg);
            }
        }

        if (hit_occurred) {
            PicoBoard_set_led(true);
            GameController_on_hit(&app->game_controller, &hit_event);
        } else if (new_sensor_state == SENSOR_STATE_ARMED) {
            PicoBoard_set_led(false);
        }

        PiezoAdcDriver_release_buffer();
    }

    /* 2. Process interrupt-queued local button events */
    ButtonEvent btn_event;
    while (ButtonController_pop_event(&app->button_controller, &btn_event)) {
        HitDetector_suppress_hits(&app->hit_detector, 200);
        GameController_on_button(&app->game_controller, &btn_event);
    }

    if (ButtonController_is_active_or_settling(&app->button_controller, 150)) {
        HitDetector_suppress_hits(&app->hit_detector, 150);
    }

    /* 3. Process commands from Core 1 */
    Core1ToCore0Message cmd;
    while (OsalQueue_pop(&app->queue_core1_to_core0, &cmd)) {
        if (cmd.type == MSG_REQUEST_CALIBRATION) {
            app->last_calib_progress = 255;
            HitDetector_start_calibration(&app->hit_detector);
            GameController_on_sensor_state(
                &app->game_controller,
                HitDetector_get_state(&app->hit_detector),
                HitDetector_get_baseline(&app->hit_detector),
                HitDetector_get_noise(&app->hit_detector),
                HitDetector_get_threshold(&app->hit_detector)
            );
        } else if (cmd.type == MSG_SET_SENSITIVITY) {
            ConfigService_set_sensitivity(&app->config_service, cmd.data.set_sensitivity.noise_factor);
            app->hit_detector.config.noise_factor = cmd.data.set_sensitivity.noise_factor;
        }
        GameController_on_command(&app->game_controller, &cmd);
    }

    /* 4. Manage ADC state: disable ADC while in MENU (unless calibrating) to save resources and avoid hit interference */
    GameState current_game_state = GameController_get_state(&app->game_controller)->state;
    if (current_game_state == GAME_STATE_MENU && HitDetector_get_state(&app->hit_detector) != SENSOR_STATE_CALIBRATING) {
        if (PiezoAdcDriver_is_running()) {
            PiezoAdcDriver_stop();
            PicoBoard_set_led(false);
            if (HitDetector_get_state(&app->hit_detector) == SENSOR_STATE_HIT_LOCKOUT) {
                HitDetector_reset_to_armed(&app->hit_detector);
                GameController_on_sensor_state(
                    &app->game_controller,
                    SENSOR_STATE_ARMED,
                    HitDetector_get_baseline(&app->hit_detector),
                    HitDetector_get_noise(&app->hit_detector),
                    HitDetector_get_threshold(&app->hit_detector)
                );
            }
        }
    } else {
        if (!PiezoAdcDriver_is_running()) {
            HitDetector_suppress_hits(&app->hit_detector, 250);
            PiezoAdcDriver_start();
        }
    }

    /* 5. Update GameController timer tick */
    GameController_tick(&app->game_controller);

    /* 6. Watchdog check & feed */
    WatchdogService_feed_core0(&app->watchdog_service);
    WatchdogService_tick(&app->watchdog_service);
}

void App_run_core1(App* app) {
    if (!app) return;

    /* 1. Drain messages from Core 0 */
    Core0ToCore1Message msg;
    while (OsalQueue_pop(&app->queue_core0_to_core1, &msg)) {
        DisplayPresenter_handle_message(&app->display_presenter, &msg);
        CompanionProtocol_send_message(&app->companion_protocol, &msg);
    }

    /* 2. Poll incoming serial commands from Companion */
    //CompanionProtocol_poll_input(&app->companion_protocol);

    /* 3. Render any dirty UI components on Display */
    DisplayPresenter_render(&app->display_presenter);

    /* 4. Feed Core 1 watchdog */
    WatchdogService_feed_core1(&app->watchdog_service);

    /* Yield briefly to avoid hogging SPI/CPU */
    Time_delay_us(500);
}
