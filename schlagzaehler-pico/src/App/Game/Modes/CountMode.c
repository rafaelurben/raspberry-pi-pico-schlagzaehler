#include "CountMode.h"

void CountMode_init(CountMode* mode) {
    if (!mode) return;
    mode->start_time_us = 0;
}

void CountMode_start(CountMode* mode, uint64_t start_time_us) {
    if (!mode) return;
    mode->start_time_us = start_time_us;
}

void CountMode_reset(CountMode* mode) {
    if (!mode) return;
    mode->start_time_us = 0;
}

bool CountMode_on_hit(CountMode* mode, uint32_t current_score) {
    (void)mode;
    (void)current_score;
    return false; /* Open-ended, does not finish automatically */
}

bool CountMode_on_tick(CountMode* mode, uint64_t now_us, uint32_t* out_elapsed_ms, uint32_t* out_remaining_ms) {
    if (!mode) return false;

    if (out_elapsed_ms) {
        if (mode->start_time_us > 0 && now_us >= mode->start_time_us) {
            *out_elapsed_ms = (uint32_t)((now_us - mode->start_time_us) / 1000ULL);
        } else {
            *out_elapsed_ms = 0;
        }
    }

    if (out_remaining_ms) {
        *out_remaining_ms = 0;
    }

    return false;
}
