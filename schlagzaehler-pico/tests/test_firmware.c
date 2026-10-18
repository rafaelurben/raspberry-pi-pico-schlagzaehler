#include <stdio.h>
#include <assert.h>
#include <string.h>
#include <stdlib.h>

#include "../src/Common/GameTypes.h"
#include "../src/Common/Events.h"
#include "../src/Common/Config.h"
#include "../src/Common/Messages.h"
#include "../src/Common/Crc.h"

#include "../src/Services/ConfigService.h"
#include "../src/App/HitDetection/HitDetector.h"
#include "../src/App/Game/Modes/CountMode.h"
#include "../src/App/Game/Modes/TimedMode.h"
#include "../src/App/Game/Modes/RaceMode.h"
#include "../src/App/Game/GameController.h"
#include "../src/App/Input/ButtonController.h"
#include "../src/Drivers/GpioDriver.h"
#include "../src/App/Companion/CommandHandler.h"
#include "../src/App/Companion/CompanionProtocol.h"

/* Mock host Time & Interrupt implementation for testing */
static uint64_t s_mock_time_us = 1000000;
uint64_t Time_now_us(void) { return s_mock_time_us; }
uint32_t Time_now_ms(void) { return (uint32_t)(s_mock_time_us / 1000); }
void Time_delay_us(uint32_t us) { s_mock_time_us += us; }
void Time_delay_ms(uint32_t ms) { s_mock_time_us += (uint64_t)ms * 1000; }
uint32_t Interrupt_disable(void) { return 0; }
void Interrupt_restore(uint32_t status) { (void)status; }

static GpioButtonIrqCallback s_mock_gpio_cb = NULL;
static void* s_mock_gpio_user_data = NULL;
void GpioDriver_enable_button_irqs(GpioButtonIrqCallback callback, void* user_data) {
    s_mock_gpio_cb = callback;
    s_mock_gpio_user_data = user_data;
}

/* Mock host Queue implementation for testing */
typedef struct {
    uint8_t buffer[64][sizeof(Core0ToCore1Message)];
    size_t head;
    size_t tail;
    size_t count;
    size_t capacity;
    size_t item_size;
} MockQueueStorage;

bool OsalQueue_init(OsalQueue* q, void* buffer, size_t item_size, size_t capacity) {
    (void)buffer;
    MockQueueStorage* s = (MockQueueStorage*)calloc(1, sizeof(MockQueueStorage));
    s->item_size = item_size;
    s->capacity = (capacity > 64) ? 64 : capacity;
    q->impl = s;
    q->item_size = item_size;
    q->capacity = capacity;
    q->overflow_count = 0;
    return true;
}

bool OsalQueue_push(OsalQueue* q, const void* item) {
    MockQueueStorage* s = (MockQueueStorage*)q->impl;
    if (s->count >= s->capacity) {
        q->overflow_count++;
        return false;
    }
    memcpy(s->buffer[s->head], item, s->item_size);
    s->head = (s->head + 1) % s->capacity;
    s->count++;
    return true;
}

bool OsalQueue_pop(OsalQueue* q, void* item) {
    MockQueueStorage* s = (MockQueueStorage*)q->impl;
    if (s->count == 0) return false;
    memcpy(item, s->buffer[s->tail], s->item_size);
    s->tail = (s->tail + 1) % s->capacity;
    s->count--;
    return true;
}

size_t OsalQueue_count(const OsalQueue* q) {
    MockQueueStorage* s = (MockQueueStorage*)q->impl;
    return s->count;
}

/* Mock USB serial output */
static char s_last_serial_line[256];
void UsbSerialDriver_write_line(const char* line) {
    strncpy(s_last_serial_line, line, sizeof(s_last_serial_line) - 1);
}
int UsbSerialDriver_read_line(char* buffer, size_t max_len) {
    (void)buffer; (void)max_len; return 0;
}

void test_crc(void) {
    const char* str = "123456789";
    uint16_t crc16 = Crc_calculate16((const uint8_t*)str, 9);
    assert(crc16 == 0x29B1);
    uint32_t crc32 = Crc_calculate32((const uint8_t*)str, 9);
    assert(crc32 == 0xCBF43926);
    printf("PASS: test_crc\n");
}

