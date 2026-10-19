#ifndef APP_COMPANION_COMPANION_PROTOCOL_H
#define APP_COMPANION_COMPANION_PROTOCOL_H

#include <stdbool.h>
#include "CommandHandler.h"
#include "../../Common/Messages.h"

#ifdef __cplusplus
extern "C" {
#endif

#define COMPANION_CAPTURE_SAMPLES_PER_LINE 50U
#define COMPANION_CAPTURE_LINES_PER_TICK   1U

typedef struct {
    CommandHandler* command_handler;

    /* Non-blocking raw capture streaming state on Core 1 */
    bool capture_tx_active;
    const uint16_t* capture_samples;
    uint16_t capture_total_samples;
    uint16_t capture_tx_offset;
} CompanionProtocol;

void CompanionProtocol_init(CompanionProtocol* proto, CommandHandler* handler);

/**
 * @brief Parse an incoming command line from USB serial and invoke CommandHandler.
 */
void CompanionProtocol_parse_line(CompanionProtocol* proto, const char* line);

/**
 * @brief Poll USB serial for incoming lines and process them.
 */
void CompanionProtocol_poll_input(CompanionProtocol* proto);

/**
 * @brief Format and transmit an event from Core 0 over USB serial to the Companion.
 */
void CompanionProtocol_send_message(CompanionProtocol* proto, const Core0ToCore1Message* msg);

/**
 * @brief Stream pending raw capture samples in small non-blocking chunks per Core 1 loop tick.
 * @return true when a capture transmission just finished on this tick.
 */
bool CompanionProtocol_tick_capture_tx(CompanionProtocol* proto);

/**
 * @brief Cancel any ongoing capture transmission on Core 1.
 */
void CompanionProtocol_cancel_capture_tx(CompanionProtocol* proto);

#ifdef __cplusplus
}
#endif

#endif /* APP_COMPANION_COMPANION_PROTOCOL_H */
