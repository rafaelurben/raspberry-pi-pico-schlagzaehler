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
    GAME_STATE_BOOT     = 0,
    GAME_STATE_MENU     = 1,
    GAME_STATE_READY    = 2,
    GAME_STATE_RUNNING  = 3,
    GAME_STATE_FINISHED = 4
} GameState;

typedef enum {
    GAME_END_NONE           = 0,
    GAME_END_TIME_LIMIT     = 1,
    GAME_END_TARGET_REACHED = 2,
    GAME_END_ABORTED        = 3
} GameEndReason;

typedef enum {
    SENSOR_STATE_INIT        = 0,
    SENSOR_STATE_CALIBRATING = 1,
    SENSOR_STATE_ARMED       = 2,
    SENSOR_STATE_HIT_LOCKOUT = 3,
    SENSOR_STATE_ERROR       = 4
} SensorState;

static inline const char* GameMode_to_string(GameMode mode) {
    switch (mode) {
        case GAME_MODE_COUNT: return "COUNT";
        case GAME_MODE_TIMED: return "TIMED";
        case GAME_MODE_RACE:  return "RACE";
        default:              return "UNKNOWN";
    }
}

static inline const char* GameMode_to_UI_string(GameMode mode) {
    switch (mode) {
        case GAME_MODE_COUNT: return "Zaehlen";
        case GAME_MODE_TIMED: return "Zeit";
        case GAME_MODE_RACE:  return "Rennen";
        default:              return "???";
    }
}

static inline const char* GameState_to_string(GameState state) {
    switch (state) {
        case GAME_STATE_BOOT:     return "BOOT";
        case GAME_STATE_MENU:     return "MENU";
        case GAME_STATE_READY:    return "READY";
        case GAME_STATE_RUNNING:  return "RUNNING";
        case GAME_STATE_FINISHED: return "FINISHED";
        default:                  return "UNKNOWN";
    }
}

static inline const char* SensorState_to_string(SensorState state) {
    switch (state) {
        case SENSOR_STATE_INIT:        return "INIT";
        case SENSOR_STATE_CALIBRATING: return "CALIBRATING";
        case SENSOR_STATE_ARMED:       return "ARMED";
        case SENSOR_STATE_HIT_LOCKOUT: return "LOCKOUT";
        case SENSOR_STATE_ERROR:       return "ERROR";
        default:                       return "UNKNOWN";
    }
}

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