void test_config_service(void) {
    ConfigService cs;
    Config cfg;
    Config_set_defaults(&cfg);
    ConfigService_init(&cs, &cfg);

    const Config* c = ConfigService_get(&cs);
    assert(c->default_mode == GAME_MODE_COUNT);

    ConfigService_set_mode(&cs, GAME_MODE_TIMED);
    ConfigService_set_parameter(&cs, 45);
    assert(ConfigService_get(&cs)->timed_duration_s == 45);

    /* Test clamping */
    ConfigService_set_parameter(&cs, 2);
    assert(ConfigService_get(&cs)->timed_duration_s == 5);

    printf("PASS: test_config_service\n");
}

void test_hit_detector_and_calibration(void) {
    Config cfg;
    Config_set_defaults(&cfg);
    cfg.calibration_duration_ms = 100;
    cfg.calibration_min_samples = 500;
    cfg.min_threshold_delta = 25;
    cfg.lockout_duration_ms = 100;

    HitDetector hd;
    HitDetector_init(&hd, &cfg);
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_INIT);

    /* Feed 600 quiet samples around baseline 1980 with +/-2 noise */
    uint16_t quiet_samples[256];
    for (int i = 0; i < 256; ++i) {
        quiet_samples[i] = 1980 + (i % 3);
    }

    HitEvent ev;
    HitDetector_process_buffer(&hd, quiet_samples, 256, &ev);
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_CALIBRATING);
    assert(HitDetector_get_calibration_progress(&hd) == 0);

    s_mock_time_us += 120000; /* Advance time past 100 ms */
    HitDetector_process_buffer(&hd, quiet_samples, 256, &ev);
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_ARMED);
    assert(HitDetector_get_calibration_progress(&hd) == 100);

    uint16_t baseline = HitDetector_get_baseline(&hd);
    assert(baseline >= 1979 && baseline <= 1982);
    uint16_t threshold = HitDetector_get_threshold(&hd);
    assert(threshold >= 2005);

    /* Test hit detection */
    uint16_t hit_samples[256];
    for (int i = 0; i < 256; ++i) hit_samples[i] = 1980;
    hit_samples[50] = 2180; /* Strong hit peak */

    bool hit = HitDetector_process_buffer(&hd, hit_samples, 256, &ev);
    assert(hit == true);
    assert(ev.peak_value == 2180);
    assert(ev.hit_id == 1);
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_HIT_LOCKOUT);

    /* During lockout, no secondary hit should trigger */
    hit = HitDetector_process_buffer(&hd, hit_samples, 256, &ev);
    assert(hit == false);

    /* Advance past lockout dead time */
    s_mock_time_us += 150000;
    hit = HitDetector_process_buffer(&hd, quiet_samples, 256, &ev);
    assert(hit == false);
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_ARMED);

    /* Test hit suppression window (e.g. after ADC restart / button vibration) */
    HitDetector_suppress_hits(&hd, 200);
    hit = HitDetector_process_buffer(&hd, hit_samples, 256, &ev);
    assert(hit == false);
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_ARMED);

    /* After suppression window expires, hits are detected again */
    s_mock_time_us += 250000;
    hit = HitDetector_process_buffer(&hd, quiet_samples, 256, &ev);
    assert(hit == false);
    hit = HitDetector_process_buffer(&hd, hit_samples, 256, &ev);
    assert(hit == true);
    assert(ev.hit_id == 2);

    printf("PASS: test_hit_detector_and_calibration\n");
}

