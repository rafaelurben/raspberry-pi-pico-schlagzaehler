#ifndef APP_COMPANION_COMPANION_PROTOCOL_H
#define APP_COMPANION_COMPANION_PROTOCOL_H

#include <stdbool.h>
#include "CommandHandler.h"
#include "../../Common/Messages.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    CommandHandler* command_handler;
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

#ifdef __cplusplus
}
#endif

#endif /* APP_COMPANION_COMPANION_PROTOCOL_H */
