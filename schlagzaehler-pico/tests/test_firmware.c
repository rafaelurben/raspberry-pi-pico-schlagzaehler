#include <stdio.h>
#include <assert.h>
#include <string.h>
#include <stdlib.h>

#include "../src/Common/GameTypes.h"
#include "../src/Common/Events.h"
#include "../src/Common/Config.h"
#include "../src/Common/Messages.h"

#include "../src/App/ConfigService.h"
#include "../src/App/HitDetection/HitDetector.h"
#include "../src/App/HitDetection/SignalCapture.h"
#include "../src/App/Game/Modes/CountMode.h"
#include "../src/App/Game/Modes/TimedMode.h"
#include "../src/App/Game/Modes/RaceMode.h"
#include "../src/App/Game/GameController.h"
#include "../src/App/Input/ButtonController.h"
#include "../src/OSAL/inc/GpioDriver.h"
#include "../src/App/Companion/CommandHandler.h"
#include "../src/App/Companion/CompanionProtocol.h"
#include "../src/App/Companion/Crc16.h"
#include "../src/App/Display/DisplayPresenter.h"
#include "../src/OSAL/inc/DisplayDriver.h"

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
static uint8_t s_last_serial_bytes[1024];
static size_t s_last_serial_bytes_len = 0;

void UsbSerialDriver_write_line(const char* line) {
    strncpy(s_last_serial_line, line, sizeof(s_last_serial_line) - 1);
    s_last_serial_line[sizeof(s_last_serial_line) - 1] = '\0';
}

void UsbSerialDriver_write_string(const char* str) {
    strncpy(s_last_serial_line, str, sizeof(s_last_serial_line) - 1);
    s_last_serial_line[sizeof(s_last_serial_line) - 1] = '\0';
}

int UsbSerialDriver_write_bytes(const uint8_t* buffer, size_t len) {
    if (!buffer || len == 0) return 0;
    size_t copy_len = (len < sizeof(s_last_serial_bytes)) ? len : sizeof(s_last_serial_bytes);
    memcpy(s_last_serial_bytes, buffer, copy_len);
    s_last_serial_bytes_len = copy_len;
    return (int)len;
}

static uint8_t s_mock_serial_rx[512];
static size_t s_mock_serial_rx_len = 0;
static size_t s_mock_serial_rx_pos = 0;

__attribute__((unused)) static void mock_serial_feed_input(const uint8_t* data, size_t len) {
    size_t copy_len = (len < sizeof(s_mock_serial_rx)) ? len : sizeof(s_mock_serial_rx);
    memcpy(s_mock_serial_rx, data, copy_len);
    s_mock_serial_rx_len = copy_len;
    s_mock_serial_rx_pos = 0;
}

int UsbSerialDriver_read_bytes(uint8_t* buffer, size_t max_len) {
    if (!buffer || max_len == 0) return -1;
    size_t available = s_mock_serial_rx_len - s_mock_serial_rx_pos;
    if (available == 0) return 0;
    size_t count = (available < max_len) ? available : max_len;
    memcpy(buffer, &s_mock_serial_rx[s_mock_serial_rx_pos], count);
    s_mock_serial_rx_pos += count;
    return (int)count;
}

int UsbSerialDriver_read_line(char* buffer, size_t max_len) {
    (void)buffer; (void)max_len; return 0;
}

/* Mock DisplayDriver for testing */
static char s_last_display_strings[16][64];
static int s_display_string_count = 0;