void test_game_controller_and_modes(void) {
    Config cfg;
    Config_set_defaults(&cfg);

    OsalQueue q0_to_q1;
    OsalQueue_init(&q0_to_q1, NULL, sizeof(Core0ToCore1Message), 64);

    GameController gc;
    GameController_init(&gc, &cfg, &q0_to_q1);

    assert(gc.state_model.state == GAME_STATE_BOOT);

    /* Sensor enters calibration, then calibration completes */
    GameController_on_sensor_state(&gc, SENSOR_STATE_CALIBRATING, 0, 0, 0);
    GameController_on_sensor_state(&gc, SENSOR_STATE_ARMED, 1980, 2, 2005);
    assert(gc.state_model.state == GAME_STATE_READY);

    /* Verify MSG_CALIBRATION_RESULT was sent once upon calibration completion */
    Core0ToCore1Message msg;
    int calib_result_count = 0;
    while (OsalQueue_pop(&q0_to_q1, &msg)) {
        if (msg.type == MSG_CALIBRATION_RESULT) {
            calib_result_count++;
        }
    }
    assert(calib_result_count == 1);

    /* Hit starts game into RUNNING, and sensor goes HIT_LOCKOUT -> ARMED */
    GameController_on_sensor_state(&gc, SENSOR_STATE_HIT_LOCKOUT, 1980, 2, 2005);
    HitEvent hit1 = { .hit_id = 1, .peak_value = 2150, .timestamp_us = s_mock_time_us };
    GameController_on_hit(&gc, &hit1);
    assert(gc.state_model.state == GAME_STATE_RUNNING);
    assert(gc.state_model.score == 1);

    /* Lockout ends -> returns to ARMED: must NOT emit MSG_CALIBRATION_RESULT */
    GameController_on_sensor_state(&gc, SENSOR_STATE_ARMED, 1980, 2, 2005);
    while (OsalQueue_pop(&q0_to_q1, &msg)) {
        assert(msg.type != MSG_CALIBRATION_RESULT);
    }

    /* More hits increment score */
    HitEvent hit2 = { .hit_id = 2, .peak_value = 2160, .timestamp_us = s_mock_time_us };
    GameController_on_hit(&gc, &hit2);
    assert(gc.state_model.score == 2);

    /* Reset button resets back to READY */
    ButtonEvent btn_r = { .button = BTN_ID_RIGHT, .pressed = true, .timestamp_us = s_mock_time_us };
    GameController_on_button(&gc, &btn_r);
    assert(gc.state_model.state == GAME_STATE_READY);
    assert(gc.state_model.score == 0);

    /* Left button enters MENU */
    ButtonEvent btn_l = { .button = BTN_ID_LEFT, .pressed = true, .timestamp_us = s_mock_time_us };
    GameController_on_button(&gc, &btn_l);
    assert(gc.state_model.state == GAME_STATE_MENU);

    /* Drain queue from state change */
    while (OsalQueue_pop(&q0_to_q1, &msg));

    /* Menu navigation: DOWN cycles to TIMED */
    ButtonEvent btn_d = { .button = BTN_ID_DOWN, .pressed = true, .timestamp_us = s_mock_time_us };
    GameController_on_button(&gc, &btn_d);
    assert(gc.state_model.menu_selected_mode == GAME_MODE_TIMED);
    assert(gc.state_model.active_mode == GAME_MODE_TIMED);
    assert(gc.state_model.parameter == cfg.timed_duration_s);

    /* Verify message broadcast to Core 1 contains updated mode and parameter */
    bool found_mode_msg = false;
    while (OsalQueue_pop(&q0_to_q1, &msg)) {
        if (msg.type == MSG_GAME_MODE_CHANGED) {
            assert(msg.data.game_mode.mode == GAME_MODE_TIMED);
            assert(msg.data.game_mode.menu_selected_mode == GAME_MODE_TIMED);
            assert(msg.data.game_mode.parameter == cfg.timed_duration_s);
            found_mode_msg = true;
        }
    }
    assert(found_mode_msg);

    /* Menu navigation: DOWN cycles to RACE */
    GameController_on_button(&gc, &btn_d);
    assert(gc.state_model.menu_selected_mode == GAME_MODE_RACE);
    assert(gc.state_model.active_mode == GAME_MODE_RACE);
    assert(gc.state_model.parameter == cfg.race_target_hits);

    found_mode_msg = false;
    while (OsalQueue_pop(&q0_to_q1, &msg)) {
        if (msg.type == MSG_GAME_MODE_CHANGED) {
            assert(msg.data.game_mode.mode == GAME_MODE_RACE);
            assert(msg.data.game_mode.menu_selected_mode == GAME_MODE_RACE);
            assert(msg.data.game_mode.parameter == cfg.race_target_hits);
            found_mode_msg = true;
        }
    }
    assert(found_mode_msg);

    /* RIGHT selects mode -> READY */
    GameController_on_button(&gc, &btn_r);
    assert(gc.state_model.state == GAME_STATE_READY);
    assert(gc.state_model.active_mode == GAME_MODE_RACE);
    assert(gc.state_model.parameter == cfg.race_target_hits);

    printf("PASS: test_game_controller_and_modes\n");
}

