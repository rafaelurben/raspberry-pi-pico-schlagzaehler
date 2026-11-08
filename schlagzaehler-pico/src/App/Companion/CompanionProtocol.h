#ifndef APP_COMPANION_COMPANION_PROTOCOL_H
#define APP_COMPANION_COMPANION_PROTOCOL_H

#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include "CommandHandler.h"
#include "BinaryProtocolDef.h"
#include "../../Common/Messages.h"

#ifdef __cplusplus
extern "C" {
#endif

#define COMPANION_CAPTURE_SAMPLES_PER_LINE          50U
#define COMPANION_CAPTURE_LINES_PER_TICK            1U
#define COMPANION_CAPTURE_BINARY_SAMPLES_PER_CHUNK  128U
#define COMPANION_MAX_RX_PAYLOAD                    256U

typedef enum {
    PROTOCOL_ENCODING_ASCII  = 0,
    PROTOCOL_ENCODING_BINARY = 1
} ProtocolEncoding;

typedef enum {
    PARSER_STATE_IDLE = 0,
    PARSER_STATE_SYNC_1,
    PARSER_STATE_BINARY_HEADER,
    PARSER_STATE_BINARY_PAYLOAD,
    PARSER_STATE_BINARY_CRC,
    PARSER_STATE_ASCII_LINE
} CompanionParserState;

typedef struct {
    CommandHandler* command_handler;

    /* Outbound protocol encoding & state */
    ProtocolEncoding tx_encoding;
    uint16_t tx_seq_id;
    uint32_t active_client_nonce;

    /* Non-blocking raw capture streaming state on Core 1 */
    bool capture_tx_active;
    const uint16_t* capture_samples;
    uint16_t capture_total_samples;
    uint16_t capture_tx_offset;

    /* Dual-mode streaming RX parser state */
    CompanionParserState rx_state;
    char rx_ascii_buf[128];
    size_t rx_ascii_pos;
    uint8_t rx_frame_buf[sizeof(BinaryHeader) + COMPANION_MAX_RX_PAYLOAD];
    size_t rx_frame_pos;
    uint16_t rx_expected_payload_len;
    uint8_t rx_crc_buf[2];
    size_t rx_crc_pos;
} CompanionProtocol;

void CompanionProtocol_init(CompanionProtocol* proto, CommandHandler* handler);

/**
 * @brief Parse an incoming ASCII command line and invoke CommandHandler.
 */
void CompanionProtocol_parse_line(CompanionProtocol* proto, const char* line);

/**
 * @brief Feed raw bytes into the streaming dual-mode parser.
 */
void CompanionProtocol_feed_bytes(CompanionProtocol* proto, const uint8_t* data, size_t len);

/**
 * @brief Feed a single raw byte into the streaming dual-mode parser.
 */
void CompanionProtocol_feed_byte(CompanionProtocol* proto, uint8_t byte);

/**
 * @brief Parse and execute an authenticated binary command frame.
 */
void CompanionProtocol_parse_binary_frame(CompanionProtocol* proto, const BinaryHeader* header, const uint8_t* payload);

/**
 * @brief Poll USB serial for incoming bytes/lines and process them.
 */
void CompanionProtocol_poll_input(CompanionProtocol* proto);

/**
 * @brief Format and transmit an event from Core 0 over USB serial to the Companion.
 */
void CompanionProtocol_send_message(CompanionProtocol* proto, const Core0ToCore1Message* msg);

/**
 * @brief Stream pending raw capture samples in non-blocking chunks per Core 1 loop tick.
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
