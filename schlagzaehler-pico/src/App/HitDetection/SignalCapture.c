#include "SignalCapture.h"
#include <string.h>

void SignalCapture_init(SignalCapture* cap, const Config* config) {
    if (!cap) return;
    (void)config;

    /* Always 10 kHz effective sample rate */
    cap->effective_sample_rate_hz = 10000U;
    cap->target = CAPTURE_TARGET_ALL;
    cap->pre_samples = SIGNAL_CAPTURE_PRE_SAMPLES_ALL;
    cap->total_samples = SIGNAL_CAPTURE_TOTAL_SAMPLES;
    SignalCapture_reset(cap);

    cap->baseline = 0;
    cap->noise = 0;
    cap->threshold = 100;
    for (size_t i = 0; i < SENSOR_COUNT; ++i) {
        cap->sensor_baselines[i] = 0;
        cap->sensor_noises[i] = 0;
        cap->sensor_thresholds[i] = 100;
        cap->decimation_max[i] = 0;
    }
}

void SignalCapture_arm(
    SignalCapture* cap,
    CaptureTarget target,
    const uint16_t baselines[SENSOR_COUNT],
    const uint16_t noises[SENSOR_COUNT],
    const uint16_t thresholds[SENSOR_COUNT]
) {
    if (!cap) return;

    cap->target = target;
    cap->effective_sample_rate_hz = 10000U;

    if (target == CAPTURE_TARGET_ALL) {
        cap->pre_samples = SIGNAL_CAPTURE_PRE_SAMPLES_ALL;
        cap->total_samples = SIGNAL_CAPTURE_TOTAL_SAMPLES;
    } else {
        cap->pre_samples = SIGNAL_CAPTURE_PRE_SAMPLES;
        cap->total_samples = SIGNAL_CAPTURE_TOTAL_SAMPLES;
    }

    for (size_t i = 0; i < SENSOR_COUNT; ++i) {
        cap->sensor_baselines[i] = baselines ? baselines[i] : 0;
        cap->sensor_noises[i] = noises ? noises[i] : 0;
        cap->sensor_thresholds[i] = (thresholds && thresholds[i] > 0) ? thresholds[i] : 100;
        cap->decimation_max[i] = 0;
    }

    if (target < SENSOR_COUNT) {
        cap->baseline = cap->sensor_baselines[target];
        cap->noise = cap->sensor_noises[target];
        cap->threshold = cap->sensor_thresholds[target];
    } else {
        cap->baseline = cap->sensor_baselines[0];
        cap->noise = cap->sensor_noises[0];
        cap->threshold = cap->sensor_thresholds[0];
    }

    cap->collecting_post_trigger = false;
    cap->buffer_ready = false;
    cap->completed = false;
    cap->decimation_count = 0;
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
    for (size_t i = 0; i < SENSOR_COUNT; ++i) {
        cap->decimation_max[i] = 0;
    }
    cap->pre_ring_index = 0;
    cap->pre_ring_filled = 0;
    cap->write_index = 0;
}

const uint16_t* SignalCapture_get_samples(const SignalCapture* cap) {
    return cap ? cap->buffer : NULL;
}

static void unroll_pre_ring_single(SignalCapture* cap) {
    uint16_t missing = cap->pre_samples - cap->pre_ring_filled;
    for (uint16_t j = 0; j < missing; ++j) {
        cap->buffer[j] = cap->baseline;
    }
    uint16_t start_idx = (cap->pre_ring_filled < cap->pre_samples)
        ? 0
        : cap->pre_ring_index;
    for (uint16_t j = 0; j < cap->pre_ring_filled; ++j) {
        uint16_t ring_pos = (start_idx + j) % cap->pre_samples;
        cap->buffer[missing + j] = cap->pre_ring[ring_pos];
    }
}

