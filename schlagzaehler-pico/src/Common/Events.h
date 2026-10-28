#ifndef COMMON_EVENTS_H
#define COMMON_EVENTS_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    BTN_ID_UP    = 0,
    BTN_ID_DOWN  = 1,
    BTN_ID_LEFT  = 2,
    BTN_ID_RIGHT = 3,
    BTN_ID_COUNT = 4
} ButtonId;

typedef struct {
    ButtonId button;
    bool pressed;
    uint64_t timestamp_us;
} ButtonEvent;

typedef struct {
    uint32_t hit_id;
    uint8_t  sensor_id;
    uint64_t timestamp_us;
    uint16_t peak_value;
    uint16_t baseline_value;
    uint16_t threshold_value;
    uint16_t intensity;
} HitEvent;

static inline const char* ButtonId_to_string(ButtonId btn) {
    switch (btn) {
        case BTN_ID_UP:    return "UP";
        case BTN_ID_DOWN:  return "DOWN";
        case BTN_ID_LEFT:  return "LEFT";
        case BTN_ID_RIGHT: return "RIGHT";
        default:           return "UNKNOWN";
    }
}

#ifdef __cplusplus
}
#endif

#endif /* COMMON_EVENTS_H */