void DisplayDriver_clear(uint16_t color) { (void)color; s_display_string_count = 0; }
void DisplayDriver_draw_hline(int16_t y, uint16_t color) { (void)y; (void)color; }
void DisplayDriver_draw_rect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t color) { (void)x; (void)y; (void)w; (void)h; (void)color; }
void DisplayDriver_fill_rect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t color) { (void)x; (void)y; (void)w; (void)h; (void)color; }
void DisplayDriver_draw_string(int16_t x, int16_t y, const char* str, uint16_t fg, uint16_t bg, DisplayFontId font) {
    (void)x; (void)y; (void)fg; (void)bg; (void)font;
    if (s_display_string_count < 16 && str) {
        strncpy(s_last_display_strings[s_display_string_count++], str, 63);
    }
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
    cfg.calibration_min_samples = 300; /* 100 per sensor */
    cfg.min_threshold_delta = 25;
    cfg.lockout_duration_ms = 100;

    HitDetector hd;
    HitDetector_init(&hd, &cfg);
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_INIT);

    /* Feed 384 quiet interleaved samples (128 triplets) */
    uint16_t quiet_samples[384];
    for (int t = 0; t < 128; ++t) {
        quiet_samples[t * 3 + 0] = 1980 + (t % 3);
        quiet_samples[t * 3 + 1] = 1500 + (t % 3);
        quiet_samples[t * 3 + 2] = 2200 + (t % 3);
    }

    HitEvent ev;
    HitDetector_process_buffer(&hd, quiet_samples, 384, &ev);
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_CALIBRATING);
    assert(HitDetector_get_calibration_progress(&hd) == 0);

    s_mock_time_us += 120000; /* Advance time past 100 ms */
    HitDetector_process_buffer(&hd, quiet_samples, 384, &ev);
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_ARMED);
    assert(HitDetector_get_calibration_progress(&hd) == 100);

    uint16_t baseline0 = HitDetector_get_sensor_baseline(&hd, 0);
    assert(baseline0 >= 1979 && baseline0 <= 1982);
    uint16_t baseline1 = HitDetector_get_sensor_baseline(&hd, 1);
    assert(baseline1 >= 1499 && baseline1 <= 1502);
    uint16_t baseline2 = HitDetector_get_sensor_baseline(&hd, 2);
    assert(baseline2 >= 2199 && baseline2 <= 2202);

    uint16_t thresh0 = HitDetector_get_sensor_threshold(&hd, 0);
    assert(thresh0 >= 2005);
    uint16_t thresh1 = HitDetector_get_sensor_threshold(&hd, 1);
    assert(thresh1 >= 1525);
    uint16_t thresh2 = HitDetector_get_sensor_threshold(&hd, 2);
    assert(thresh2 >= 2225);

    /* Test hit detection and peak intensity winner disambiguation */
    uint16_t hit_samples[384];
    for (int t = 0; t < 128; ++t) {
        hit_samples[t * 3 + 0] = 1980;
        hit_samples[t * 3 + 1] = 1500;
        hit_samples[t * 3 + 2] = 2200;
    }
    /* Direct strike on Sensor 1 at triplet 2 */
    hit_samples[2 * 3 + 1] = 2600;
    /* Crosstalk vibrations on Sensor 0 and Sensor 2 */
    hit_samples[3 * 3 + 0] = 2020;
    hit_samples[3 * 3 + 2] = 2240;

    bool hit = HitDetector_process_buffer(&hd, hit_samples, 384, &ev);
    assert(hit == true);
    assert(ev.sensor_id == 1); /* Sensor 1 is the winner! */
    assert(ev.peak_value == 2600);
    assert(ev.hit_id == 1);
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_HIT_LOCKOUT);

    /* During lockout, no secondary hit should trigger */
    hit = HitDetector_process_buffer(&hd, hit_samples, 384, &ev);
    assert(hit == false);

    /* Advance past lockout dead time */
    s_mock_time_us += 150000;
    hit = HitDetector_process_buffer(&hd, quiet_samples, 384, &ev);
    assert(hit == false);
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_ARMED);

    /* Test hit suppression window (e.g. after ADC restart / button vibration) */
    HitDetector_suppress_hits(&hd, 200);
    hit = HitDetector_process_buffer(&hd, hit_samples, 384, &ev);
    assert(hit == false);
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_ARMED);

    /* After suppression window expires, hits are detected again (strike Sensor 2 this time) */
    s_mock_time_us += 250000;
    hit = HitDetector_process_buffer(&hd, quiet_samples, 384, &ev);
    assert(hit == false);

    /* Direct strike on Sensor 2 */
    hit_samples[2 * 3 + 1] = 1500;
    hit_samples[2 * 3 + 2] = 3200;
    hit = HitDetector_process_buffer(&hd, hit_samples, 384, &ev);
    assert(hit == true);
    assert(ev.sensor_id == 2);
    assert(ev.peak_value == 3200);
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

    uint16_t baselines[SENSOR_COUNT] = {1980, 1500, 2200};
    uint16_t noises[SENSOR_COUNT] = {2, 3, 2};
    uint16_t thresholds[SENSOR_COUNT] = {2005, 1525, 2225};
    bool ignored[SENSOR_COUNT] = {false, false, false};

    /* Sensor enters calibration, then calibration completes */
    GameController_on_sensor_state(&gc, SENSOR_STATE_CALIBRATING, 3, NULL, NULL, NULL, NULL);
    GameController_on_sensor_state(&gc, SENSOR_STATE_ARMED, 3, baselines, noises, thresholds, ignored);
    assert(gc.state_model.state == GAME_STATE_READY);

    /* Verify MSG_CALIBRATION_RESULT was sent for all SENSOR_COUNT sensors upon calibration completion */
    Core0ToCore1Message msg;
    int calib_result_count = 0;
    bool seen_sensor[SENSOR_COUNT] = {false};
    while (OsalQueue_pop(&q0_to_q1, &msg)) {
        if (msg.type == MSG_CALIBRATION_RESULT) {
            calib_result_count++;
            if (msg.data.calibration_result.sensor_id < SENSOR_COUNT) {
                seen_sensor[msg.data.calibration_result.sensor_id] = true;
                assert(msg.data.calibration_result.ignored == false);
            }
        }
    }
    assert(calib_result_count == SENSOR_COUNT);
    for (int s = 0; s < SENSOR_COUNT; ++s) {
        assert(seen_sensor[s] == true);
    }

    /* Hit starts game into RUNNING, and sensor goes HIT_LOCKOUT -> ARMED */
    GameController_on_sensor_state(&gc, SENSOR_STATE_HIT_LOCKOUT, 3, baselines, noises, thresholds, ignored);
    HitEvent hit1 = { .hit_id = 1, .sensor_id = 0, .peak_value = 2150, .timestamp_us = s_mock_time_us };
    GameController_on_hit(&gc, &hit1);
    assert(gc.state_model.state == GAME_STATE_RUNNING);
    assert(gc.state_model.score == 1);

    /* Lockout ends -> returns to ARMED: must NOT emit MSG_CALIBRATION_RESULT */
    GameController_on_sensor_state(&gc, SENSOR_STATE_ARMED, 3, baselines, noises, thresholds, ignored);
    while (OsalQueue_pop(&q0_to_q1, &msg)) {
        assert(msg.type != MSG_CALIBRATION_RESULT);
    }

    /* Hit on sensor 1 increments aggregate score */
    HitEvent hit2 = { .hit_id = 2, .sensor_id = 1, .peak_value = 1750, .timestamp_us = s_mock_time_us };
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

    /* Entering capture mode transitions GameState to GAME_STATE_CAPTURING and back to READY when ARMED */
    GameController_on_sensor_state(&gc, SENSOR_STATE_CAPTURE_ARMED, 1, baselines, noises, thresholds, ignored);
    assert(gc.state_model.state == GAME_STATE_CAPTURING);
    assert(gc.capture_target == 1);
    GameController_on_sensor_state(&gc, SENSOR_STATE_CAPTURING, 1, baselines, noises, thresholds, ignored);
    assert(gc.state_model.state == GAME_STATE_CAPTURING);
    GameController_on_sensor_state(&gc, SENSOR_STATE_CAPTURE_TX_WAIT, 1, baselines, noises, thresholds, ignored);
    assert(gc.state_model.state == GAME_STATE_CAPTURING);
    GameController_on_sensor_state(&gc, SENSOR_STATE_ARMED, 3, baselines, noises, thresholds, ignored);
    assert(gc.state_model.state == GAME_STATE_READY);

    /* Test STATUS command handling in GameController: emits SENSOR, STATE, MODE, SCORE, TIMER */
    gc.last_sensor_state = SENSOR_STATE_ARMED;
    while (OsalQueue_pop(&q0_to_q1, &msg));
    Core1ToCore0Message status_cmd = {
        .type = MSG_REQUEST_STATUS,
        .timestamp_us = s_mock_time_us
    };
    GameController_on_command(&gc, &status_cmd);

    bool has_sensor_status = false;
    bool has_state = false;
    bool has_mode = false;
    bool has_score = false;
    bool has_timer = false;
    while (OsalQueue_pop(&q0_to_q1, &msg)) {
        if (msg.type == MSG_SENSOR_STATUS_CHANGED) {
            assert(msg.data.sensor_status.state == SENSOR_STATE_ARMED);
            has_sensor_status = true;
        } else if (msg.type == MSG_GAME_STATE_CHANGED) {
            has_state = true;
        } else if (msg.type == MSG_GAME_MODE_CHANGED) {
            has_mode = true;
        } else if (msg.type == MSG_SCORE_CHANGED) {
            has_score = true;
        } else if (msg.type == MSG_TIMER_CHANGED) {
            has_timer = true;
        }
    }
    assert(has_sensor_status && has_state && has_mode && has_score && has_timer);

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

    /* STATUS command parses and queues MSG_REQUEST_STATUS */
    CompanionProtocol_parse_line(&cp, "STATUS");
    assert(OsalQueue_pop(&q1_to_q0, &msg) == true);
    assert(msg.type == MSG_REQUEST_STATUS);

    /* Outgoing formatting */
    Core0ToCore1Message out_msg = {
        .type = MSG_HIT_DETECTED,
        .timestamp_us = 1000,
        .data.hit = {
            .hit_id = 42,
            .sensor_id = 1,
            .peak_value = 2200,
            .intensity = 220
        }
    };
    CompanionProtocol_send_message(&cp, &out_msg);
    assert(strcmp(s_last_serial_line, "HIT id=42 target=1 peak=2200 intensity=220") == 0);

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

    /* Outgoing sensor status formatting */
    Core0ToCore1Message sensor_msg = {
        .type = MSG_SENSOR_STATUS_CHANGED,
        .timestamp_us = 1000,
        .data.sensor_status = {
            .state = SENSOR_STATE_ARMED
        }
    };
    CompanionProtocol_send_message(&cp, &sensor_msg);
    assert(strcmp(s_last_serial_line, "SENSOR status=ARMED") == 0);

    /* Capture start/stop commands */
    CompanionProtocol_parse_line(&cp, "CAPTURE");
    assert(OsalQueue_pop(&q1_to_q0, &msg) == true);
    assert(msg.type == MSG_REQUEST_CAPTURE);
    assert(msg.data.request_capture.enable == true);
    assert(msg.data.request_capture.target == 3); /* Default is ALL */

    CompanionProtocol_parse_line(&cp, "CAPTURE:all");
    assert(OsalQueue_pop(&q1_to_q0, &msg) == true);
    assert(msg.type == MSG_REQUEST_CAPTURE);
    assert(msg.data.request_capture.enable == true);
    assert(msg.data.request_capture.target == 3);

    CompanionProtocol_parse_line(&cp, "CAPTURE:ALL");
    assert(OsalQueue_pop(&q1_to_q0, &msg) == true);
    assert(msg.type == MSG_REQUEST_CAPTURE);
    assert(msg.data.request_capture.enable == true);
    assert(msg.data.request_capture.target == 3);

    CompanionProtocol_parse_line(&cp, "CAPTURE:1");
    assert(OsalQueue_pop(&q1_to_q0, &msg) == true);
    assert(msg.type == MSG_REQUEST_CAPTURE);
    assert(msg.data.request_capture.enable == true);
    assert(msg.data.request_capture.target == 1);

    CompanionProtocol_parse_line(&cp, "CAPTURE:STOP");
    assert(OsalQueue_pop(&q1_to_q0, &msg) == true);
    assert(msg.type == MSG_REQUEST_CAPTURE);
    assert(msg.data.request_capture.enable == false);

    /* Chunked capture transmission */
    uint16_t dummy_samples[120];
    for (int i = 0; i < 120; ++i) dummy_samples[i] = (uint16_t)(1900 + i);
    Core0ToCore1Message cap_ready_msg = {
        .type = MSG_CAPTURE_READY,
        .timestamp_us = 2000,
        .data.capture_ready = {
            .sample_rate_hz = 10000,
            .target = 3,
            .pre_samples = 20,
            .total_samples = 120,
            .baseline = 1900,
            .noise = 3,
            .threshold = 1925,
            .samples = dummy_samples
        }
    };
    CompanionProtocol_send_message(&cp, &cap_ready_msg);
    assert(strcmp(s_last_serial_line, "CAPTURE_START rate=10000 pre=20 count=120 target=3") == 0);
    assert(cp.capture_tx_active == true);

    /* Tick 1 sends line 1 (50 samples) */
    assert(CompanionProtocol_tick_capture_tx(&cp) == false);
    assert(strncmp(s_last_serial_line, "CAPTURE_DATA offset=0 values=1900,1901", 38) == 0);

    /* Tick 2 sends line 2 (50 samples) */
    assert(CompanionProtocol_tick_capture_tx(&cp) == false);
    assert(strncmp(s_last_serial_line, "CAPTURE_DATA offset=50 values=1950,1951", 39) == 0);

    /* Tick 3 sends final 20 samples + CAPTURE_END and notifies Core 0 */
    assert(CompanionProtocol_tick_capture_tx(&cp) == true);
    assert(strcmp(s_last_serial_line, "CAPTURE_END count=120") == 0);
    assert(cp.capture_tx_active == false);
    assert(OsalQueue_pop(&q1_to_q0, &msg) == true);
    assert(msg.type == MSG_REQUEST_CAPTURE);
    assert(msg.data.request_capture.enable == false);

    printf("PASS: test_companion_protocol\n");
}

