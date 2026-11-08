#ifndef COMMON_MESSAGES_H
#define COMMON_MESSAGES_H

#include <stdint.h>
#include <stdbool.h>
#include "GameTypes.h"
#include "Events.h"
#include "Config.h"

#ifdef __cplusplus
extern "C" {
#endif

/* -------------------------------------------------------------
 * Messages: Core 0 -> Core 1
 * ------------------------------------------------------------- */

typedef enum {
    MSG_BOOT_STATUS,
    MSG_CALIBRATION_PROGRESS,
    MSG_CALIBRATION_RESULT,
    MSG_SENSOR_STATUS_CHANGED,
    MSG_HIT_DETECTED,
    MSG_GAME_STATE_CHANGED,
    MSG_GAME_MODE_CHANGED,
    MSG_SCORE_CHANGED,
    MSG_TIMER_CHANGED,
    MSG_GAME_FINISHED,
    MSG_CONFIG_CHANGED,
    MSG_CAPTURE_READY,
    MSG_ERROR
} Core0ToCore1MsgType;

typedef struct {
    bool success;
    char message[32];
} MsgBootStatus;

typedef struct {
    uint8_t progress_percent;
} MsgCalibrationProgress;

typedef struct {
    bool success;
    bool ignored;
    bool repeated;
    uint8_t sensor_id;
    uint16_t baseline;
    uint16_t noise;
    uint16_t threshold;
} MsgCalibrationResult;

typedef struct {
    SensorState state;
    uint8_t target; /* 0, 1, 2, or 255 for ALL */
} MsgSensorStatusChanged;

typedef HitEvent MsgHitDetected;

typedef struct {
    GameState old_state;
    GameState new_state;
} MsgGameStateChanged;

typedef struct {
    GameMode mode;
    GameMode menu_selected_mode;
    uint32_t parameter; /* duration in seconds or target hits */
} MsgGameModeChanged;

typedef struct {
    uint32_t score;
} MsgScoreChanged;

typedef struct {
    uint32_t elapsed_ms;
    uint32_t remaining_ms;
} MsgTimerChanged;

typedef struct {
    uint32_t final_score;
    uint32_t total_time_ms;
    GameEndReason reason;
} MsgGameFinished;

typedef struct {
    Config config;
} MsgConfigChanged;

typedef struct {
    uint32_t sample_rate_hz;
    uint8_t target; /* 0, 1, 2, or 255 for ALL */
    uint16_t pre_samples;
    uint16_t total_samples;
    uint16_t baseline;
    uint16_t noise;
    uint16_t threshold;
    const uint16_t* samples;
} MsgCaptureReady;

typedef struct {
    uint32_t error_code;
    char component[16];
    char message[32];
} MsgError;

typedef struct {
    Core0ToCore1MsgType type;
    uint64_t timestamp_us;
    union {
        MsgBootStatus           boot_status;
        MsgCalibrationProgress  calibration_progress;
        MsgCalibrationResult    calibration_result;
        MsgSensorStatusChanged  sensor_status;
        MsgHitDetected          hit;
        MsgGameStateChanged     game_state;
        MsgGameModeChanged      game_mode;
        MsgScoreChanged         score;
        MsgTimerChanged         timer;
        MsgGameFinished         game_finished;
        MsgConfigChanged        config;
        MsgCaptureReady         capture_ready;
        MsgError                error;
    } data;
} Core0ToCore1Message;

/* -------------------------------------------------------------
 * Messages: Core 1 -> Core 0
 * ------------------------------------------------------------- */

typedef enum {
    MSG_SET_GAME_MODE,
    MSG_SET_GAME_PARAMETER,
    MSG_START_GAME,
    MSG_RESET_GAME,
    MSG_SET_SENSITIVITY,
    MSG_REQUEST_CALIBRATION,
    MSG_REQUEST_STATUS,
    MSG_REQUEST_CAPTURE
} Core1ToCore0MsgType;

typedef struct {
    GameMode mode;
} MsgSetGameMode;

typedef struct {
    uint32_t parameter;
} MsgSetGameParameter;

typedef struct {
    float noise_factor;
} MsgSetSensitivity;

typedef struct {
    bool enable;
    uint8_t target; /* 0, 1, 2, or 255 for ALL */
} MsgRequestCapture;

typedef struct {
    Core1ToCore0MsgType type;
    uint64_t timestamp_us;
    union {
        MsgSetGameMode      set_mode;
        MsgSetGameParameter set_parameter;
        MsgSetSensitivity   set_sensitivity;
        MsgRequestCapture   request_capture;
    } data;
} Core1ToCore0Message;

#ifdef __cplusplus
}
#endif

#endif /* COMMON_MESSAGES_H */
