#ifndef APP_GAME_MODES_RACE_MODE_H
#define APP_GAME_MODES_RACE_MODE_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint32_t target_hits;
    uint64_t start_time_us;
} RaceMode;

/**
 * @brief Initialize the RaceMode instance with target hit count.
 * @param mode Pointer to RaceMode instance.
 * @param target_hits Target number of hits required to win.
 */
void RaceMode_init(RaceMode* mode, uint32_t target_hits);

/**
 * @brief Update the target hit count for RaceMode.
 * @param mode Pointer to RaceMode instance.
 * @param target_hits Target number of hits required to win.
 */
void RaceMode_set_target_hits(RaceMode* mode, uint32_t target_hits);

/**
 * @brief Start the race game mode at the given timestamp.
 * @param mode Pointer to RaceMode instance.
 * @param start_time_us Monotonic start timestamp in microseconds.
 */
void RaceMode_start(RaceMode* mode, uint64_t start_time_us);

/**
 * @brief Process a score increment in RaceMode to check if the target has been reached.
 * @param mode Pointer to RaceMode instance.
 * @param current_score Current total score after the hit.
 * @return true if target_hits has been reached/exceeded, false otherwise.
 */
bool RaceMode_on_hit(RaceMode* mode, uint32_t current_score);

/**
 * @brief Periodic tick for RaceMode to compute elapsed time.
 * @param mode Pointer to RaceMode instance.
 * @param now_us Monotonic current timestamp in microseconds.
 * @param out_elapsed_ms Pointer to receive elapsed milliseconds since start.
 * @return false as RaceMode ends upon target hits, not elapsed time.
 */
bool RaceMode_on_tick(RaceMode* mode, uint64_t now_us, uint32_t* out_elapsed_ms);

#ifdef __cplusplus
}
#endif

#endif /* APP_GAME_MODES_RACE_MODE_H */
