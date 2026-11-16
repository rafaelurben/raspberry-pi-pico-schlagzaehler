#ifndef APP_COMPANION_BINARY_PROTOCOL_DEF_H
#define APP_COMPANION_BINARY_PROTOCOL_DEF_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include "Crc16.h"

#ifdef __cplusplus
extern "C" {
#endif

/* -------------------------------------------------------------
 * Framing & Version Constants
 * ------------------------------------------------------------- */
#define BINARY_SYNC_WORD           0xAA55U
#define PROTOCOL_VERSION           1U

#define PROTO_VERSION_MAJOR        1U
#define PROTO_VERSION_MINOR        0U

#define FW_VERSION_MAJOR           1U
#define FW_VERSION_MINOR           2U
#define FW_VERSION_PATCH           0U

#define HARDWARE_GEN               1U
#define HARDWARE_REV               1U

/* -------------------------------------------------------------
 * Frame & Message Flags
 * ------------------------------------------------------------- */
/* Header flags (bits 0-3 of header flags field, which maps to bits 4-7 of version_flags byte) */
#define BINARY_FLAG_IS_ERROR       (1U << 0)

/* Handshake flags (CMD_HANDSHAKE payload) */
#define HANDSHAKE_FLAG_TLV_MODE    (1U << 0)

/* Calibration result flags (MSG_CALIBRATION_RESULT payload) */
#define CALIBRATION_FLAG_IGNORED   (1U << 0)
#define CALIBRATION_FLAG_REPEATED  (1U << 1)

/* Handshake ACK status codes */
#define HANDSHAKE_STATUS_OK                    0U
#define HANDSHAKE_STATUS_ERR_VERSION_MISMATCH  1U
#define HANDSHAKE_STATUS_ERR_BUSY              2U

/* Helper macros for packing/unpacking the version_flags byte */
#define BINARY_PACK_VER_FLAGS(ver, flags) ((uint8_t)(((ver) & 0x0FU) | (((flags) & 0x0FU) << 4)))
#define BINARY_GET_VERSION(vf)            ((uint8_t)((vf) & 0x0FU))
#define BINARY_GET_FLAGS(vf)              ((uint8_t)(((vf) >> 4) & 0x0FU))

/* -------------------------------------------------------------
 * Message Types
 * ------------------------------------------------------------- */
typedef enum {
    /* Commands (Web Companion -> Pico W: 0x01 - 0x7F) */
    BIN_CMD_HANDSHAKE           = 0x01,
    BIN_CMD_START               = 0x02,
    BIN_CMD_RESET               = 0x03,
    BIN_CMD_CALIBRATE           = 0x04,
    BIN_CMD_STATUS              = 0x05,
    BIN_CMD_SET_MODE            = 0x06,
    BIN_CMD_SET_PARAMETER       = 0x07,
    BIN_CMD_SET_SENSITIVITY     = 0x08,
    BIN_CMD_CAPTURE             = 0x09,

    /* Telemetry & Events (Pico W -> Web Companion: 0x80 - 0xFF) */
    BIN_MSG_HANDSHAKE_ACK       = 0x81,
    BIN_MSG_SENSOR_STATUS       = 0x82,
    BIN_MSG_CALIBRATION_RESULT  = 0x83,
    BIN_MSG_HIT_DETECTED        = 0x84,
    BIN_MSG_GAME_STATE          = 0x85,
    BIN_MSG_GAME_MODE           = 0x86,
    BIN_MSG_SCORE               = 0x87,
    BIN_MSG_TIMER               = 0x88,
    BIN_MSG_GAME_FINISHED       = 0x89,
    BIN_MSG_CAPTURE_START       = 0x8A,
    BIN_MSG_CAPTURE_DATA        = 0x8B,
    BIN_MSG_CAPTURE_END         = 0x8C,
    BIN_MSG_ERROR               = 0x8D
} BinaryMsgType;

/* Convenient aliases matching protocol specification */
#define CMD_HANDSHAKE                  BIN_CMD_HANDSHAKE
#define CMD_START                      BIN_CMD_START
#define CMD_RESET                      BIN_CMD_RESET
#define CMD_CALIBRATE                  BIN_CMD_CALIBRATE
#define CMD_STATUS                     BIN_CMD_STATUS
#define CMD_SET_MODE                   BIN_CMD_SET_MODE
#define CMD_SET_PARAMETER              BIN_CMD_SET_PARAMETER
#define CMD_SET_SENSITIVITY            BIN_CMD_SET_SENSITIVITY
#define CMD_CAPTURE                    BIN_CMD_CAPTURE

#define MSG_HANDSHAKE_ACK              BIN_MSG_HANDSHAKE_ACK
#define MSG_SENSOR_STATUS              BIN_MSG_SENSOR_STATUS
#define MSG_GAME_STATE                 BIN_MSG_GAME_STATE
#define MSG_GAME_MODE                  BIN_MSG_GAME_MODE
#define MSG_SCORE                      BIN_MSG_SCORE
#define MSG_TIMER                      BIN_MSG_TIMER
#define MSG_CAPTURE_START              BIN_MSG_CAPTURE_START
#define MSG_CAPTURE_DATA               BIN_MSG_CAPTURE_DATA
#define MSG_CAPTURE_END                BIN_MSG_CAPTURE_END

#define BINARY_MSG_CALIBRATION_RESULT  BIN_MSG_CALIBRATION_RESULT
#define BINARY_MSG_HIT_DETECTED        BIN_MSG_HIT_DETECTED
#define BINARY_MSG_GAME_FINISHED       BIN_MSG_GAME_FINISHED
#define BINARY_MSG_ERROR               BIN_MSG_ERROR

/* -------------------------------------------------------------
 * Frame Header (8 bytes packed)
 * ------------------------------------------------------------- */
typedef struct __attribute__((packed)) {
    uint16_t sync;          /* 0xAA55 (transmitted as 0x55, 0xAA in little-endian) */
    uint8_t  version_flags; /* bits 0-3: proto ver (1), bits 4-7: flags (bit 4: IS_ERROR) */
    uint8_t  msg_type;      /* BinaryMsgType */
    uint16_t payload_len;   /* Length of payload following header in bytes */
    uint16_t seq_id;        /* Monotonically increasing sequence ID */
} BinaryHeader;

/* Maximum payload and frame size for static staging buffers */
#define BINARY_FRAME_TRAILER_LEN       2U   /* 16-bit CRC trailer */
#define BINARY_MAX_PAYLOAD_LEN         300U /* Accommodates up to 128-sample capture chunk (260 B) + headroom */
#define BINARY_MAX_FRAME_LEN           ((uint16_t)(sizeof(BinaryHeader) + BINARY_MAX_PAYLOAD_LEN + BINARY_FRAME_TRAILER_LEN))

/* -------------------------------------------------------------
 * Command Payloads
 * ------------------------------------------------------------- */

/* CMD_HANDSHAKE (0x01) - 8 bytes */
typedef struct __attribute__((packed)) {
    uint8_t  client_proto_major;
    uint8_t  client_proto_minor;
    uint16_t flags;         /* Bit 0: TLV_MODE */
    uint32_t client_nonce;
} CmdHandshakePayload;

/* CMD_SET_MODE (0x06) - 1 byte */
typedef struct __attribute__((packed)) {
    uint8_t mode;           /* 0 = COUNT, 1 = TIMED, 2 = RACE */
} CmdSetModePayload;

/* CMD_SET_PARAMETER (0x07) - 4 bytes */
typedef struct __attribute__((packed)) {
    uint32_t parameter;     /* seconds or target hits */
} CmdSetParameterPayload;

/* CMD_SET_SENSITIVITY (0x08) - 4 bytes */
typedef struct __attribute__((packed)) {
    float noise_factor;     /* IEEE-754 float */
} CmdSetSensitivityPayload;

/* CMD_CAPTURE (0x09) - 2 bytes */
typedef struct __attribute__((packed)) {
    uint8_t action;         /* 0 = STOP, 1 = START */
    uint8_t target_sensor;  /* 0, 1, 2, or 255 for ALL */
} CmdCapturePayload;

/* -------------------------------------------------------------
 * Telemetry Payloads
 * ------------------------------------------------------------- */

/* MSG_HANDSHAKE_ACK (0x81) - 20 bytes */
typedef struct __attribute__((packed)) {
    uint8_t  hardware_gen;
    uint8_t  hardware_rev;
    uint8_t  proto_major;
    uint8_t  proto_minor;
    uint8_t  fw_major;
    uint8_t  fw_minor;
    uint8_t  fw_patch;
    uint8_t  status_code;   /* 0 = OK, 1 = ERR_VERSION_MISMATCH, 2 = ERR_BUSY */
    uint32_t reserved;      /* 0 */
    uint32_t client_nonce;  /* Echo of CMD_HANDSHAKE client_nonce */
    uint32_t uptime_ms;     /* Hardware uptime in milliseconds */
} MsgHandshakeAckPayload;

/* MSG_SENSOR_STATUS (0x82) - 2 bytes */
typedef struct __attribute__((packed)) {
    uint8_t state;          /* SensorState enum: 0..7 */
    uint8_t target;         /* 0, 1, 2, or 255 for ALL */
} MsgSensorStatusPayload;

/* MSG_CALIBRATION_RESULT (0x83) - 8 bytes */
typedef struct __attribute__((packed)) {
    uint8_t  flags;         /* Bit 0: IGNORED, Bit 1: REPEATED */
    uint8_t  sensor_id;     /* 0, 1, 2 */
    uint16_t baseline;
    uint16_t noise_span;
    uint16_t threshold;
} MsgCalibrationResultPayload;

/* MSG_HIT_DETECTED (0x84) - 16 bytes */
typedef struct __attribute__((packed)) {
    uint32_t hit_id;
    uint16_t peak_value;
    uint16_t intensity;
    uint8_t  sensor_id;
    uint8_t  reserved[3];
    uint32_t timestamp_us;
} MsgHitDetectedPayload;

/* MSG_GAME_STATE (0x85) - 2 bytes */
typedef struct __attribute__((packed)) {
    uint8_t old_state;      /* GameState enum: 0..5 */
    uint8_t new_state;      /* GameState enum: 0..5 */
} MsgGameStatePayload;

/* MSG_GAME_MODE (0x86) - 8 bytes */
typedef struct __attribute__((packed)) {
    uint8_t  mode;          /* GameMode enum: 0..2 */
    uint8_t  reserved[3];
    uint32_t parameter;
} MsgGameModePayload;

/* MSG_SCORE (0x87) - 4 bytes */
typedef struct __attribute__((packed)) {
    uint32_t score;
} MsgScorePayload;

/* MSG_TIMER (0x88) - 8 bytes */
typedef struct __attribute__((packed)) {
    uint32_t elapsed_ms;
    uint32_t remaining_ms;
} MsgTimerPayload;

/* MSG_GAME_FINISHED (0x89) - 9 bytes */
typedef struct __attribute__((packed)) {
    uint32_t final_score;
    uint32_t total_time_ms;
    uint8_t  reason;        /* GameEndReason: 0=NONE, 1=TIME_LIMIT, 2=TARGET_REACHED, 3=ABORTED */
} MsgGameFinishedPayload;

/* MSG_CAPTURE_START (0x8A) - 9 bytes */
typedef struct __attribute__((packed)) {
    uint32_t sample_rate_hz;
    uint16_t pre_samples;
    uint16_t total_samples;
    uint8_t  target_channel;/* 0, 1, 2, or 255 for ALL */
} MsgCaptureStartPayload;

/* MSG_CAPTURE_DATA (0x8B) - 4 bytes header followed by N * uint16_t */
typedef struct __attribute__((packed)) {
    uint16_t offset;
    uint16_t count;
} MsgCaptureDataHeader;

/* MSG_CAPTURE_END (0x8C) - 2 bytes */
typedef struct __attribute__((packed)) {
    uint16_t total_samples;
} MsgCaptureEndPayload;

/* MSG_ERROR (0x8D) - 7 bytes header followed by msg_length bytes of message */
typedef struct __attribute__((packed)) {
    uint32_t error_code;
    uint8_t  component_id;  /* 0=SYSTEM, 1=ADC, 2=DMA, 3=USB, 4=DISPLAY */
    uint8_t  flags;         /* Reserved: 0 */
    uint8_t  msg_length;    /* Length of following message string */
} MsgErrorHeader;

#ifdef __cplusplus
}
#endif

#endif /* APP_COMPANION_BINARY_PROTOCOL_DEF_H */
