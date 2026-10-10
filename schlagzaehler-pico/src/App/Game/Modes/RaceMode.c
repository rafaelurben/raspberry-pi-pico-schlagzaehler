#include "RaceMode.h"

void RaceMode_init(RaceMode* mode, uint32_t target_hits) {
    if (!mode) return;
    mode->target_hits = (target_hits > 0) ? target_hits : 50;
    mode->start_time_us = 0;
}

void RaceMode_set_target_hits(RaceMode* mode, uint32_t target_hits) {
    if (!mode) return;
    if (target_hits < 5) target_hits = 5;
    if (target_hits > 1000) target_hits = 1000;
    mode->target_hits = target_hits;
}

uint32_t RaceMode_get_target_hits(const RaceMode* mode) {
    return mode ? mode->target_hits : 50;
}

void RaceMode_start(RaceMode* mode, uint64_t start_time_us) {
    if (!mode) return;
    mode->start_time_us = start_time_us;
}

void RaceMode_reset(RaceMode* mode) {
    if (!mode) return;
    mode->start_time_us = 0;
}

bool RaceMode_on_hit(RaceMode* mode, uint32_t current_score) {
    if (!mode) return false;
    return (current_score >= mode->target_hits);
}

bool RaceMode_on_tick(RaceMode* mode, uint64_t now_us, uint32_t* out_elapsed_ms) {
    if (!mode || mode->start_time_us == 0) return false;

    if (out_elapsed_ms) {
        if (now_us >= mode->start_time_us) {
            *out_elapsed_ms = (uint32_t)((now_us - mode->start_time_us) / 1000ULL);
        } else {
            *out_elapsed_ms = 0;
        }
    }
    return false;
}