void test_signal_capture(void) {
    Config cfg;
    Config_set_defaults(&cfg);
    cfg.calibration_duration_ms = 100;
    cfg.calibration_min_samples = 300;

    static HitDetector hd;
    HitDetector_init(&hd, &cfg);

    /* Complete calibration first */
    HitDetector_start_calibration(&hd);
    uint16_t quiet_samples[300];
    for (int t = 0; t < 100; ++t) {
        quiet_samples[t * 3 + 0] = (uint16_t)(1980 + (t % 3));
        quiet_samples[t * 3 + 1] = (uint16_t)(1500 + (t % 3));
        quiet_samples[t * 3 + 2] = (uint16_t)(2200 + (t % 3));
    }
    HitEvent ev;
    HitDetector_process_buffer(&hd, quiet_samples, 300, &ev);
    s_mock_time_us += 120000;
    HitDetector_process_buffer(&hd, quiet_samples, 300, &ev);
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_ARMED);

    /* -------------------------------------------------------------
     * Test 1: Single Target Capture (Target 1, 5:1 decimation)
     * ------------------------------------------------------------- */
    assert(HitDetector_start_capture(&hd, 1) == true);
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_CAPTURE_ARMED);
    assert(hd.capture.effective_sample_rate_hz == 10000);
    assert(hd.capture.pre_samples == SIGNAL_CAPTURE_PRE_SAMPLES);

    /* Feed 300-sample buffers (100 triplets = 100 samples for sensor 1 = 20 decimated samples per buffer) */
    uint16_t raw_buf[300];
    MsgCaptureReady ready;
    for (int b = 0; b < 60; ++b) {
        for (int t = 0; t < 100; ++t) {
            raw_buf[t * 3 + 0] = 1980;
            raw_buf[t * 3 + 1] = (uint16_t)(1500 + (b % 5));
            raw_buf[t * 3 + 2] = 2200;
        }
        assert(HitDetector_process_buffer(&hd, raw_buf, 300, &ev) == false);
        assert(HitDetector_get_state(&hd) == SENSOR_STATE_CAPTURE_ARMED);
        assert(HitDetector_take_completed_capture(&hd, &ready) == false);
    }
    assert(hd.capture.pre_ring_filled == SIGNAL_CAPTURE_PRE_SAMPLES);

    /* Inject a hit spike on Target 1 (2500 at triplet 2) */
    for (int t = 0; t < 100; ++t) {
        raw_buf[t * 3 + 0] = 1980;
        raw_buf[t * 3 + 1] = 1500;
        raw_buf[t * 3 + 2] = 2200;
    }
    raw_buf[2 * 3 + 1] = 2500; /* Target 1 spike */
    assert(HitDetector_process_buffer(&hd, raw_buf, 300, &ev) == false);
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_CAPTURING);
    assert(HitDetector_take_completed_capture(&hd, &ready) == false);

    const uint16_t* captured = SignalCapture_get_samples(&hd.capture);
    assert(captured[SIGNAL_CAPTURE_PRE_SAMPLES] == 2500);

    /* Feed remaining post-trigger samples (20,000 total post-trigger; 20 written in trigger buffer) */
    for (int t = 0; t < 100; ++t) {
        raw_buf[t * 3 + 0] = 1980;
        raw_buf[t * 3 + 1] = 1502;
        raw_buf[t * 3 + 2] = 2200;
    }
    int buffers_needed = (SIGNAL_CAPTURE_POST_SAMPLES - 20) / 20;
    for (int b = 0; b < buffers_needed; ++b) {
        HitDetector_process_buffer(&hd, raw_buf, 300, &ev);
        if (b < buffers_needed - 1) {
            assert(HitDetector_take_completed_capture(&hd, &ready) == false);
        } else {
            assert(HitDetector_take_completed_capture(&hd, &ready) == true);
            assert(ready.total_samples == SIGNAL_CAPTURE_TOTAL_SAMPLES);
            assert(ready.target == 1);
            assert(ready.samples == captured);
            assert(HitDetector_get_state(&hd) == SENSOR_STATE_CAPTURE_TX_WAIT);
        }
    }
    HitDetector_stop_capture(&hd);
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_ARMED);

    /* -------------------------------------------------------------
     * Test 2: All Targets Capture (TARGET_ALL, 15:1 decimation per sensor)
     * ------------------------------------------------------------- */
    assert(HitDetector_start_capture(&hd, CAPTURE_TARGET_ALL) == true);
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_CAPTURE_ARMED);
    assert(hd.capture.effective_sample_rate_hz == 10000);
    assert(hd.capture.pre_samples == SIGNAL_CAPTURE_PRE_SAMPLES_ALL);

    /* Feed buffers: each 300-sample buffer has 100 triplets. 100 / 15 = 6 triplets emitted per buffer */
    /* Feed 60 buffers to wrap around pre_ring (999 samples) */
    for (int b = 0; b < 60; ++b) {
        for (int t = 0; t < 100; ++t) {
            raw_buf[t * 3 + 0] = 1980;
            raw_buf[t * 3 + 1] = 1500;
            raw_buf[t * 3 + 2] = 2200;
        }
        assert(HitDetector_process_buffer(&hd, raw_buf, 300, &ev) == false);
    }
    assert(hd.capture.pre_ring_filled == SIGNAL_CAPTURE_PRE_SAMPLES_ALL);

    /* Trigger on Sensor 2 (triplet 5) */
    raw_buf[5 * 3 + 2] = 3100;
    assert(HitDetector_process_buffer(&hd, raw_buf, 300, &ev) == false);
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_CAPTURING);

    /* Captured trigger triplet starts at index 999: S0=1980, S1=1500, S2=3100 */
    assert(captured[SIGNAL_CAPTURE_PRE_SAMPLES_ALL + 0] == 1980);
    assert(captured[SIGNAL_CAPTURE_PRE_SAMPLES_ALL + 1] == 1500);
    assert(captured[SIGNAL_CAPTURE_PRE_SAMPLES_ALL + 2] == 3100);

    /* Stop capture */
    HitDetector_stop_capture(&hd);
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_ARMED);

    printf("PASS: test_signal_capture\n");
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

