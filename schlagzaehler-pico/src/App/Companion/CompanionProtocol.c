#include "CompanionProtocol.h"
#include "../../OSAL/inc/UsbSerialDriver.h"
#include "../../OSAL/inc/Time.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <assert.h>

void CompanionProtocol_init(CompanionProtocol* proto, CommandHandler* handler) {
    if (!proto) return;
    proto->command_handler = handler;
    proto->tx_encoding = PROTOCOL_ENCODING_ASCII;
    proto->tx_seq_id = 0;
    proto->active_client_nonce = 0;

    proto->capture_tx_active = false;
    proto->capture_samples = NULL;
    proto->capture_total_samples = 0;
    proto->capture_tx_offset = 0;

    proto->rx_state = PARSER_STATE_IDLE;
    proto->rx_ascii_pos = 0;
    proto->rx_frame_pos = 0;
    proto->rx_expected_payload_len = 0;
    proto->rx_crc_pos = 0;
}

void CompanionProtocol_cancel_capture_tx(CompanionProtocol* proto) {
    if (!proto) return;
    proto->capture_tx_active = false;
    proto->capture_samples = NULL;
    proto->capture_total_samples = 0;
    proto->capture_tx_offset = 0;
}

static void send_binary_frame(CompanionProtocol* proto, uint8_t msg_type, uint8_t flags, const void* payload, uint16_t payload_len) {
    BinaryHeader header;
    header.sync = BINARY_SYNC_WORD;
    header.version_flags = BINARY_PACK_VER_FLAGS(PROTOCOL_VERSION, flags);
    header.msg_type = msg_type;
    header.payload_len = payload_len;
    header.seq_id = proto->tx_seq_id++;

    uint8_t frame_buf[BINARY_MAX_FRAME_LEN];
    size_t data_len = sizeof(header) + payload_len;
    size_t total_len = data_len + BINARY_FRAME_TRAILER_LEN;

    if (total_len <= sizeof(frame_buf)) {
        memcpy(frame_buf, &header, sizeof(header));
        if (payload && payload_len > 0) {
            memcpy(frame_buf + sizeof(header), payload, payload_len);
        }
        uint16_t crc = crc16_ccitt(frame_buf, data_len);
        frame_buf[data_len] = (uint8_t)(crc & 0xFFU);
        frame_buf[data_len + 1] = (uint8_t)((crc >> 8) & 0xFFU);
        UsbSerialDriver_write_bytes(frame_buf, total_len);
    } else {
        uint16_t crc = crc16_ccitt((const uint8_t*)&header, sizeof(header));
        if (payload && payload_len > 0) {
            crc = crc16_ccitt_partial(crc, (const uint8_t*)payload, payload_len);
        }
        uint8_t crc_bytes[2] = {
            (uint8_t)(crc & 0xFFU),
            (uint8_t)((crc >> 8) & 0xFFU)
        };
        UsbSerialDriver_write_bytes((const uint8_t*)&header, sizeof(header));
        if (payload && payload_len > 0) {
            UsbSerialDriver_write_bytes((const uint8_t*)payload, payload_len);
        }
        UsbSerialDriver_write_bytes(crc_bytes, sizeof(crc_bytes));
    }
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

void CompanionProtocol_parse_binary_frame(CompanionProtocol* proto, const BinaryHeader* header, const uint8_t* payload) {
    if (!proto || !proto->command_handler || !header) return;

    switch (header->msg_type) {
        case CMD_HANDSHAKE: {
            if (header->payload_len >= sizeof(CmdHandshakePayload) && payload) {
                const CmdHandshakePayload* hs = (const CmdHandshakePayload*)payload;
                CompanionProtocol_cancel_capture_tx(proto);
                proto->active_client_nonce = hs->client_nonce;
                if (hs->flags & HANDSHAKE_FLAG_TLV_MODE) {
                    proto->tx_encoding = PROTOCOL_ENCODING_BINARY;
                } else {
                    proto->tx_encoding = PROTOCOL_ENCODING_ASCII;
                }

                uint8_t status_code = HANDSHAKE_STATUS_OK;
                if (hs->client_proto_major != PROTOCOL_VERSION) {
                    status_code = HANDSHAKE_STATUS_ERR_VERSION_MISMATCH;
                }

                MsgHandshakeAckPayload ack = {
                    .hardware_gen = HARDWARE_GEN,
                    .hardware_rev = HARDWARE_REV,
                    .proto_major = PROTO_VERSION_MAJOR,
                    .proto_minor = PROTO_VERSION_MINOR,
                    .fw_major = FW_VERSION_MAJOR,
                    .fw_minor = FW_VERSION_MINOR,
                    .fw_patch = FW_VERSION_PATCH,
                    .status_code = status_code,
                    .reserved = 0,
                    .client_nonce = hs->client_nonce,
                    .uptime_ms = Time_now_ms()
                };
                send_binary_frame(proto, MSG_HANDSHAKE_ACK, 0, &ack, sizeof(ack));

                if (status_code == HANDSHAKE_STATUS_OK) {
                    CommandHandler_handle_request_status(proto->command_handler);
                }
            }
            break;
        }

        case CMD_START:
            CommandHandler_handle_start(proto->command_handler);
            break;

        case CMD_RESET:
            CompanionProtocol_cancel_capture_tx(proto);
            CommandHandler_handle_reset(proto->command_handler);
            break;

        case CMD_CALIBRATE:
            CompanionProtocol_cancel_capture_tx(proto);
            CommandHandler_handle_request_calibration(proto->command_handler);
            break;

        case CMD_STATUS:
            CommandHandler_handle_request_status(proto->command_handler);
            break;

        case CMD_SET_MODE:
            if (header->payload_len >= sizeof(CmdSetModePayload) && payload) {
                const CmdSetModePayload* p = (const CmdSetModePayload*)payload;
                if (p->mode <= (uint8_t)GAME_MODE_RACE) {
                    CommandHandler_handle_set_mode(proto->command_handler, (GameMode)p->mode);
                }
            }
            break;

        case CMD_SET_PARAMETER:
            if (header->payload_len >= sizeof(CmdSetParameterPayload) && payload) {
                const CmdSetParameterPayload* p = (const CmdSetParameterPayload*)payload;
                CommandHandler_handle_set_parameter(proto->command_handler, p->parameter);
            }
            break;

        case CMD_SET_SENSITIVITY:
            if (header->payload_len >= sizeof(CmdSetSensitivityPayload) && payload) {
                const CmdSetSensitivityPayload* p = (const CmdSetSensitivityPayload*)payload;
                CommandHandler_handle_set_sensitivity(proto->command_handler, p->noise_factor);
            }
            break;

        case CMD_CAPTURE:
            if (header->payload_len >= sizeof(CmdCapturePayload) && payload) {
                const CmdCapturePayload* p = (const CmdCapturePayload*)payload;
                CompanionProtocol_cancel_capture_tx(proto);
                CommandHandler_handle_request_capture(proto->command_handler, p->action != 0, p->target_sensor);
            }
            break;

        default:
            break;
    }
}

void CompanionProtocol_feed_byte(CompanionProtocol* proto, uint8_t byte) {
    if (!proto) return;

    switch (proto->rx_state) {
        case PARSER_STATE_IDLE:
            if (byte == (uint8_t)(BINARY_SYNC_WORD & 0xFFU)) { /* 0x55 */
                proto->rx_state = PARSER_STATE_SYNC_1;
            } else if (byte >= 'A' && byte <= 'Z') {
                proto->rx_ascii_buf[0] = (char)byte;
                proto->rx_ascii_pos = 1;
                proto->rx_state = PARSER_STATE_ASCII_LINE;
            }
            break;

        case PARSER_STATE_SYNC_1:
            if (byte == (uint8_t)((BINARY_SYNC_WORD >> 8) & 0xFFU)) { /* 0xAA */
                proto->rx_frame_buf[0] = (uint8_t)(BINARY_SYNC_WORD & 0xFFU);
                proto->rx_frame_buf[1] = (uint8_t)((BINARY_SYNC_WORD >> 8) & 0xFFU);
                proto->rx_frame_pos = 2;
                proto->rx_state = PARSER_STATE_BINARY_HEADER;
            } else if (byte == (uint8_t)(BINARY_SYNC_WORD & 0xFFU)) {
                /* Stay in SYNC_1 */
            } else if (byte >= 'A' && byte <= 'Z') {
                proto->rx_ascii_buf[0] = (char)byte;
                proto->rx_ascii_pos = 1;
                proto->rx_state = PARSER_STATE_ASCII_LINE;
            } else {
                proto->rx_state = PARSER_STATE_IDLE;
            }
            break;

        case PARSER_STATE_ASCII_LINE:
            if (byte == '\r' || byte == '\n') {
                proto->rx_ascii_buf[proto->rx_ascii_pos] = '\0';
                CompanionProtocol_parse_line(proto, proto->rx_ascii_buf);
                proto->rx_ascii_pos = 0;
                proto->rx_state = PARSER_STATE_IDLE;
            } else if (proto->rx_ascii_pos < sizeof(proto->rx_ascii_buf) - 1) {
                proto->rx_ascii_buf[proto->rx_ascii_pos++] = (char)byte;
            } else {
                /* Buffer overflow protection */
                proto->rx_ascii_pos = 0;
                proto->rx_state = PARSER_STATE_IDLE;
            }
            break;

        case PARSER_STATE_BINARY_HEADER:
            proto->rx_frame_buf[proto->rx_frame_pos++] = byte;
            if (proto->rx_frame_pos == sizeof(BinaryHeader)) {
                const BinaryHeader* hdr = (const BinaryHeader*)proto->rx_frame_buf;
                uint8_t ver = BINARY_GET_VERSION(hdr->version_flags);
                if (ver != PROTOCOL_VERSION || hdr->payload_len > COMPANION_MAX_RX_PAYLOAD) {
                    proto->rx_state = PARSER_STATE_IDLE;
                } else if (hdr->payload_len == 0) {
                    proto->rx_expected_payload_len = 0;
                    proto->rx_crc_pos = 0;
                    proto->rx_state = PARSER_STATE_BINARY_CRC;
                } else {
                    proto->rx_expected_payload_len = hdr->payload_len;
                    proto->rx_state = PARSER_STATE_BINARY_PAYLOAD;
                }
            }
            break;

        case PARSER_STATE_BINARY_PAYLOAD:
            proto->rx_frame_buf[proto->rx_frame_pos++] = byte;
            if (proto->rx_frame_pos == sizeof(BinaryHeader) + proto->rx_expected_payload_len) {
                proto->rx_crc_pos = 0;
                proto->rx_state = PARSER_STATE_BINARY_CRC;
            }
            break;

        case PARSER_STATE_BINARY_CRC:
            proto->rx_crc_buf[proto->rx_crc_pos++] = byte;
            if (proto->rx_crc_pos == 2) {
                uint16_t rx_crc = (uint16_t)proto->rx_crc_buf[0] | ((uint16_t)proto->rx_crc_buf[1] << 8);
                if (crc16_ccitt_verify(proto->rx_frame_buf, sizeof(BinaryHeader) + proto->rx_expected_payload_len, rx_crc)) {
                    const BinaryHeader* hdr = (const BinaryHeader*)proto->rx_frame_buf;
                    const uint8_t* p = proto->rx_frame_buf + sizeof(BinaryHeader);
                    CompanionProtocol_parse_binary_frame(proto, hdr, p);
                }
                proto->rx_state = PARSER_STATE_IDLE;
            }
            break;
    }
}

void CompanionProtocol_feed_bytes(CompanionProtocol* proto, const uint8_t* data, size_t len) {
    if (!proto || !data) return;
    for (size_t i = 0; i < len; ++i) {
        CompanionProtocol_feed_byte(proto, data[i]);
    }
}

void CompanionProtocol_poll_input(CompanionProtocol* proto) {
    if (!proto) return;

    uint8_t buf[64];
    int n = UsbSerialDriver_read_bytes(buf, sizeof(buf));
    if (n > 0) {
        CompanionProtocol_feed_bytes(proto, buf, (size_t)n);
    }
}

void CompanionProtocol_send_message(CompanionProtocol* proto, const Core0ToCore1Message* msg) {
    if (!proto || !msg) return;

    if (proto->tx_encoding == PROTOCOL_ENCODING_BINARY) {
        switch (msg->type) {
            case MSG_HIT_DETECTED: {
                MsgHitDetectedPayload p = {
                    .hit_id = msg->data.hit.hit_id,
                    .peak_value = msg->data.hit.peak_value,
                    .intensity = msg->data.hit.intensity,
                    .sensor_id = msg->data.hit.sensor_id,
                    .reserved = {0, 0, 0},
                    .timestamp_us = (uint32_t)msg->data.hit.timestamp_us
                };
                send_binary_frame(proto, BIN_MSG_HIT_DETECTED, 0, &p, sizeof(p));
                break;
            }

            case MSG_GAME_STATE_CHANGED: {
                MsgGameStatePayload p = {
                    .old_state = (uint8_t)msg->data.game_state.old_state,
                    .new_state = (uint8_t)msg->data.game_state.new_state
                };
                send_binary_frame(proto, MSG_GAME_STATE, 0, &p, sizeof(p));
                break;
            }

            case MSG_GAME_MODE_CHANGED: {
                MsgGameModePayload p = {
                    .mode = (uint8_t)msg->data.game_mode.mode,
                    .reserved = {0, 0, 0},
                    .parameter = msg->data.game_mode.parameter
                };
                send_binary_frame(proto, MSG_GAME_MODE, 0, &p, sizeof(p));
                break;
            }

            case MSG_SCORE_CHANGED: {
                MsgScorePayload p = {
                    .score = msg->data.score.score
                };
                send_binary_frame(proto, MSG_SCORE, 0, &p, sizeof(p));
                break;
            }

            case MSG_TIMER_CHANGED: {
                MsgTimerPayload p = {
                    .elapsed_ms = msg->data.timer.elapsed_ms,
                    .remaining_ms = msg->data.timer.remaining_ms
                };
                send_binary_frame(proto, MSG_TIMER, 0, &p, sizeof(p));
                break;
            }

            case MSG_GAME_FINISHED: {
                MsgGameFinishedPayload p = {
                    .final_score = msg->data.game_finished.final_score,
                    .total_time_ms = msg->data.game_finished.total_time_ms,
                    .reason = (uint8_t)msg->data.game_finished.reason
                };
                send_binary_frame(proto, BIN_MSG_GAME_FINISHED, 0, &p, sizeof(p));
                break;
            }

            case MSG_CALIBRATION_RESULT: {
                uint8_t flags = 0;
                if (msg->data.calibration_result.ignored) {
                    flags |= CALIBRATION_FLAG_IGNORED;
                }
                if (msg->data.calibration_result.repeated) {
                    flags |= CALIBRATION_FLAG_REPEATED;
                }
                MsgCalibrationResultPayload p = {
                    .flags = flags,
                    .sensor_id = msg->data.calibration_result.sensor_id,
                    .baseline = msg->data.calibration_result.baseline,
                    .noise_span = msg->data.calibration_result.noise,
                    .threshold = msg->data.calibration_result.threshold
                };
                send_binary_frame(proto, BIN_MSG_CALIBRATION_RESULT, 0, &p, sizeof(p));
                break;
            }

            case MSG_SENSOR_STATUS_CHANGED: {
                MsgSensorStatusPayload p = {
                    .state = (uint8_t)msg->data.sensor_status.state,
                    .target = msg->data.sensor_status.target
                };
                send_binary_frame(proto, MSG_SENSOR_STATUS, 0, &p, sizeof(p));
                if (msg->data.sensor_status.state != SENSOR_STATE_CAPTURING &&
                    msg->data.sensor_status.state != SENSOR_STATE_CAPTURE_ARMED &&
                    msg->data.sensor_status.state != SENSOR_STATE_CAPTURE_TX_WAIT) {
                    CompanionProtocol_cancel_capture_tx(proto);
                }
                break;
            }

            case MSG_CAPTURE_READY: {
                MsgCaptureStartPayload p = {
                    .sample_rate_hz = msg->data.capture_ready.sample_rate_hz,
                    .pre_samples = msg->data.capture_ready.pre_samples,
                    .total_samples = msg->data.capture_ready.total_samples,
                    .target_channel = msg->data.capture_ready.target
                };
                send_binary_frame(proto, MSG_CAPTURE_START, 0, &p, sizeof(p));
                if (msg->data.capture_ready.samples && msg->data.capture_ready.total_samples > 0) {
                    proto->capture_samples = msg->data.capture_ready.samples;
                    proto->capture_total_samples = msg->data.capture_ready.total_samples;
                    proto->capture_tx_offset = 0;
                    proto->capture_tx_active = true;
                }
                break;
            }

            case MSG_ERROR: {
                uint8_t comp_id = 0;
                if (strcmp(msg->data.error.component, "ADC") == 0) comp_id = 1;
                else if (strcmp(msg->data.error.component, "DMA") == 0) comp_id = 2;
                else if (strcmp(msg->data.error.component, "USB") == 0) comp_id = 3;
                else if (strcmp(msg->data.error.component, "DISPLAY") == 0) comp_id = 4;

                size_t msg_len = strlen(msg->data.error.message);
                if (msg_len > 255) msg_len = 255;

                uint8_t err_buf[sizeof(MsgErrorHeader) + 256];
                MsgErrorHeader* eh = (MsgErrorHeader*)err_buf;
                eh->error_code = msg->data.error.error_code;
                eh->component_id = comp_id;
                eh->flags = 0;
                eh->msg_length = (uint8_t)msg_len;
                memcpy(err_buf + sizeof(MsgErrorHeader), msg->data.error.message, msg_len);

                send_binary_frame(proto, BIN_MSG_ERROR, BINARY_FLAG_IS_ERROR, err_buf, (uint16_t)(sizeof(MsgErrorHeader) + msg_len));
                break;
            }

            case MSG_BOOT_STATUS:
            default:
                break;
        }
        return;
    }

    /* ASCII mode */
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
            snprintf(out, sizeof(out), "CALIB success=%d target=%u repeated=%s baseline=%u noise=%u threshold=%u ignored=%s",
                     msg->data.calibration_result.success ? 1 : 0,
                     (unsigned int)msg->data.calibration_result.sensor_id,
                     msg->data.calibration_result.repeated ? "true" : "false",
                     msg->data.calibration_result.baseline,
                     msg->data.calibration_result.noise,
                     msg->data.calibration_result.threshold,
                     msg->data.calibration_result.ignored ? "true" : "false");
            UsbSerialDriver_write_line(out);
            break;

        case MSG_SENSOR_STATUS_CHANGED:
            snprintf(out, sizeof(out), "SENSOR status=%s",
                     SensorState_to_string(msg->data.sensor_status.state));
            UsbSerialDriver_write_line(out);
            if (msg->data.sensor_status.state != SENSOR_STATE_CAPTURING &&
                msg->data.sensor_status.state != SENSOR_STATE_CAPTURE_ARMED &&
                msg->data.sensor_status.state != SENSOR_STATE_CAPTURE_TX_WAIT) {
                CompanionProtocol_cancel_capture_tx(proto);
            }
            break;

        case MSG_CAPTURE_READY:
            snprintf(out, sizeof(out),
                     "CAPTURE_START rate=%lu pre=%u count=%u target=%u",
                     (unsigned long)msg->data.capture_ready.sample_rate_hz,
                     msg->data.capture_ready.pre_samples,
                     msg->data.capture_ready.total_samples,
                     (unsigned int)msg->data.capture_ready.target);
            UsbSerialDriver_write_line(out);
            if (msg->data.capture_ready.samples && msg->data.capture_ready.total_samples > 0) {
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

static_assert(sizeof(MsgCaptureDataHeader) + COMPANION_CAPTURE_BINARY_SAMPLES_PER_CHUNK * sizeof(uint16_t) <= BINARY_MAX_PAYLOAD_LEN,
              "Capture chunk payload exceeds BINARY_MAX_PAYLOAD_LEN");

bool CompanionProtocol_tick_capture_tx(CompanionProtocol* proto) {
    if (!proto || !proto->capture_tx_active || !proto->capture_samples) {
        return false;
    }

    if (proto->tx_encoding == PROTOCOL_ENCODING_BINARY) {
        if (proto->capture_tx_offset < proto->capture_total_samples) {
            uint16_t start = proto->capture_tx_offset;
            uint16_t remaining = proto->capture_total_samples - start;
            uint16_t chunk = (remaining > COMPANION_CAPTURE_BINARY_SAMPLES_PER_CHUNK)
                ? COMPANION_CAPTURE_BINARY_SAMPLES_PER_CHUNK
                : remaining;

            uint8_t payload[sizeof(MsgCaptureDataHeader) + COMPANION_CAPTURE_BINARY_SAMPLES_PER_CHUNK * sizeof(uint16_t)];
            MsgCaptureDataHeader* hdr = (MsgCaptureDataHeader*)payload;
            hdr->offset = start;
            hdr->count = chunk;
            memcpy(payload + sizeof(MsgCaptureDataHeader), &proto->capture_samples[start], chunk * sizeof(uint16_t));

            send_binary_frame(proto, MSG_CAPTURE_DATA, 0, payload, (uint16_t)(sizeof(MsgCaptureDataHeader) + chunk * sizeof(uint16_t)));
            proto->capture_tx_offset += chunk;
        }

        if (proto->capture_tx_offset >= proto->capture_total_samples) {
            MsgCaptureEndPayload end_payload = {
                .total_samples = proto->capture_total_samples
            };
            send_binary_frame(proto, MSG_CAPTURE_END, 0, &end_payload, sizeof(end_payload));
            CompanionProtocol_cancel_capture_tx(proto);
            if (proto->command_handler) {
                CommandHandler_handle_request_capture(proto->command_handler, false, 0);
            }
            return true;
        }
        return false;
    }

    /* ASCII mode */
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
