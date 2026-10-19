#include "SignalCapture.h"
#include <string.h>

void SignalCapture_init(SignalCapture* cap, const Config* config) {
    if (!cap) return;

    uint32_t raw_rate = (config && config->sample_rate_hz > 0) ? config->sample_rate_hz : 50000U;
    cap->effective_sample_rate_hz = raw_rate / SIGNAL_CAPTURE_DECIMATION;
    SignalCapture_reset(cap);
    cap->baseline = 0;
    cap->noise = 0;
    cap->threshold = 100;
}

void SignalCapture_arm(SignalCapture* cap, uint16_t baseline, uint16_t noise, uint16_t threshold) {
    if (!cap) return;

    cap->baseline = baseline;
    cap->noise = noise;
    cap->threshold = (threshold > 0) ? threshold : 100;
    cap->collecting_post_trigger = false;
    cap->buffer_ready = false;
    cap->completed = false;
    cap->decimation_count = 0;
    cap->decimation_max = 0;
    cap->pre_ring_index = 0;
    cap->pre_ring_filled = 0;
    cap->write_index = 0;
    memset(cap->pre_ring, 0, sizeof(cap->pre_ring));
}

void SignalCapture_reset(SignalCapture* cap) {
    if (!cap) return;
    cap->collecting_post_trigger = false;
    cap->buffer_ready = false;
    cap->completed = false;
    cap->decimation_count = 0;
    cap->decimation_max = 0;
    cap->pre_ring_index = 0;
    cap->pre_ring_filled = 0;
    cap->write_index = 0;
}

const uint16_t* SignalCapture_get_samples(const SignalCapture* cap) {
    return cap ? cap->buffer : NULL;
}

void SignalCapture_process_buffer(
    SignalCapture* cap,
    const uint16_t* samples,
    size_t count,
    bool* out_triggered,
    bool* out_completed
) {
    if (out_triggered) *out_triggered = false;
    if (out_completed) *out_completed = false;

    if (!cap || !samples || count == 0 || cap->completed || cap->buffer_ready) return;

    for (size_t i = 0; i < count; ++i) {
        uint16_t raw = samples[i];
        if (raw > cap->decimation_max) {
            cap->decimation_max = raw;
        }
        cap->decimation_count++;

        if (cap->decimation_count < SIGNAL_CAPTURE_DECIMATION) {
            continue;
        }

        /* Emit 1 decimated sample via 5:1 max-pooling */
        uint16_t val = cap->decimation_max;
        cap->decimation_count = 0;
        cap->decimation_max = 0;

        if (!cap->collecting_post_trigger) {
            if (val >= cap->threshold) {
                /* Trigger detected! Unroll circular pre-trigger buffer into buffer[0..PRE-1] */
                uint16_t missing = SIGNAL_CAPTURE_PRE_SAMPLES - cap->pre_ring_filled;
                for (uint16_t j = 0; j < missing; ++j) {
                    cap->buffer[j] = cap->baseline;
                }
                uint16_t start_idx = (cap->pre_ring_filled < SIGNAL_CAPTURE_PRE_SAMPLES)
                    ? 0
                    : cap->pre_ring_index;
                for (uint16_t j = 0; j < cap->pre_ring_filled; ++j) {
                    uint16_t ring_pos = (start_idx + j) % SIGNAL_CAPTURE_PRE_SAMPLES;
                    cap->buffer[missing + j] = cap->pre_ring[ring_pos];
                }

                /* Store trigger sample at index SIGNAL_CAPTURE_PRE_SAMPLES (sample 0) */
                cap->buffer[SIGNAL_CAPTURE_PRE_SAMPLES] = val;
                cap->write_index = SIGNAL_CAPTURE_PRE_SAMPLES + 1;
                cap->collecting_post_trigger = true;

                if (out_triggered) {
                    *out_triggered = true;
                }
            } else {
                /* Store in circular pre-trigger buffer */
                cap->pre_ring[cap->pre_ring_index] = val;
                cap->pre_ring_index = (cap->pre_ring_index + 1) % SIGNAL_CAPTURE_PRE_SAMPLES;
                if (cap->pre_ring_filled < SIGNAL_CAPTURE_PRE_SAMPLES) {
                    cap->pre_ring_filled++;
                }
            }
        } else {
            if (cap->write_index < SIGNAL_CAPTURE_TOTAL_SAMPLES) {
                cap->buffer[cap->write_index++] = val;
            }

            if (cap->write_index >= SIGNAL_CAPTURE_TOTAL_SAMPLES) {
                cap->buffer_ready = true;
                cap->completed = true;
                if (out_completed) {
                    *out_completed = true;
                }
                return;
            }
        }
    }
}