void test_display_presenter_capturing(void) {
    DisplayPresenter dp;
    DisplayPresenter_init(&dp);

    /* Transition to CAPTURING state with target = 0 */
    Core0ToCore1Message state_msg = {
        .type = MSG_GAME_STATE_CHANGED,
        .timestamp_us = 1000,
        .data.game_state = { .old_state = GAME_STATE_READY, .new_state = GAME_STATE_CAPTURING }
    };
    DisplayPresenter_handle_message(&dp, &state_msg);

    Core0ToCore1Message sensor_msg = {
        .type = MSG_SENSOR_STATUS_CHANGED,
        .timestamp_us = 1000,
        .data.sensor_status = { .state = SENSOR_STATE_CAPTURE_ARMED, .target = 0 }
    };
    DisplayPresenter_handle_message(&dp, &sensor_msg);

    DisplayPresenter_render(&dp);
    bool found_sensor_0 = false;
    for (int i = 0; i < s_display_string_count; i++) {
        if (strcmp(s_last_display_strings[i], "Sensor: 0") == 0) found_sensor_0 = true;
    }
    assert(found_sensor_0);

    /* Target 1 */
    sensor_msg.data.sensor_status.target = 1;
    DisplayPresenter_handle_message(&dp, &sensor_msg);
    DisplayPresenter_render(&dp);
    bool found_sensor_1 = false;
    for (int i = 0; i < s_display_string_count; i++) {
        if (strcmp(s_last_display_strings[i], "Sensor: 1") == 0) found_sensor_1 = true;
    }
    assert(found_sensor_1);

    /* Target 2 */
    sensor_msg.data.sensor_status.target = 2;
    DisplayPresenter_handle_message(&dp, &sensor_msg);
    DisplayPresenter_render(&dp);
    bool found_sensor_2 = false;
    for (int i = 0; i < s_display_string_count; i++) {
        if (strcmp(s_last_display_strings[i], "Sensor: 2") == 0) found_sensor_2 = true;
    }
    assert(found_sensor_2);

    /* Target ALL (3) -> "Sensor: alle" */
    sensor_msg.data.sensor_status.target = 3;
    DisplayPresenter_handle_message(&dp, &sensor_msg);
    DisplayPresenter_render(&dp);
    bool found_sensor_all = false;
    for (int i = 0; i < s_display_string_count; i++) {
        if (strcmp(s_last_display_strings[i], "Sensor: alle") == 0) found_sensor_all = true;
    }
    assert(found_sensor_all);

    printf("PASS: test_display_presenter_capturing\n");
}

void test_ignored_sensor_calibration_and_detection(void) {
    Config cfg;
    Config_set_defaults(&cfg);
    cfg.calibration_duration_ms = 100;
    cfg.calibration_min_samples = 300; /* 100 per sensor */
    cfg.min_threshold_delta = 25;
    cfg.lockout_duration_ms = 100;

    HitDetector hd;
    HitDetector_init(&hd, &cfg);
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_INIT);

    /* Sensor 0: healthy (~1980)
     * Sensor 1: disconnected/dead (baseline ~50 < config.min_baseline_for_active_sensor)
     * Sensor 2: healthy (~2200)
     */
    uint16_t samples[384];
    for (int t = 0; t < 128; ++t) {
        samples[t * 3 + 0] = 1980 + (t % 3);
        samples[t * 3 + 1] = 50 + (t % 2); /* < 128 */
        samples[t * 3 + 2] = 2200 + (t % 3);
    }

    HitEvent ev;
    HitDetector_process_buffer(&hd, samples, 384, &ev);
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_CALIBRATING);

    s_mock_time_us += 120000;
    HitDetector_process_buffer(&hd, samples, 384, &ev);
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_ARMED);

    /* Verify ignored sensor flags */
    assert(HitDetector_is_sensor_ignored(&hd, 0) == false);
    assert(HitDetector_is_sensor_ignored(&hd, 1) == true);
    assert(HitDetector_is_sensor_ignored(&hd, 2) == false);

    /* Try to hit sensor 1 (ignored sensor) with a huge peak */
    uint16_t hit_samples[384];
    for (int t = 0; t < 128; ++t) {
        hit_samples[t * 3 + 0] = 1980;
        hit_samples[t * 3 + 1] = 50;
        hit_samples[t * 3 + 2] = 2200;
    }
    hit_samples[2 * 3 + 1] = 3000; /* Huge spike on ignored sensor 1 */

    bool hit = HitDetector_process_buffer(&hd, hit_samples, 384, &ev);
    assert(hit == false); /* Ignored sensor MUST NOT trigger hit! */
    assert(HitDetector_get_state(&hd) == SENSOR_STATE_ARMED);

    /* Now hit active sensor 0 (peak 2500) while ignored sensor 1 has an even larger crosstalk spike (3500) */
    hit_samples[2 * 3 + 0] = 2500;
    hit_samples[2 * 3 + 1] = 3500; /* Ignored sensor has higher amplitude */
    hit = HitDetector_process_buffer(&hd, hit_samples, 384, &ev);
    assert(hit == true);
    assert(ev.sensor_id == 0); /* Winner MUST be sensor 0, NOT the ignored sensor 1 */
    assert(ev.peak_value == 2500);

    /* Test companion protocol CALIB message output formatting with ignored */
    CompanionProtocol cp;
    OsalQueue q_dummy;
    OsalQueue_init(&q_dummy, NULL, sizeof(Core1ToCore0Message), 16);
    CommandHandler ch_dummy;
    CommandHandler_init(&ch_dummy, &q_dummy);
    CompanionProtocol_init(&cp, &ch_dummy);

    Core0ToCore1Message calib_msg_active = {
        .type = MSG_CALIBRATION_RESULT,
        .timestamp_us = 1000,
        .data.calibration_result = {
            .sensor_id = 0,
            .success = true,
            .baseline = 1980,
            .noise = 2,
            .threshold = 2005,
            .ignored = false
        }
    };
    CompanionProtocol_send_message(&cp, &calib_msg_active);
    assert(strcmp(s_last_serial_line, "CALIB success=1 target=0 repeated=false baseline=1980 noise=2 threshold=2005 ignored=false") == 0);

    Core0ToCore1Message calib_msg_ignored = {
        .type = MSG_CALIBRATION_RESULT,
        .timestamp_us = 1000,
        .data.calibration_result = {
            .sensor_id = 1,
            .success = true,
            .baseline = 50,
            .noise = 1,
            .threshold = 75,
            .ignored = true
        }
    };
    CompanionProtocol_send_message(&cp, &calib_msg_ignored);
    assert(strcmp(s_last_serial_line, "CALIB success=1 target=1 repeated=false baseline=50 noise=1 threshold=75 ignored=true") == 0);

    printf("PASS: test_ignored_sensor_calibration_and_detection\n");
}

