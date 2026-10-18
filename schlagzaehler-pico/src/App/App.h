#ifndef APP_APP_H
#define APP_APP_H

#include "../Common/Config.h"
#include "../Common/Messages.h"
#include "../OSAL/Queue.h"
#include "HitDetection/HitDetector.h"
#include "Input/ButtonController.h"
#include "Game/GameController.h"
#include "Display/DisplayPresenter.h"
#include "Companion/CompanionProtocol.h"
#include "Companion/CommandHandler.h"
#include "../Services/ConfigService.h"
#include "../Services/WatchdogService.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    Config config;
    ConfigService config_service;
    WatchdogService watchdog_service;

    /* Inter-core Queues */
    OsalQueue queue_core0_to_core1;
    OsalQueue queue_core1_to_core0;

    /* Core 0 Components */
    HitDetector hit_detector;
    ButtonController button_controller;
    GameController game_controller;

    /* Core 1 Components */
    DisplayPresenter display_presenter;
    CommandHandler command_handler;
    CompanionProtocol companion_protocol;

    uint8_t last_calib_progress;
    volatile bool core1_ready;
    volatile bool is_running;
} App;

/**
 * @brief Initialize all queues, components, drivers, and launch Core 1.
 */
void App_init(App* app, const Config* config);

/**
 * @brief Core 0 initialization
 */
void App_init_core0(App *app);

/**
 * @brief Core 1 initialization
 */
void App_init_core1(App *app);

/**
 * @brief Non-blocking Core 0 main loop iteration.
 */
void App_run_core0(App *app);

/**
 * @brief Core 1 main loop iteration
 */
void App_run_core1(App* app);

#ifdef __cplusplus
}
#endif

#endif /* APP_APP_H */
