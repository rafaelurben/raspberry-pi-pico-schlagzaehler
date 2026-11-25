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

/**
 * @brief Initialize the command handler with the inter-core queue to Core 0.
 * @param handler Pointer to CommandHandler instance.
 * @param queue_to_core0 Pointer to the inter-core message queue targeting Core 0.
 */
void CommandHandler_init(CommandHandler* handler, OsalQueue* queue_to_core0);

/**
 * @brief Forward a start game command to Core 0.
 * @param handler Pointer to CommandHandler instance.
 * @return true if command was successfully enqueued to Core 0, false otherwise.
 */
bool CommandHandler_handle_start(CommandHandler* handler);

/**
 * @brief Forward a reset game command to Core 0.
 * @param handler Pointer to CommandHandler instance.
 * @return true if command was successfully enqueued to Core 0, false otherwise.
 */
bool CommandHandler_handle_reset(CommandHandler* handler);

/**
 * @brief Forward a set game mode command to Core 0.
 * @param handler Pointer to CommandHandler instance.
 * @param mode Game mode to activate.
 * @return true if command was successfully enqueued to Core 0, false otherwise.
 */
bool CommandHandler_handle_set_mode(CommandHandler* handler, GameMode mode);

/**
 * @brief Forward a set game parameter command (duration in s or target hits) to Core 0.
 * @param handler Pointer to CommandHandler instance.
 * @param param Parameter value for current/selected mode.
 * @return true if command was successfully enqueued to Core 0, false otherwise.
 */
bool CommandHandler_handle_set_parameter(CommandHandler* handler, uint32_t param);

/**
 * @brief Forward a sensor recalibration request to Core 0.
 * @param handler Pointer to CommandHandler instance.
 * @return true if command was successfully enqueued to Core 0, false otherwise.
 */
bool CommandHandler_handle_request_calibration(CommandHandler* handler);

/**
 * @brief Forward a status telemetry request to Core 0.
 * @param handler Pointer to CommandHandler instance.
 * @return true if command was successfully enqueued to Core 0, false otherwise.
 */
bool CommandHandler_handle_request_status(CommandHandler* handler);

/**
 * @brief Forward a sensitivity noise-factor adjustment command to Core 0.
 * @param handler Pointer to CommandHandler instance.
 * @param factor Noise multiplier factor.
 * @return true if command was successfully enqueued to Core 0, false otherwise.
 */
bool CommandHandler_handle_set_sensitivity(CommandHandler* handler, float factor);

/**
 * @brief Forward a raw signal capture action (start/trigger/stop) to Core 0.
 * @param handler Pointer to CommandHandler instance.
 * @param action Capture action to execute.
 * @param target Sensor channel target (0, 1, 2, or 255 for ALL).
 * @return true if command was successfully enqueued to Core 0, false otherwise.
 */
bool CommandHandler_handle_request_capture_action(CommandHandler* handler, CaptureAction action, uint8_t target);

#ifdef __cplusplus
}
#endif

#endif /* APP_COMPANION_COMMAND_HANDLER_H */