static size_t build_binary_frame(uint8_t* out_buf, uint8_t msg_type, uint8_t flags, const void* payload, uint16_t payload_len, uint16_t seq_id) {
    BinaryHeader* hdr = (BinaryHeader*)out_buf;
    hdr->sync = BINARY_SYNC_WORD;
    hdr->version_flags = BINARY_PACK_VER_FLAGS(PROTOCOL_VERSION, flags);
    hdr->msg_type = msg_type;
    hdr->payload_len = payload_len;
    hdr->seq_id = seq_id;

    if (payload && payload_len > 0) {
        memcpy(out_buf + sizeof(BinaryHeader), payload, payload_len);
    }

    uint16_t crc = crc16_ccitt(out_buf, sizeof(BinaryHeader) + payload_len);
    out_buf[sizeof(BinaryHeader) + payload_len] = (uint8_t)(crc & 0xFFU);
    out_buf[sizeof(BinaryHeader) + payload_len + 1] = (uint8_t)((crc >> 8) & 0xFFU);

    return sizeof(BinaryHeader) + payload_len + 2;
}

void test_binary_crc16(void) {
    /* Test standard CCITT vector "123456789" */
    const uint8_t test_vec[] = "123456789";
    uint16_t crc = crc16_ccitt(test_vec, 9);
    assert(crc == 0x29B1);
    assert(crc16_ccitt_verify(test_vec, 9, 0x29B1));
    assert(!crc16_ccitt_verify(test_vec, 9, 0x0000));

    /* Test incremental byte-by-byte update */
    uint16_t running_crc = 0xFFFFU;
    for (size_t i = 0; i < 9; ++i) {
        running_crc = crc16_ccitt_update(running_crc, test_vec[i]);
    }
    assert(running_crc == 0x29B1);

    /* Test piecewise partial buffer computation */
    uint16_t part_crc = crc16_ccitt(test_vec, 4);
    part_crc = crc16_ccitt_partial(part_crc, test_vec + 4, 5);
    assert(part_crc == 0x29B1);

    /* Test empty buffer */
    assert(crc16_ccitt(NULL, 0) == 0xFFFFU);
    assert(crc16_ccitt_verify(NULL, 0, 0xFFFFU));

    printf("PASS: test_binary_crc16\n");
}

void test_binary_framing_constants_and_structs(void) {
    assert(BINARY_SYNC_WORD == 0xAA55U);
    assert(PROTOCOL_VERSION == 1U);
    assert(PROTO_VERSION_MAJOR == 1U);
    assert(PROTO_VERSION_MINOR == 0U);
    assert(FW_VERSION_MAJOR == 1U);
    assert(FW_VERSION_MINOR == 2U);
    assert(FW_VERSION_PATCH == 0U);
    assert(HARDWARE_GEN == 1U);
    assert(HARDWARE_REV == 1U);

    assert(sizeof(BinaryHeader) == 8);
    assert(sizeof(CmdHandshakePayload) == 8);
    assert(sizeof(CmdSetModePayload) == 1);
    assert(sizeof(CmdSetParameterPayload) == 4);
    assert(sizeof(CmdSetSensitivityPayload) == 4);
    assert(sizeof(CmdCapturePayload) == 2);
    assert(sizeof(MsgHandshakeAckPayload) == 20);
    assert(sizeof(MsgSensorStatusPayload) == 2);
    assert(sizeof(MsgCalibrationResultPayload) == 8);
    assert(sizeof(MsgHitDetectedPayload) == 16);
    assert(sizeof(MsgGameStatePayload) == 2);
    assert(sizeof(MsgGameModePayload) == 8);
    assert(sizeof(MsgScorePayload) == 4);
    assert(sizeof(MsgTimerPayload) == 8);
    assert(sizeof(MsgGameFinishedPayload) == 9);
    assert(sizeof(MsgCaptureStartPayload) == 9);
    assert(sizeof(MsgCaptureDataHeader) == 4);
    assert(sizeof(MsgCaptureEndPayload) == 2);
    assert(sizeof(MsgErrorHeader) == 7);

    assert(BINARY_PACK_VER_FLAGS(1, 0) == 0x01);
    assert(BINARY_PACK_VER_FLAGS(1, 1) == 0x11);
    assert(BINARY_GET_VERSION(0x11) == 1);
    assert(BINARY_GET_FLAGS(0x11) == 1);

    printf("PASS: test_binary_framing_constants_and_structs\n");
}

void test_binary_handshake(void) {
    OsalQueue q_to_core0;
    OsalQueue_init(&q_to_core0, NULL, sizeof(Core1ToCore0Message), 16);
    CommandHandler ch;
    CommandHandler_init(&ch, &q_to_core0);
    CompanionProtocol cp;
    CompanionProtocol_init(&cp, &ch);

    assert(cp.tx_encoding == PROTOCOL_ENCODING_ASCII);

    /* 1. Send valid CMD_HANDSHAKE with TLV_MODE set */
    CmdHandshakePayload hs = {
        .client_proto_major = 1,
        .client_proto_minor = 0,
        .flags = HANDSHAKE_FLAG_TLV_MODE,
        .client_nonce = 0xCAFEBABE
    };
    uint8_t frame[64];
    size_t frame_len = build_binary_frame(frame, CMD_HANDSHAKE, 0, &hs, sizeof(hs), 1);

    s_last_serial_bytes_len = 0;
    CompanionProtocol_feed_bytes(&cp, frame, frame_len);

    /* Verify encoding toggled to binary */
    assert(cp.tx_encoding == PROTOCOL_ENCODING_BINARY);
    assert(cp.active_client_nonce == 0xCAFEBABE);

    /* Verify MSG_HANDSHAKE_ACK written to serial */
    assert(s_last_serial_bytes_len == sizeof(BinaryHeader) + sizeof(MsgHandshakeAckPayload) + 2);
    const BinaryHeader* ack_hdr = (const BinaryHeader*)s_last_serial_bytes;
    assert(ack_hdr->sync == BINARY_SYNC_WORD);
    assert(BINARY_GET_VERSION(ack_hdr->version_flags) == PROTOCOL_VERSION);
    assert(ack_hdr->msg_type == MSG_HANDSHAKE_ACK);
    assert(ack_hdr->payload_len == sizeof(MsgHandshakeAckPayload));

    /* Check CRC of ack frame */
    uint16_t rx_crc = (uint16_t)s_last_serial_bytes[sizeof(BinaryHeader) + sizeof(MsgHandshakeAckPayload)] |
                      ((uint16_t)s_last_serial_bytes[sizeof(BinaryHeader) + sizeof(MsgHandshakeAckPayload) + 1] << 8);
    uint16_t exp_crc = crc16_ccitt(s_last_serial_bytes, sizeof(BinaryHeader) + sizeof(MsgHandshakeAckPayload));
    assert(rx_crc == exp_crc);

    const MsgHandshakeAckPayload* ack = (const MsgHandshakeAckPayload*)(s_last_serial_bytes + sizeof(BinaryHeader));
    assert(ack->hardware_gen == 1);
    assert(ack->hardware_rev == 1);
    assert(ack->proto_major == 1);
    assert(ack->proto_minor == 0);
    assert(ack->fw_major == 1);
    assert(ack->fw_minor == 2);
    assert(ack->fw_patch == 0);
    assert(ack->status_code == HANDSHAKE_STATUS_OK);
    assert(ack->client_nonce == 0xCAFEBABE);

    /* Verify Core 0 received MSG_REQUEST_STATUS */
    Core1ToCore0Message cmd_msg;
    assert(OsalQueue_pop(&q_to_core0, &cmd_msg) == true);
    assert(cmd_msg.type == MSG_REQUEST_STATUS);

    /* 2. Version mismatch handshake */
    CmdHandshakePayload hs_bad = {
        .client_proto_major = 2,
        .client_proto_minor = 0,
        .flags = HANDSHAKE_FLAG_TLV_MODE,
        .client_nonce = 0x11223344
    };
    frame_len = build_binary_frame(frame, CMD_HANDSHAKE, 0, &hs_bad, sizeof(hs_bad), 2);
    s_last_serial_bytes_len = 0;
    CompanionProtocol_feed_bytes(&cp, frame, frame_len);

    const MsgHandshakeAckPayload* ack_bad = (const MsgHandshakeAckPayload*)(s_last_serial_bytes + sizeof(BinaryHeader));
    assert(ack_bad->status_code == HANDSHAKE_STATUS_ERR_VERSION_MISMATCH);
    assert(ack_bad->client_nonce == 0x11223344);
    /* Should NOT trigger Core 0 status request on mismatch */
    assert(OsalQueue_pop(&q_to_core0, &cmd_msg) == false);

    printf("PASS: test_binary_handshake\n");
}

