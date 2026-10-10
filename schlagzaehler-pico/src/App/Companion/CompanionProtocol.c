#include "CompanionProtocol.h"
#include "../../Drivers/UsbSerialDriver.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

void CompanionProtocol_init(CompanionProtocol* proto, CommandHandler* handler) {
    if (!proto) return;
    proto->command_handler = handler;
}

void CompanionProtocol_parse_line(CompanionProtocol* proto, const char* line) {
    if (!proto || !proto->command_handler || !line) return;

    /* Trim leading whitespace */
    while (*line == ' ' || *line == '\t') line++;
    if (*line == '\0') return;

    if (strcmp(line, "START") == 0) {
        CommandHandler_handle_start(proto->command_handler);
    } else if (strcmp(line, "RESET") == 0) {
        CommandHandler_handle_reset(proto->command_handler);
    } else if (strcmp(line, "CALIB") == 0) {
        CommandHandler_handle_request_calibration(proto->command_handler);
    } else if (strcmp(line, "STATUS") == 0) {
        CommandHandler_handle_request_status(proto->command_handler);
    } else if (strncmp(line, "MODE:", 5) == 0) {
        const char* val = line + 5;
        if (strcmp(val, "COUNT") == 0 || strcmp(val, "0") == 0) {
            CommandHandler_handle_set_mode(proto->command_handler, GAME_MODE_COUNT);
        } else if (strcmp(val, "TIMED") == 0 || strcmp(val, "1") == 0) {
            CommandHandler_handle_set_mode(proto->command_handler, GAME_MODE_TIMED);
        } else if (strcmp(val, "RACE") == 0 || strcmp(val, "2") == 0) {
            CommandHandler_handle_set_mode(proto->command_handler, GAME_MODE_RACE);
        }
    } else if (strncmp(line, "PARAM:", 6) == 0) {
        long p = strtol(line + 6, NULL, 10);
        if (p > 0) {
            CommandHandler_handle_set_parameter(proto->command_handler, (uint32_t)p);
        }
    } else if (strncmp(line, "SENS:", 5) == 0) {
        float f = strtof(line + 5, NULL);
        if (f > 0.0f) {
            CommandHandler_handle_set_sensitivity(proto->command_handler, f);
        }
    }
}

void CompanionProtocol_poll_input(CompanionProtocol* proto) {
    if (!proto) return;

    char line_buf[128];
    int len = UsbSerialDriver_read_line(line_buf, sizeof(line_buf));
    if (len > 0) {
        CompanionProtocol_parse_line(proto, line_buf);
    }
}

void CompanionProtocol_send_message(CompanionProtocol* proto, const Core0ToCore1Message* msg) {
    (void)proto;
    if (!msg) return;

    char out[128];

    switch (msg->type) {
        case MSG_HIT_DETECTED:
            snprintf(out, sizeof(out), "HIT id=%lu peak=%u intensity=%u",
                     (unsigned long)msg->data.hit.hit_id,
                     msg->data.hit.peak_value,
                     msg->data.hit.intensity);
            UsbSerialDriver_write_line(out);
            break;

        case MSG_GAME_STATE_CHANGED:
            snprintf(out, sizeof(out), "STATE old=%s new=%s",
                     GameState_to_string(msg->data.game_state.old_state),
                     GameState_to_string(msg->data.game_state.new_state));
            UsbSerialDriver_write_line(out);
            break;

        case MSG_GAME_MODE_CHANGED:
            snprintf(out, sizeof(out), "MODE active=%s param=%lu",
                     GameMode_to_string(msg->data.game_mode.mode),
                     (unsigned long)msg->data.game_mode.parameter);
            UsbSerialDriver_write_line(out);
            break;

        case MSG_SCORE_CHANGED:
            snprintf(out, sizeof(out), "SCORE value=%lu",
                     (unsigned long)msg->data.score.score);
            UsbSerialDriver_write_line(out);
            break;

        case MSG_TIMER_CHANGED:
            snprintf(out, sizeof(out), "TIMER elapsed=%lu remaining=%lu",
                     (unsigned long)msg->data.timer.elapsed_ms,
                     (unsigned long)msg->data.timer.remaining_ms);
            UsbSerialDriver_write_line(out);
            break;

        case MSG_GAME_FINISHED:
            snprintf(out, sizeof(out), "RESULT score=%lu time_ms=%lu reason=%s",
                     (unsigned long)msg->data.game_finished.final_score,
                     (unsigned long)msg->data.game_finished.total_time_ms,
                     GameEndReason_to_string(msg->data.game_finished.reason));
            UsbSerialDriver_write_line(out);
            break;

        case MSG_CALIBRATION_RESULT:
            snprintf(out, sizeof(out), "CALIB success=%d baseline=%u noise=%u threshold=%u",
                     msg->data.calibration_result.success ? 1 : 0,
                     msg->data.calibration_result.baseline,
                     msg->data.calibration_result.noise,
                     msg->data.calibration_result.threshold);
            UsbSerialDriver_write_line(out);
            break;

        case MSG_SENSOR_STATUS_CHANGED:
            snprintf(out, sizeof(out), "SENSOR status=%s",
                     SensorState_to_string(msg->data.sensor_status.state));
            UsbSerialDriver_write_line(out);
            break;

        case MSG_BOOT_STATUS:
            snprintf(out, sizeof(out), "BOOT success=%d msg=%s",
                     msg->data.boot_status.success ? 1 : 0,
                     msg->data.boot_status.message);
            UsbSerialDriver_write_line(out);
            break;

        case MSG_ERROR:
            snprintf(out, sizeof(out), "ERROR code=%lu comp=%s msg=%s",
                     (unsigned long)msg->data.error.error_code,
                     msg->data.error.component,
                     msg->data.error.message);
            UsbSerialDriver_write_line(out);
            break;

        default:
            break;
    }
}
