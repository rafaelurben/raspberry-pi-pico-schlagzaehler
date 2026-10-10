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

void CountMode_init(CountMode* mode);
void CountMode_start(CountMode* mode, uint64_t start_time_us);
void CountMode_reset(CountMode* mode);
bool CountMode_on_hit(CountMode* mode, uint32_t current_score);
bool CountMode_on_tick(CountMode* mode, uint64_t now_us, uint32_t* out_elapsed_ms, uint32_t* out_remaining_ms);

#ifdef __cplusplus
}
#endif

#endif /* APP_GAME_MODES_COUNT_MODE_H */