void test_binary_commands(void) {
    OsalQueue q_to_core0;
    OsalQueue_init(&q_to_core0, NULL, sizeof(Core1ToCore0Message), 16);
    CommandHandler ch;
    CommandHandler_init(&ch, &q_to_core0);
    CompanionProtocol cp;
    CompanionProtocol_init(&cp, &ch);

    uint8_t frame[64];
    size_t len;
    Core1ToCore0Message msg;

    /* CMD_START */
    len = build_binary_frame(frame, CMD_START, 0, NULL, 0, 1);
    CompanionProtocol_feed_bytes(&cp, frame, len);
    assert(OsalQueue_pop(&q_to_core0, &msg) == true);
    assert(msg.type == MSG_START_GAME);

    /* CMD_RESET */
    len = build_binary_frame(frame, CMD_RESET, 0, NULL, 0, 2);
    CompanionProtocol_feed_bytes(&cp, frame, len);
    assert(OsalQueue_pop(&q_to_core0, &msg) == true);
    assert(msg.type == MSG_RESET_GAME);

    /* CMD_CALIBRATE */
    len = build_binary_frame(frame, CMD_CALIBRATE, 0, NULL, 0, 3);
    CompanionProtocol_feed_bytes(&cp, frame, len);
    assert(OsalQueue_pop(&q_to_core0, &msg) == true);
    assert(msg.type == MSG_REQUEST_CALIBRATION);

    /* CMD_STATUS */
    len = build_binary_frame(frame, CMD_STATUS, 0, NULL, 0, 4);
    CompanionProtocol_feed_bytes(&cp, frame, len);
    assert(OsalQueue_pop(&q_to_core0, &msg) == true);
    assert(msg.type == MSG_REQUEST_STATUS);

    /* CMD_SET_MODE (mode = 2 / RACE) */
    CmdSetModePayload m_payload = { .mode = 2 };
    len = build_binary_frame(frame, CMD_SET_MODE, 0, &m_payload, sizeof(m_payload), 5);
    CompanionProtocol_feed_bytes(&cp, frame, len);
    assert(OsalQueue_pop(&q_to_core0, &msg) == true);
    assert(msg.type == MSG_SET_GAME_MODE);
    assert(msg.data.set_mode.mode == GAME_MODE_RACE);

    /* CMD_SET_PARAMETER (parameter = 50) */
    CmdSetParameterPayload p_payload = { .parameter = 50 };
    len = build_binary_frame(frame, CMD_SET_PARAMETER, 0, &p_payload, sizeof(p_payload), 6);
    CompanionProtocol_feed_bytes(&cp, frame, len);
    assert(OsalQueue_pop(&q_to_core0, &msg) == true);
    assert(msg.type == MSG_SET_GAME_PARAMETER);
    assert(msg.data.set_parameter.parameter == 50);

    /* CMD_SET_SENSITIVITY (noise_factor = 4.2f) */
    CmdSetSensitivityPayload s_payload = { .noise_factor = 4.2f };
    len = build_binary_frame(frame, CMD_SET_SENSITIVITY, 0, &s_payload, sizeof(s_payload), 7);
    CompanionProtocol_feed_bytes(&cp, frame, len);
    assert(OsalQueue_pop(&q_to_core0, &msg) == true);
    assert(msg.type == MSG_SET_SENSITIVITY);
    assert(msg.data.set_sensitivity.noise_factor > 4.19f && msg.data.set_sensitivity.noise_factor < 4.21f);

    /* CMD_CAPTURE (action = 1, target = 1) */
    CmdCapturePayload c_payload = { .action = 1, .target_sensor = 1 };
    len = build_binary_frame(frame, CMD_CAPTURE, 0, &c_payload, sizeof(c_payload), 8);
    CompanionProtocol_feed_bytes(&cp, frame, len);
    assert(OsalQueue_pop(&q_to_core0, &msg) == true);
    assert(msg.type == MSG_REQUEST_CAPTURE);
    assert(msg.data.request_capture.enable == true);
    assert(msg.data.request_capture.target == 1);

    /* CMD_CAPTURE (action = 0, target = 0) */
    CmdCapturePayload c_stop = { .action = 0, .target_sensor = 0 };
    len = build_binary_frame(frame, CMD_CAPTURE, 0, &c_stop, sizeof(c_stop), 9);
    CompanionProtocol_feed_bytes(&cp, frame, len);
    assert(OsalQueue_pop(&q_to_core0, &msg) == true);
    assert(msg.type == MSG_REQUEST_CAPTURE);
    assert(msg.data.request_capture.enable == false);

    printf("PASS: test_binary_commands\n");
}