void test_companion_protocol(void) {
    OsalQueue q1_to_q0;
    OsalQueue_init(&q1_to_q0, NULL, sizeof(Core1ToCore0Message), 16);

    CommandHandler ch;
    CommandHandler_init(&ch, &q1_to_q0);

    CompanionProtocol cp;
    CompanionProtocol_init(&cp, &ch);

    CompanionProtocol_parse_line(&cp, "START");
    assert(OsalQueue_count(&q1_to_q0) == 1);

    Core1ToCore0Message msg;
    OsalQueue_pop(&q1_to_q0, &msg);
    assert(msg.type == MSG_START_GAME);

    /* Outgoing formatting */
    Core0ToCore1Message out_msg = {
        .type = MSG_HIT_DETECTED,
        .timestamp_us = 1000,
        .data.hit = {
            .hit_id = 42,
            .peak_value = 2200,
            .intensity = 220
        }
    };
    CompanionProtocol_send_message(&cp, &out_msg);
    assert(strncmp(s_last_serial_line, "HIT id=42", 9) == 0);

    /* Outgoing mode change formatting */
    Core0ToCore1Message mode_msg = {
        .type = MSG_GAME_MODE_CHANGED,
        .timestamp_us = 1000,
        .data.game_mode = {
            .mode = GAME_MODE_TIMED,
            .menu_selected_mode = GAME_MODE_TIMED,
            .parameter = 30
        }
    };
    CompanionProtocol_send_message(&cp, &mode_msg);
    assert(strcmp(s_last_serial_line, "MODE active=TIMED param=30") == 0);

    printf("PASS: test_companion_protocol\n");
}

void test_button_controller_interrupts(void) {
    ButtonController bc;
    s_mock_gpio_cb = NULL;
    s_mock_gpio_user_data = NULL;

    ButtonController_init(&bc);
    assert(s_mock_gpio_cb != NULL);
    assert(s_mock_gpio_user_data == &bc);

    ButtonEvent ev;
    assert(ButtonController_pop_event(&bc, &ev) == false);

    /* Simulate interrupt on BTN_ID_UP press (falling edge) */
    s_mock_gpio_cb(BTN_ID_UP, true, s_mock_gpio_user_data);

    /* Simulate switch bounce within 25ms (rising + falling edges) */
    s_mock_time_us += 1000;
    s_mock_gpio_cb(BTN_ID_UP, false, s_mock_gpio_user_data);
    s_mock_time_us += 1000;
    s_mock_gpio_cb(BTN_ID_UP, true, s_mock_gpio_user_data);

    /* Only 1 press event should have been queued */
    assert(ButtonController_pop_event(&bc, &ev) == true);
    assert(ev.button == BTN_ID_UP);
    assert(ev.pressed == true);
    assert(ButtonController_pop_event(&bc, &ev) == false);

    /* Hold for 100ms, then release (rising edge) + release bounce (falling edge 1ms later) */
    s_mock_time_us += 100000;
    s_mock_gpio_cb(BTN_ID_UP, false, s_mock_gpio_user_data);
    s_mock_time_us += 1000;
    s_mock_gpio_cb(BTN_ID_UP, true, s_mock_gpio_user_data);
    assert(ButtonController_pop_event(&bc, &ev) == false);

    /* Press DOWN, LEFT, RIGHT after debounce interval */
    s_mock_time_us += 50000;
    s_mock_gpio_cb(BTN_ID_DOWN, true, s_mock_gpio_user_data);
    s_mock_gpio_cb(BTN_ID_LEFT, true, s_mock_gpio_user_data);
    s_mock_gpio_cb(BTN_ID_RIGHT, true, s_mock_gpio_user_data);

    assert(ButtonController_pop_event(&bc, &ev) == true && ev.button == BTN_ID_DOWN);
    assert(ButtonController_pop_event(&bc, &ev) == true && ev.button == BTN_ID_LEFT);
    assert(ButtonController_pop_event(&bc, &ev) == true && ev.button == BTN_ID_RIGHT);
    assert(ButtonController_pop_event(&bc, &ev) == false);

    /* Release all buttons and verify settling window */
    assert(ButtonController_is_active_or_settling(&bc, 150) == true);
    s_mock_gpio_cb(BTN_ID_UP, false, s_mock_gpio_user_data);
    s_mock_gpio_cb(BTN_ID_DOWN, false, s_mock_gpio_user_data);
    s_mock_gpio_cb(BTN_ID_LEFT, false, s_mock_gpio_user_data);
    s_mock_gpio_cb(BTN_ID_RIGHT, false, s_mock_gpio_user_data);
    assert(ButtonController_is_active_or_settling(&bc, 150) == true);
    s_mock_time_us += 200000;
    assert(ButtonController_is_active_or_settling(&bc, 150) == false);

    printf("PASS: test_button_controller_interrupts\n");
}

int main(void) {
    printf("--- Running Schlagzaehler Architecture Unit Tests ---\n");
    test_crc();
    test_config_service();
    test_hit_detector_and_calibration();
    test_game_controller_and_modes();
    test_companion_protocol();
    test_button_controller_interrupts();
    printf("--- ALL 6 ARCHITECTURE TEST SUITES PASSED! ---\n");
    return 0;
}
