#include "TimedMode.h"

void TimedMode_init(TimedMode* mode, uint32_t duration_s) {
    if (!mode) return;
    mode->duration_s = (duration_s > 0) ? duration_s : 30;
    mode->start_time_us = 0;
}

void TimedMode_set_duration_s(TimedMode* mode, uint32_t duration_s) {
    if (!mode) return;
    if (duration_s < 5) duration_s = 5;
    if (duration_s > 600) duration_s = 600;
    mode->duration_s = duration_s;
}

uint32_t TimedMode_get_duration_s(const TimedMode* mode) {
    return mode ? mode->duration_s : 30;
}

void TimedMode_start(TimedMode* mode, uint64_t start_time_us) {
    if (!mode) return;
    mode->start_time_us = start_time_us;
}

void TimedMode_reset(TimedMode* mode) {
    if (!mode) return;
    mode->start_time_us = 0;
}

bool TimedMode_on_hit(TimedMode* mode, uint32_t current_score) {
    (void)mode;
    (void)current_score;
    return false; /* Finishes on time limit, not hit count */
}

bool TimedMode_on_tick(TimedMode* mode, uint64_t now_us, uint32_t* out_elapsed_ms, uint32_t* out_remaining_ms) {
    if (!mode || mode->start_time_us == 0) return false;

    uint64_t total_limit_us = (uint64_t)mode->duration_s * 1000000ULL;
    uint64_t elapsed_us = (now_us >= mode->start_time_us) ? (now_us - mode->start_time_us) : 0;

    if (out_elapsed_ms) {
        *out_elapsed_ms = (uint32_t)(elapsed_us / 1000ULL);
    }

    if (elapsed_us >= total_limit_us) {
        if (out_remaining_ms) *out_remaining_ms = 0;
        return true; /* Time limit reached! */
    }

    if (out_remaining_ms) {
        *out_remaining_ms = (uint32_t)((total_limit_us - elapsed_us) / 1000ULL);
    }

    return false;
}
