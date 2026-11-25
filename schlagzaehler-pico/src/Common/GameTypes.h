#ifndef COMMON_GAME_TYPES_H
#define COMMON_GAME_TYPES_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    GAME_MODE_COUNT = 0,
    GAME_MODE_TIMED = 1,
    GAME_MODE_RACE  = 2,
    GAME_MODE_COUNT_TOTAL = 3
} GameMode;

typedef enum {
    GAME_STATE_BOOT      = 0,
    GAME_STATE_MENU      = 1,
    GAME_STATE_READY     = 2,
    GAME_STATE_RUNNING   = 3,
    GAME_STATE_FINISHED  = 4,
    GAME_STATE_CAPTURING = 5
} GameState;

typedef enum {
    GAME_END_NONE           = 0,
    GAME_END_TIME_LIMIT     = 1,
    GAME_END_TARGET_REACHED = 2,
    GAME_END_ABORTED        = 3
} GameEndReason;

typedef enum {
    SENSOR_STATE_INIT            = 0,
    SENSOR_STATE_CALIBRATING     = 1,
    SENSOR_STATE_ARMED           = 2,
    SENSOR_STATE_HIT_LOCKOUT     = 3,
    SENSOR_STATE_CAPTURE_ARMED   = 4,
    SENSOR_STATE_CAPTURING       = 5,
    SENSOR_STATE_CAPTURE_TX_WAIT = 6,
    SENSOR_STATE_ERROR           = 7
} SensorState;

typedef enum {
    CAPTURE_ACTION_STOP    = 0,
    CAPTURE_ACTION_START   = 1,
    CAPTURE_ACTION_TRIGGER = 2
} CaptureAction;

/**
 * @brief Convert a CaptureAction enum value to its string representation.
 * @param action Capture action enum value.
 * @return String literal representation ("STOP", "START", "TRIGGER", or "UNKNOWN").
 */
static inline const char* CaptureAction_to_string(CaptureAction action) {
    switch (action) {
        case CAPTURE_ACTION_STOP:    return "STOP";
        case CAPTURE_ACTION_START:   return "START";
        case CAPTURE_ACTION_TRIGGER: return "TRIGGER";
        default:                     return "UNKNOWN";
    }
}

/**
 * @brief Convert a GameMode enum value to its protocol string representation.
 * @param mode Game mode enum value.
 * @return String literal identifier ("COUNT", "TIMED", "RACE", or "UNKNOWN").
 */
static inline const char* GameMode_to_string(GameMode mode) {
    switch (mode) {
        case GAME_MODE_COUNT: return "COUNT";
        case GAME_MODE_TIMED: return "TIMED";
        case GAME_MODE_RACE:  return "RACE";
        default:              return "UNKNOWN";
    }
}

/**
 * @brief Convert a GameMode enum value to its user-facing UI display label.
 * @param mode Game mode enum value.
 * @return Localized string label for the display ("Zaehlen", "Zeit", "Rennen", or "???").
 */
static inline const char* GameMode_to_UI_string(GameMode mode) {
    switch (mode) {
        case GAME_MODE_COUNT: return "Zaehlen";
        case GAME_MODE_TIMED: return "Zeit";
        case GAME_MODE_RACE:  return "Rennen";
        default:              return "???";
    }
}

/**
 * @brief Convert a GameState enum value to its string representation.
 * @param state Game state enum value.
 * @return String literal representation ("BOOT", "MENU", "READY", etc.).
 */
static inline const char* GameState_to_string(GameState state) {
    switch (state) {
        case GAME_STATE_BOOT:      return "BOOT";
        case GAME_STATE_MENU:      return "MENU";
        case GAME_STATE_READY:     return "READY";
        case GAME_STATE_RUNNING:   return "RUNNING";
        case GAME_STATE_FINISHED:  return "FINISHED";
        case GAME_STATE_CAPTURING: return "CAPTURING";
        default:                   return "UNKNOWN";
    }
}

/**
 * @brief Convert a SensorState enum value to its string representation.
 * @param state Sensor state enum value.
 * @return String literal representation ("INIT", "CALIBRATING", "ARMED", etc.).
 */
static inline const char* SensorState_to_string(SensorState state) {
    switch (state) {
        case SENSOR_STATE_INIT:            return "INIT";
        case SENSOR_STATE_CALIBRATING:     return "CALIBRATING";
        case SENSOR_STATE_ARMED:           return "ARMED";
        case SENSOR_STATE_HIT_LOCKOUT:     return "LOCKOUT";
        case SENSOR_STATE_ERROR:           return "ERROR";
        case SENSOR_STATE_CAPTURE_ARMED:   return "CAPTURE_ARMED";
        case SENSOR_STATE_CAPTURING:       return "CAPTURING";
        case SENSOR_STATE_CAPTURE_TX_WAIT: return "CAPTURE_TX_WAIT";
        default:                           return "UNKNOWN";
    }
}

/**
 * @brief Convert a GameEndReason enum value to its string representation.
 * @param reason Reason enum value explaining why the game concluded.
 * @return String literal representation ("TIME_LIMIT", "TARGET_REACHED", "ABORTED", or "NONE").
 */
static inline const char* GameEndReason_to_string(GameEndReason reason) {
    switch (reason) {
        case GAME_END_TIME_LIMIT:     return "TIME_LIMIT";
        case GAME_END_TARGET_REACHED: return "TARGET_REACHED";
        case GAME_END_ABORTED:        return "ABORTED";
        case GAME_END_NONE:
        default:                      return "NONE";
    }
}

#ifdef __cplusplus
}
#endif

#endif /* COMMON_GAME_TYPES_H */
