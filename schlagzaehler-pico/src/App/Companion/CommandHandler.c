#include "CommandHandler.h"
#include "../../OSAL/inc/Time.h"

void CommandHandler_init(CommandHandler* handler, OsalQueue* queue_to_core0) {
    if (!handler) return;
    handler->queue_to_core0 = queue_to_core0;
}

static bool send_cmd(CommandHandler* handler, const Core1ToCore0Message* msg) {
    if (!handler || !handler->queue_to_core0) return false;
    return OsalQueue_push(handler->queue_to_core0, msg);
}

bool CommandHandler_handle_start(CommandHandler* handler) {
    Core1ToCore0Message msg = {
        .type = MSG_START_GAME,
        .timestamp_us = Time_now_us()
    };
    return send_cmd(handler, &msg);
}

bool CommandHandler_handle_reset(CommandHandler* handler) {
    Core1ToCore0Message msg = {
        .type = MSG_RESET_GAME,
        .timestamp_us = Time_now_us()
    };
    return send_cmd(handler, &msg);
}

bool CommandHandler_handle_set_mode(CommandHandler* handler, GameMode mode) {
    Core1ToCore0Message msg = {
        .type = MSG_SET_GAME_MODE,
        .timestamp_us = Time_now_us(),
        .data.set_mode.mode = mode
    };
    return send_cmd(handler, &msg);
}

bool CommandHandler_handle_set_parameter(CommandHandler* handler, uint32_t param) {
    Core1ToCore0Message msg = {
        .type = MSG_SET_GAME_PARAMETER,
        .timestamp_us = Time_now_us(),
        .data.set_parameter.parameter = param
    };
    return send_cmd(handler, &msg);
}

bool CommandHandler_handle_request_calibration(CommandHandler* handler) {
    Core1ToCore0Message msg = {
        .type = MSG_REQUEST_CALIBRATION,
        .timestamp_us = Time_now_us()
    };
    return send_cmd(handler, &msg);
}

bool CommandHandler_handle_request_status(CommandHandler* handler) {
    Core1ToCore0Message msg = {
        .type = MSG_REQUEST_STATUS,
        .timestamp_us = Time_now_us()
    };
    return send_cmd(handler, &msg);
}

bool CommandHandler_handle_set_sensitivity(CommandHandler* handler, float factor) {
    Core1ToCore0Message msg = {
        .type = MSG_SET_SENSITIVITY,
        .timestamp_us = Time_now_us(),
        .data.set_sensitivity.noise_factor = factor
    };
    return send_cmd(handler, &msg);
}

bool CommandHandler_handle_request_capture(CommandHandler* handler, bool enable, uint8_t target) {
    Core1ToCore0Message msg = {
        .type = MSG_REQUEST_CAPTURE,
        .timestamp_us = Time_now_us(),
        .data.request_capture = {
            .enable = enable,
            .target = target
        }
    };
    return send_cmd(handler, &msg);
}
