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

void RaceMode_init(RaceMode* mode, uint32_t target_hits);
void RaceMode_set_target_hits(RaceMode* mode, uint32_t target_hits);
uint32_t RaceMode_get_target_hits(const RaceMode* mode);
void RaceMode_start(RaceMode* mode, uint64_t start_time_us);
void RaceMode_reset(RaceMode* mode);
bool RaceMode_on_hit(RaceMode* mode, uint32_t current_score);
bool RaceMode_on_tick(RaceMode* mode, uint64_t now_us, uint32_t* out_elapsed_ms);

#ifdef __cplusplus
}
#endif

#endif /* APP_GAME_MODES_RACE_MODE_H */
