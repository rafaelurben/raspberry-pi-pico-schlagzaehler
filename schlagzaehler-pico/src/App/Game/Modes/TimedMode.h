#ifndef APP_GAME_MODES_TIMED_MODE_H
#define APP_GAME_MODES_TIMED_MODE_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint32_t duration_s;
    uint64_t start_time_us;
} TimedMode;

/**
 * @brief Initialize the TimedMode instance with countdown duration.
 * @param mode Pointer to TimedMode instance.
 * @param duration_s Game duration in seconds.
 */
void TimedMode_init(TimedMode* mode, uint32_t duration_s);

/**
 * @brief Update the duration for TimedMode.
 * @param mode Pointer to TimedMode instance.
 * @param duration_s Game duration in seconds.
 */
void TimedMode_set_duration_s(TimedMode* mode, uint32_t duration_s);

/**
 * @brief Start the timed game mode at the given timestamp.
 * @param mode Pointer to TimedMode instance.
 * @param start_time_us Monotonic start timestamp in microseconds.
 */
void TimedMode_start(TimedMode* mode, uint64_t start_time_us);

/**
 * @brief Periodic tick for TimedMode to update countdown timers and check for expiration.
 * @param mode Pointer to TimedMode instance.
 * @param now_us Monotonic current timestamp in microseconds.
 * @param out_elapsed_ms Pointer to receive elapsed milliseconds since start.
 * @param out_remaining_ms Pointer to receive remaining milliseconds until zero.
 * @return true if the time limit has expired, false if time remains.
 */
bool TimedMode_on_tick(TimedMode* mode, uint64_t now_us, uint32_t* out_elapsed_ms, uint32_t* out_remaining_ms);

#ifdef __cplusplus
}
#endif

#endif /* APP_GAME_MODES_TIMED_MODE_H */
