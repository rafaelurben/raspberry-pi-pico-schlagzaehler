#include "CompanionProtocol.h"
#include "../../OSAL/inc/UsbSerialDriver.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

void CompanionProtocol_init(CompanionProtocol* proto, CommandHandler* handler) {
    if (!proto) return;
    proto->command_handler = handler;
    proto->capture_tx_active = false;
    proto->capture_samples = NULL;
    proto->capture_total_samples = 0;
    proto->capture_tx_offset = 0;
}

void CompanionProtocol_cancel_capture_tx(CompanionProtocol* proto) {
    if (!proto) return;
    proto->capture_tx_active = false;
    proto->capture_samples = NULL;
    proto->capture_total_samples = 0;
    proto->capture_tx_offset = 0;
}

void CompanionProtocol_parse_line(CompanionProtocol* proto, const char* line) {
    if (!proto || !proto->command_handler || !line) return;

    /* Trim leading whitespace */
    while (*line == ' ' || *line == '\t') line++;
    if (*line == '\0') return;

    if (strcmp(line, "START") == 0) {
        CommandHandler_handle_start(proto->command_handler);
    } else if (strcmp(line, "RESET") == 0) {
        CompanionProtocol_cancel_capture_tx(proto);
        CommandHandler_handle_reset(proto->command_handler);
    } else if (strcmp(line, "CALIB") == 0) {
        CompanionProtocol_cancel_capture_tx(proto);
        CommandHandler_handle_request_calibration(proto->command_handler);
    } else if (strcmp(line, "STATUS") == 0) {
        CommandHandler_handle_request_status(proto->command_handler);
    } else if (strcmp(line, "CAPTURE") == 0 || strcmp(line, "CAPTURE:START") == 0 ||
               strcmp(line, "CAPTURE:ALL") == 0 || strcmp(line, "CAPTURE:all") == 0 ||
               strcmp(line, "CAPTURE:3") == 0 || strcmp(line, "CAPTURE:START:3") == 0 ||
               strcmp(line, "CAPTURE:START:ALL") == 0 || strcmp(line, "CAPTURE:START:all") == 0) {
        CompanionProtocol_cancel_capture_tx(proto);
        CommandHandler_handle_request_capture(proto->command_handler, true, 3);
    } else if (strcmp(line, "CAPTURE:0") == 0 || strcmp(line, "CAPTURE:START:0") == 0) {
        CompanionProtocol_cancel_capture_tx(proto);
        CommandHandler_handle_request_capture(proto->command_handler, true, 0);
    } else if (strcmp(line, "CAPTURE:1") == 0 || strcmp(line, "CAPTURE:START:1") == 0) {
        CompanionProtocol_cancel_capture_tx(proto);
        CommandHandler_handle_request_capture(proto->command_handler, true, 1);
    } else if (strcmp(line, "CAPTURE:2") == 0 || strcmp(line, "CAPTURE:START:2") == 0) {
        CompanionProtocol_cancel_capture_tx(proto);
        CommandHandler_handle_request_capture(proto->command_handler, true, 2);
    } else if (strcmp(line, "CAPTURE:STOP") == 0) {
        CompanionProtocol_cancel_capture_tx(proto);
        CommandHandler_handle_request_capture(proto->command_handler, false, 0);
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
    if (!msg) return;

    char out[128];

    switch (msg->type) {
        case MSG_HIT_DETECTED:
            snprintf(out, sizeof(out), "HIT id=%lu target=%u peak=%u intensity=%u",
                     (unsigned long)msg->data.hit.hit_id,
                     (unsigned int)msg->data.hit.sensor_id,
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
            snprintf(out, sizeof(out), "CALIB success=%d target=%u baseline=%u noise=%u threshold=%u",
                     msg->data.calibration_result.success ? 1 : 0,
                     (unsigned int)msg->data.calibration_result.sensor_id,
                     msg->data.calibration_result.baseline,
                     msg->data.calibration_result.noise,
                     msg->data.calibration_result.threshold);
            UsbSerialDriver_write_line(out);
            break;

        case MSG_SENSOR_STATUS_CHANGED:
            snprintf(out, sizeof(out), "SENSOR status=%s",
                     SensorState_to_string(msg->data.sensor_status.state));
            UsbSerialDriver_write_line(out);
            if (msg->data.sensor_status.state != SENSOR_STATE_CAPTURING &&
                msg->data.sensor_status.state != SENSOR_STATE_CAPTURE_ARMED &&
                msg->data.sensor_status.state != SENSOR_STATE_TRANSMITTING) {
                CompanionProtocol_cancel_capture_tx(proto);
            }
            break;

        case MSG_CAPTURE_READY:
            snprintf(out, sizeof(out),
                     "CAPTURE_START rate=%lu pre=%u count=%u target=%u baseline=%u noise=%u threshold=%u",
                     (unsigned long)msg->data.capture_ready.sample_rate_hz,
                     msg->data.capture_ready.pre_samples,
                     msg->data.capture_ready.total_samples,
                     (unsigned int)msg->data.capture_ready.target,
                     msg->data.capture_ready.baseline,
                     msg->data.capture_ready.noise,
                     msg->data.capture_ready.threshold);
            UsbSerialDriver_write_line(out);
            if (proto && msg->data.capture_ready.samples && msg->data.capture_ready.total_samples > 0) {
                proto->capture_samples = msg->data.capture_ready.samples;
                proto->capture_total_samples = msg->data.capture_ready.total_samples;
                proto->capture_tx_offset = 0;
                proto->capture_tx_active = true;
            }
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

bool CompanionProtocol_tick_capture_tx(CompanionProtocol* proto) {
    if (!proto || !proto->capture_tx_active || !proto->capture_samples) {
        return false;
    }

    static char line[512];

    for (uint8_t l = 0; l < COMPANION_CAPTURE_LINES_PER_TICK; ++l) {
        if (proto->capture_tx_offset >= proto->capture_total_samples) {
            break;
        }

        uint16_t start = proto->capture_tx_offset;
        uint16_t remaining = proto->capture_total_samples - start;
        uint16_t chunk = (remaining > COMPANION_CAPTURE_SAMPLES_PER_LINE)
            ? COMPANION_CAPTURE_SAMPLES_PER_LINE
            : remaining;

        int pos = snprintf(line, sizeof(line), "CAPTURE_DATA offset=%u values=", start);
        for (uint16_t i = 0; i < chunk && pos > 0 && (size_t)pos < sizeof(line) - 8; ++i) {
            int written = snprintf(
                line + pos,
                sizeof(line) - (size_t)pos,
                (i == 0) ? "%u" : ",%u",
                proto->capture_samples[start + i]
            );
            if (written > 0 && (size_t)written < sizeof(line) - (size_t)pos) {
                pos += written;
            } else {
                break;
            }
        }

        UsbSerialDriver_write_line(line);
        proto->capture_tx_offset += chunk;
    }

    if (proto->capture_tx_offset >= proto->capture_total_samples) {
        snprintf(line, sizeof(line), "CAPTURE_END count=%u", proto->capture_total_samples);
        UsbSerialDriver_write_line(line);
        CompanionProtocol_cancel_capture_tx(proto);
        if (proto->command_handler) {
            CommandHandler_handle_request_capture(proto->command_handler, false, 0);
        }
        return true;
    }

    return false;
}
