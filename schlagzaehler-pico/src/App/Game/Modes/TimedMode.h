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

void TimedMode_init(TimedMode* mode, uint32_t duration_s);
void TimedMode_set_duration_s(TimedMode* mode, uint32_t duration_s);
uint32_t TimedMode_get_duration_s(const TimedMode* mode);
void TimedMode_start(TimedMode* mode, uint64_t start_time_us);
void TimedMode_reset(TimedMode* mode);
bool TimedMode_on_hit(TimedMode* mode, uint32_t current_score);
bool TimedMode_on_tick(TimedMode* mode, uint64_t now_us, uint32_t* out_elapsed_ms, uint32_t* out_remaining_ms);

#ifdef __cplusplus
}
#endif

#endif /* APP_GAME_MODES_TIMED_MODE_H */