void test_binary_telemetry_emission(void) {
    CompanionProtocol cp;
    CommandHandler ch;
    CompanionProtocol_init(&cp, &ch);
    cp.tx_encoding = PROTOCOL_ENCODING_BINARY;

    /* 1. MSG_HIT_DETECTED */
    Core0ToCore1Message hit_msg = {
        .type = MSG_HIT_DETECTED,
        .timestamp_us = 1000,
        .data.hit = {
            .hit_id = 42,
            .sensor_id = 2,
            .peak_value = 2500,
            .intensity = 550,
            .timestamp_us = 99999
        }
    };
    s_last_serial_bytes_len = 0;
    CompanionProtocol_send_message(&cp, &hit_msg);
    assert(s_last_serial_bytes_len == sizeof(BinaryHeader) + sizeof(MsgHitDetectedPayload) + 2);
    const BinaryHeader* h = (const BinaryHeader*)s_last_serial_bytes;
    assert(h->sync == BINARY_SYNC_WORD);
    assert(h->msg_type == BIN_MSG_HIT_DETECTED);
    assert(h->payload_len == sizeof(MsgHitDetectedPayload));
    assert(h->seq_id == 0);
    uint16_t crc = crc16_ccitt(s_last_serial_bytes, sizeof(BinaryHeader) + sizeof(MsgHitDetectedPayload));
    uint16_t wire_crc = (uint16_t)s_last_serial_bytes[sizeof(BinaryHeader) + sizeof(MsgHitDetectedPayload)] |
                        ((uint16_t)s_last_serial_bytes[sizeof(BinaryHeader) + sizeof(MsgHitDetectedPayload) + 1] << 8);
    assert(crc == wire_crc);
    const MsgHitDetectedPayload* hp = (const MsgHitDetectedPayload*)(s_last_serial_bytes + sizeof(BinaryHeader));
    assert(hp->hit_id == 42);
    assert(hp->sensor_id == 2);
    assert(hp->peak_value == 2500);
    assert(hp->intensity == 550);
    assert(hp->timestamp_us == 99999);

    /* 2. MSG_GAME_STATE_CHANGED */
    Core0ToCore1Message state_msg = {
        .type = MSG_GAME_STATE_CHANGED,
        .timestamp_us = 1001,
        .data.game_state = {
            .old_state = GAME_STATE_READY,
            .new_state = GAME_STATE_RUNNING
        }
    };
    s_last_serial_bytes_len = 0;
    CompanionProtocol_send_message(&cp, &state_msg);
    h = (const BinaryHeader*)s_last_serial_bytes;
    assert(h->msg_type == MSG_GAME_STATE);
    assert(h->payload_len == sizeof(MsgGameStatePayload));
    assert(h->seq_id == 1);
    const MsgGameStatePayload* sp = (const MsgGameStatePayload*)(s_last_serial_bytes + sizeof(BinaryHeader));
    assert(sp->old_state == GAME_STATE_READY);
    assert(sp->new_state == GAME_STATE_RUNNING);

    /* 3. MSG_CALIBRATION_RESULT with repeated = true */
    Core0ToCore1Message cal_msg = {
        .type = MSG_CALIBRATION_RESULT,
        .timestamp_us = 1002,
        .data.calibration_result = {
            .sensor_id = 1,
            .success = true,
            .ignored = true,
            .repeated = true,
            .baseline = 1850,
            .noise = 15,
            .threshold = 1920
        }
    };
    s_last_serial_bytes_len = 0;
    CompanionProtocol_send_message(&cp, &cal_msg);
    h = (const BinaryHeader*)s_last_serial_bytes;
    assert(h->msg_type == BIN_MSG_CALIBRATION_RESULT);
    assert(h->payload_len == sizeof(MsgCalibrationResultPayload));
    assert(h->seq_id == 2);
    const MsgCalibrationResultPayload* cp_payload = (const MsgCalibrationResultPayload*)(s_last_serial_bytes + sizeof(BinaryHeader));
    assert(cp_payload->flags == (CALIBRATION_FLAG_IGNORED | CALIBRATION_FLAG_REPEATED));
    assert(cp_payload->sensor_id == 1);
    assert(cp_payload->baseline == 1850);
    assert(cp_payload->noise_span == 15);
    assert(cp_payload->threshold == 1920);

    /* 4. MSG_ERROR */
    Core0ToCore1Message err_msg = {
        .type = MSG_ERROR,
        .timestamp_us = 1003,
        .data.error = {
            .error_code = 101,
            .component = "ADC",
            .message = "DMA timeout"
        }
    };
    s_last_serial_bytes_len = 0;
    CompanionProtocol_send_message(&cp, &err_msg);
    h = (const BinaryHeader*)s_last_serial_bytes;
    assert(h->msg_type == BIN_MSG_ERROR);
    assert(BINARY_GET_FLAGS(h->version_flags) == BINARY_FLAG_IS_ERROR);
    const MsgErrorHeader* ep = (const MsgErrorHeader*)(s_last_serial_bytes + sizeof(BinaryHeader));
    assert(ep->error_code == 101);
    assert(ep->component_id == 1); /* ADC */
    assert(ep->msg_length == strlen("DMA timeout"));
    assert(memcmp(s_last_serial_bytes + sizeof(BinaryHeader) + sizeof(MsgErrorHeader), "DMA timeout", ep->msg_length) == 0);

    printf("PASS: test_binary_telemetry_emission\n");
}

void test_binary_capture_chunked_streaming(void) {
    OsalQueue q_to_core0;
    OsalQueue_init(&q_to_core0, NULL, sizeof(Core1ToCore0Message), 16);
    CommandHandler ch;
    CommandHandler_init(&ch, &q_to_core0);
    CompanionProtocol cp;
    CompanionProtocol_init(&cp, &ch);
    cp.tx_encoding = PROTOCOL_ENCODING_BINARY;

    uint16_t dummy_samples[300];
    for (int i = 0; i < 300; ++i) dummy_samples[i] = (uint16_t)(1000 + i);

    Core0ToCore1Message cap_msg = {
        .type = MSG_CAPTURE_READY,
        .timestamp_us = 1000,
        .data.capture_ready = {
            .sample_rate_hz = 10000,
            .target = 3,
            .pre_samples = 100,
            .total_samples = 300,
            .baseline = 1850,
            .noise = 10,
            .threshold = 1900,
            .samples = dummy_samples
        }
    };

    /* 1. Arm capture via MSG_CAPTURE_READY */
    s_last_serial_bytes_len = 0;
    CompanionProtocol_send_message(&cp, &cap_msg);
    assert(cp.capture_tx_active == true);
    const BinaryHeader* h = (const BinaryHeader*)s_last_serial_bytes;
    assert(h->msg_type == MSG_CAPTURE_START);
    assert(h->payload_len == sizeof(MsgCaptureStartPayload));
    const MsgCaptureStartPayload* sp = (const MsgCaptureStartPayload*)(s_last_serial_bytes + sizeof(BinaryHeader));
    assert(sp->sample_rate_hz == 10000);
    assert(sp->pre_samples == 100);
    assert(sp->total_samples == 300);
    assert(sp->target_channel == 3);

    /* 2. Tick 1: Chunk 0..127 */
    s_last_serial_bytes_len = 0;
    bool done = CompanionProtocol_tick_capture_tx(&cp);
    assert(done == false);
    h = (const BinaryHeader*)s_last_serial_bytes;
    assert(h->msg_type == MSG_CAPTURE_DATA);
    assert(h->payload_len == sizeof(MsgCaptureDataHeader) + 128 * sizeof(uint16_t));
    const MsgCaptureDataHeader* chdr1 = (const MsgCaptureDataHeader*)(s_last_serial_bytes + sizeof(BinaryHeader));
    assert(chdr1->offset == 0);
    assert(chdr1->count == 128);
    const uint16_t* s_ptr1 = (const uint16_t*)(s_last_serial_bytes + sizeof(BinaryHeader) + sizeof(MsgCaptureDataHeader));
    assert(s_ptr1[0] == 1000);
    assert(s_ptr1[127] == 1127);

    /* 3. Tick 2: Chunk 128..255 */
    s_last_serial_bytes_len = 0;
    done = CompanionProtocol_tick_capture_tx(&cp);
    assert(done == false);
    h = (const BinaryHeader*)s_last_serial_bytes;
    assert(h->msg_type == MSG_CAPTURE_DATA);
    assert(h->payload_len == sizeof(MsgCaptureDataHeader) + 128 * sizeof(uint16_t));
    const MsgCaptureDataHeader* chdr2 = (const MsgCaptureDataHeader*)(s_last_serial_bytes + sizeof(BinaryHeader));
    assert(chdr2->offset == 128);
    assert(chdr2->count == 128);

    /* 4. Tick 3: Chunk 256..299 (44 samples) + MSG_CAPTURE_END */
    s_last_serial_bytes_len = 0;
    done = CompanionProtocol_tick_capture_tx(&cp);
    assert(done == true);
    assert(cp.capture_tx_active == false);

    /* The last frame written should be MSG_CAPTURE_END */
    h = (const BinaryHeader*)s_last_serial_bytes;
    assert(h->msg_type == MSG_CAPTURE_END);
    assert(h->payload_len == sizeof(MsgCaptureEndPayload));
    const MsgCaptureEndPayload* end_p = (const MsgCaptureEndPayload*)(s_last_serial_bytes + sizeof(BinaryHeader));
    assert(end_p->total_samples == 300);

    /* Command to Core 0 to stop capture */
    Core1ToCore0Message cmd_msg;
    assert(OsalQueue_pop(&q_to_core0, &cmd_msg) == true);
    assert(cmd_msg.type == MSG_REQUEST_CAPTURE);
    assert(cmd_msg.data.request_capture.enable == false);

    printf("PASS: test_binary_capture_chunked_streaming\n");
}

