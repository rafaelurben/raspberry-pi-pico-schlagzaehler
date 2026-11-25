#ifndef APP_GAME_MODES_COUNT_MODE_H
#define APP_GAME_MODES_COUNT_MODE_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint64_t start_time_us;
} CountMode;

/**
 * @brief Initialize the CountMode instance.
 * @param mode Pointer to CountMode instance.
 */
void CountMode_init(CountMode* mode);

/**
 * @brief Start the count game mode at the given timestamp.
 * @param mode Pointer to CountMode instance.
 * @param start_time_us Monotonic start timestamp in microseconds.
 */
void CountMode_start(CountMode* mode, uint64_t start_time_us);

/**
 * @brief Periodic tick for CountMode to compute elapsed time.
 * @param mode Pointer to CountMode instance.
 * @param now_us Monotonic current timestamp in microseconds.
 * @param out_elapsed_ms Pointer to receive elapsed milliseconds since start.
 * @param out_remaining_ms Pointer to receive remaining milliseconds (always 0 in CountMode).
 * @return false as CountMode has no automatic end condition.
 */
bool CountMode_on_tick(CountMode* mode, uint64_t now_us, uint32_t* out_elapsed_ms, uint32_t* out_remaining_ms);

#ifdef __cplusplus
}
#endif

#endif /* APP_GAME_MODES_COUNT_MODE_H */