static void unroll_pre_ring_all(SignalCapture* cap) {
    uint16_t missing = cap->pre_samples - cap->pre_ring_filled;
    for (uint16_t j = 0; j < missing; ++j) {
        cap->buffer[j] = cap->sensor_baselines[j % SENSOR_COUNT];
    }
    uint16_t start_idx = (cap->pre_ring_filled < cap->pre_samples)
        ? 0
        : cap->pre_ring_index;
    for (uint16_t j = 0; j < cap->pre_ring_filled; ++j) {
        uint16_t ring_pos = (start_idx + j) % cap->pre_samples;
        cap->buffer[missing + j] = cap->pre_ring[ring_pos];
    }
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

    size_t triplet_count = count / SENSOR_COUNT;

    if (cap->target == CAPTURE_TARGET_ALL) {
        /* All 3 sensors: 15:1 max-pooling per sensor */
        for (size_t t = 0; t < triplet_count; ++t) {
            uint16_t s0 = samples[t * 3 + 0];
            uint16_t s1 = samples[t * 3 + 1];
            uint16_t s2 = samples[t * 3 + 2];

            if (s0 > cap->decimation_max[0]) cap->decimation_max[0] = s0;
            if (s1 > cap->decimation_max[1]) cap->decimation_max[1] = s1;
            if (s2 > cap->decimation_max[2]) cap->decimation_max[2] = s2;
            cap->decimation_count++;

            if (cap->decimation_count < SIGNAL_CAPTURE_DECIMATION_ALL) {
                continue;
            }

            /* Emit 1 triplet via 15:1 max-pooling */
            uint16_t v0 = cap->decimation_max[0];
            uint16_t v1 = cap->decimation_max[1];
            uint16_t v2 = cap->decimation_max[2];
            cap->decimation_count = 0;
            cap->decimation_max[0] = 0;
            cap->decimation_max[1] = 0;
            cap->decimation_max[2] = 0;

            if (!cap->collecting_post_trigger) {
                bool triggered = (v0 >= cap->sensor_thresholds[0]) ||
                                 (v1 >= cap->sensor_thresholds[1]) ||
                                 (v2 >= cap->sensor_thresholds[2]);
                if (triggered) {
                    unroll_pre_ring_all(cap);
                    cap->buffer[cap->pre_samples + 0] = v0;
                    cap->buffer[cap->pre_samples + 1] = v1;
                    cap->buffer[cap->pre_samples + 2] = v2;
                    cap->write_index = cap->pre_samples + 3;
                    cap->collecting_post_trigger = true;
                    if (out_triggered) *out_triggered = true;
                } else {
                    cap->pre_ring[cap->pre_ring_index] = v0;
                    cap->pre_ring[(cap->pre_ring_index + 1) % cap->pre_samples] = v1;
                    cap->pre_ring[(cap->pre_ring_index + 2) % cap->pre_samples] = v2;
                    cap->pre_ring_index = (cap->pre_ring_index + 3) % cap->pre_samples;
                    if (cap->pre_ring_filled + 3 <= cap->pre_samples) {
                        cap->pre_ring_filled += 3;
                    } else {
                        cap->pre_ring_filled = cap->pre_samples;
                    }
                }
            } else {
                if (cap->write_index < cap->total_samples) {
                    cap->buffer[cap->write_index++] = v0;
                }
                if (cap->write_index < cap->total_samples) {
                    cap->buffer[cap->write_index++] = v1;
                }
                if (cap->write_index < cap->total_samples) {
                    cap->buffer[cap->write_index++] = v2;
                }
                if (cap->write_index >= cap->total_samples) {
                    cap->buffer_ready = true;
                    cap->completed = true;
                    if (out_completed) *out_completed = true;
                    return;
                }
            }
        }
    } else {
        /* Single sensor: 5:1 max-pooling on target sensor */
        size_t target_idx = (size_t)cap->target;
        for (size_t t = 0; t < triplet_count; ++t) {
            uint16_t raw = samples[t * 3 + target_idx];
            if (raw > cap->decimation_max[0]) {
                cap->decimation_max[0] = raw;
            }
            cap->decimation_count++;

            if (cap->decimation_count < SIGNAL_CAPTURE_DECIMATION_SINGLE) {
                continue;
            }

            uint16_t val = cap->decimation_max[0];
            cap->decimation_count = 0;
            cap->decimation_max[0] = 0;

            if (!cap->collecting_post_trigger) {
                if (val >= cap->threshold) {
                    unroll_pre_ring_single(cap);
                    cap->buffer[cap->pre_samples] = val;
                    cap->write_index = cap->pre_samples + 1;
                    cap->collecting_post_trigger = true;
                    if (out_triggered) *out_triggered = true;
                } else {
                    cap->pre_ring[cap->pre_ring_index] = val;
                    cap->pre_ring_index = (cap->pre_ring_index + 1) % cap->pre_samples;
                    if (cap->pre_ring_filled < cap->pre_samples) {
                        cap->pre_ring_filled++;
                    }
                }
            } else {
                if (cap->write_index < cap->total_samples) {
                    cap->buffer[cap->write_index++] = val;
                }
                if (cap->write_index >= cap->total_samples) {
                    cap->buffer_ready = true;
                    cap->completed = true;
                    if (out_completed) *out_completed = true;
                    return;
                }
            }
        }
    }
}
