#ifndef APP_COMPANION_COMMAND_HANDLER_H
#define APP_COMPANION_COMMAND_HANDLER_H

#include <stdbool.h>
#include <stdint.h>
#include "../../Common/Messages.h"
#include "../../OSAL/inc/Queue.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    OsalQueue* queue_to_core0;
} CommandHandler;

void CommandHandler_init(CommandHandler* handler, OsalQueue* queue_to_core0);

bool CommandHandler_handle_start(CommandHandler* handler);
bool CommandHandler_handle_reset(CommandHandler* handler);
bool CommandHandler_handle_set_mode(CommandHandler* handler, GameMode mode);
bool CommandHandler_handle_set_parameter(CommandHandler* handler, uint32_t param);
bool CommandHandler_handle_request_calibration(CommandHandler* handler);
bool CommandHandler_handle_request_status(CommandHandler* handler);
bool CommandHandler_handle_set_sensitivity(CommandHandler* handler, float factor);
bool CommandHandler_handle_request_capture(CommandHandler* handler, bool enable);

#ifdef __cplusplus
}
#endif

#endif /* APP_COMPANION_COMMAND_HANDLER_H */