void test_dual_mode_streaming_parser(void) {
    OsalQueue q_to_core0;
    OsalQueue_init(&q_to_core0, NULL, sizeof(Core1ToCore0Message), 16);
    CommandHandler ch;
    CommandHandler_init(&ch, &q_to_core0);
    CompanionProtocol cp;
    CompanionProtocol_init(&cp, &ch);

    Core1ToCore0Message msg;

    /* 1. Feed ASCII line via mock USB driver and poll_input */
    mock_serial_feed_input((const uint8_t*)"START\n", 6);
    CompanionProtocol_poll_input(&cp);
    assert(OsalQueue_pop(&q_to_core0, &msg) == true);
    assert(msg.type == MSG_START_GAME);

    /* 2. Feed Binary frame */
    uint8_t bin_frame[32];
    size_t bin_len = build_binary_frame(bin_frame, CMD_RESET, 0, NULL, 0, 10);
    mock_serial_feed_input(bin_frame, bin_len);
    CompanionProtocol_poll_input(&cp);
    assert(OsalQueue_pop(&q_to_core0, &msg) == true);
    assert(msg.type == MSG_RESET_GAME);

    /* 3. Feed ASCII line immediately followed by Binary frame */
    uint8_t combined[64];
    memcpy(combined, "MODE:TIMED\n", 11);
    size_t bin_len2 = build_binary_frame(combined + 11, CMD_STATUS, 0, NULL, 0, 11);
    mock_serial_feed_input(combined, 11 + bin_len2);
    CompanionProtocol_poll_input(&cp);

    /* First command: mode */
    assert(OsalQueue_pop(&q_to_core0, &msg) == true);
    assert(msg.type == MSG_SET_GAME_MODE);
    assert(msg.data.set_mode.mode == GAME_MODE_TIMED);

    /* Second command: status */
    assert(OsalQueue_pop(&q_to_core0, &msg) == true);
    assert(msg.type == MSG_REQUEST_STATUS);

    /* 4. Corrupted CRC frame should be discarded */
    uint8_t corrupt_frame[32];
    size_t corrupt_len = build_binary_frame(corrupt_frame, CMD_START, 0, NULL, 0, 12);
    corrupt_frame[corrupt_len - 1] ^= 0xFF; /* corrupt CRC */
    mock_serial_feed_input(corrupt_frame, corrupt_len);
    CompanionProtocol_poll_input(&cp);
    assert(OsalQueue_pop(&q_to_core0, &msg) == false);

    /* 5. Valid frame right after corrupted frame should be accepted */
    uint8_t valid_frame[32];
    size_t valid_len = build_binary_frame(valid_frame, CMD_START, 0, NULL, 0, 13);
    mock_serial_feed_input(valid_frame, valid_len);
    CompanionProtocol_poll_input(&cp);
    assert(OsalQueue_pop(&q_to_core0, &msg) == true);
    assert(msg.type == MSG_START_GAME);

    /* 6. Fragmented byte-by-byte feed */
    uint8_t frag_frame[32];
    size_t frag_len = build_binary_frame(frag_frame, CMD_CALIBRATE, 0, NULL, 0, 14);
    for (size_t i = 0; i < frag_len; ++i) {
        CompanionProtocol_feed_byte(&cp, frag_frame[i]);
    }
    assert(OsalQueue_pop(&q_to_core0, &msg) == true);
    assert(msg.type == MSG_REQUEST_CALIBRATION);

    printf("PASS: test_dual_mode_streaming_parser\n");
}

void test_pre_capture_repeated_calibration(void) {
    /* 1. Verify GameController initial calibration produces repeated = false */
    Config cfg;
    Config_set_defaults(&cfg);
    OsalQueue q0_to_q1;
    OsalQueue_init(&q0_to_q1, NULL, sizeof(Core0ToCore1Message), 16);
    GameController gc;
    GameController_init(&gc, &cfg, &q0_to_q1);

    uint16_t baselines[3] = {1800, 1850, 1900};
    uint16_t noises[3] = {10, 12, 14};
    uint16_t thresholds[3] = {1860, 1910, 1960};
    bool ignored[3] = {false, false, false};

    GameController_on_sensor_state(&gc, SENSOR_STATE_CALIBRATING, 3, baselines, noises, thresholds, ignored);
    GameController_on_sensor_state(&gc, SENSOR_STATE_ARMED, 3, baselines, noises, thresholds, ignored);

    Core0ToCore1Message msg;
    int calib_count = 0;
    while (OsalQueue_pop(&q0_to_q1, &msg)) {
        if (msg.type == MSG_CALIBRATION_RESULT) {
            calib_count++;
            assert(msg.data.calibration_result.repeated == false);
        }
    }
    assert(calib_count == SENSOR_COUNT);

    /* 2. Verify pre-capture repeated calibration emission formatting in CompanionProtocol */
    CompanionProtocol cp;
    CommandHandler ch;
    CompanionProtocol_init(&cp, &ch);

    /* Test ASCII format includes repeated=true */
    Core0ToCore1Message rep_cal_msg = {
        .type = MSG_CALIBRATION_RESULT,
        .timestamp_us = 2000,
        .data.calibration_result = {
            .sensor_id = 2,
            .success = true,
            .ignored = false,
            .repeated = true,
            .baseline = 1880,
            .noise = 8,
            .threshold = 1925
        }
    };
    CompanionProtocol_send_message(&cp, &rep_cal_msg);
    assert(strcmp(s_last_serial_line, "CALIB success=1 target=2 repeated=true baseline=1880 noise=8 threshold=1925 ignored=false") == 0);

    /* Test Binary format has CALIBRATION_FLAG_REPEATED set */
    cp.tx_encoding = PROTOCOL_ENCODING_BINARY;
    s_last_serial_bytes_len = 0;
    CompanionProtocol_send_message(&cp, &rep_cal_msg);
    assert(s_last_serial_bytes_len == sizeof(BinaryHeader) + sizeof(MsgCalibrationResultPayload) + 2);
    const MsgCalibrationResultPayload* payload = (const MsgCalibrationResultPayload*)(s_last_serial_bytes + sizeof(BinaryHeader));
    assert((payload->flags & CALIBRATION_FLAG_REPEATED) != 0);
    assert((payload->flags & CALIBRATION_FLAG_IGNORED) == 0);
    assert(payload->sensor_id == 2);
    assert(payload->baseline == 1880);

    printf("PASS: test_pre_capture_repeated_calibration\n");
}

int main(void) {
    printf("--- Running Schlagzaehler Architecture Unit Tests ---\n");
    test_config_service();
    test_hit_detector_and_calibration();
    test_game_controller_and_modes();
    test_companion_protocol();
    test_signal_capture();
    test_button_controller_interrupts();
    test_display_presenter_capturing();
    test_ignored_sensor_calibration_and_detection();
    test_binary_crc16();
    test_binary_framing_constants_and_structs();
    test_binary_handshake();
    test_binary_commands();
    test_binary_telemetry_emission();
    test_binary_capture_chunked_streaming();
    test_dual_mode_streaming_parser();
    test_pre_capture_repeated_calibration();
    printf("--- ALL 16 ARCHITECTURE TEST SUITES PASSED! ---\n");
    return 0;
}
