#include "HitDetector.h"
#include "../../OSAL/inc/Time.h"
#include <math.h>

#define COINCIDENCE_WINDOW_SAMPLES  125U /* 2.5 ms at 50 kHz */

void HitDetector_init(HitDetector* detector, const Config* config) {
    if (!detector) return;

    if (config) {
        detector->config = *config;
    } else {
        Config_set_defaults(&detector->config);
    }

    detector->state = SENSOR_STATE_INIT;
    detector->current_hit_id = 0;
    detector->lockout_start_us = 0;
    detector->ignore_until_us = 0;
    detector->last_progress_percent = 0;
    detector->calib_start_us = 0;
    detector->coinc_active = false;
    detector->coinc_samples_remaining = 0;

    for (size_t s = 0; s < SENSOR_COUNT; ++s) {
        detector->channels[s].baseline = 0;
        detector->channels[s].noise = 0;
        detector->channels[s].base_threshold = 100;
        detector->channels[s].dynamic_threshold = 100.0f;
        detector->channels[s].ignored = false;
        detector->channels[s].calib_sample_sum = 0;
        detector->channels[s].calib_sample_sq_sum = 0;
        detector->channels[s].calib_sample_count = 0;
        detector->channels[s].calib_min = 65535;
        detector->channels[s].calib_max = 0;
        detector->coinc_peaks[s] = 0;
    }

    SignalCapture_init(&detector->capture, &detector->config);
}

void HitDetector_start_calibration(HitDetector* detector) {
    if (!detector) return;

    SignalCapture_reset(&detector->capture);
    detector->state = SENSOR_STATE_CALIBRATING;
    detector->calib_start_us = Time_now_us();
    detector->last_progress_percent = 0;
    detector->coinc_active = false;
    detector->coinc_samples_remaining = 0;

    for (size_t s = 0; s < SENSOR_COUNT; ++s) {
        detector->channels[s].ignored = false;
        detector->channels[s].calib_sample_sum = 0;
        detector->channels[s].calib_sample_sq_sum = 0;
        detector->channels[s].calib_sample_count = 0;
        detector->channels[s].calib_min = 65535;
        detector->channels[s].calib_max = 0;
    }
}

bool HitDetector_start_capture(HitDetector* detector, uint8_t target) {
    if (!detector) return false;
    if (detector->state == SENSOR_STATE_INIT ||
        detector->state == SENSOR_STATE_CALIBRATING ||
        detector->state == SENSOR_STATE_ERROR) {
        return false;
    }

    uint16_t baselines[SENSOR_COUNT];
    uint16_t noises[SENSOR_COUNT];
    uint16_t thresholds[SENSOR_COUNT];
    for (size_t s = 0; s < SENSOR_COUNT; ++s) {
        baselines[s] = detector->channels[s].baseline;
        noises[s] = detector->channels[s].noise;
        if (detector->channels[s].ignored) {
            thresholds[s] = 65535;
        } else {
            thresholds[s] = detector->channels[s].base_threshold;
        }
        detector->channels[s].dynamic_threshold = (float)detector->channels[s].base_threshold;
    }

    CaptureTarget cap_target = (target < SENSOR_COUNT) ? (CaptureTarget)target : CAPTURE_TARGET_ALL;
    SignalCapture_arm(&detector->capture, cap_target, baselines, noises, thresholds);
    detector->state = SENSOR_STATE_CAPTURE_ARMED;
    detector->coinc_active = false;
    detector->coinc_samples_remaining = 0;
    return true;
}

bool HitDetector_trigger_capture(HitDetector* detector, uint8_t target) {
    if (!detector) return false;
    if (detector->state == SENSOR_STATE_ARMED) {
        if (!HitDetector_start_capture(detector, target)) {
            return false;
        }
    }
    if (detector->state != SENSOR_STATE_CAPTURE_ARMED) return false;
    if (SignalCapture_force_trigger(&detector->capture)) {
        detector->state = SENSOR_STATE_CAPTURING;
        return true;
    }
    return false;
}

bool HitDetector_force_trigger(HitDetector* detector) {
    return HitDetector_trigger_capture(detector, HitDetector_get_capture_target(detector));
}

void HitDetector_stop_capture(HitDetector* detector) {
    if (!detector) return;
    if (detector->state == SENSOR_STATE_CAPTURE_ARMED ||
        detector->state == SENSOR_STATE_CAPTURING ||
        detector->state == SENSOR_STATE_CAPTURE_TX_WAIT) {
        SignalCapture_reset(&detector->capture);
        for (size_t s = 0; s < SENSOR_COUNT; ++s) {
            detector->channels[s].dynamic_threshold = (float)detector->channels[s].base_threshold;
        }
        detector->state = SENSOR_STATE_ARMED;
    }
}

bool HitDetector_take_completed_capture(HitDetector* detector, MsgCaptureReady* out_ready) {
    if (!detector || !detector->capture.buffer_ready) return false;

    detector->capture.buffer_ready = false;
    if (out_ready) {
        out_ready->sample_rate_hz = detector->capture.effective_sample_rate_hz;
        out_ready->target = (uint8_t)detector->capture.target;
        out_ready->pre_samples = detector->capture.pre_samples;
        out_ready->total_samples = detector->capture.total_samples;
        out_ready->baseline = detector->capture.baseline;
        out_ready->noise = detector->capture.noise;
        out_ready->threshold = detector->capture.threshold;
        out_ready->samples = SignalCapture_get_samples(&detector->capture);
    }
    return true;
}

void HitDetector_reset_to_armed(HitDetector* detector) {
    if (!detector) return;
    if (detector->state == SENSOR_STATE_HIT_LOCKOUT ||
        detector->state == SENSOR_STATE_CAPTURE_ARMED ||
        detector->state == SENSOR_STATE_CAPTURING ||
        detector->state == SENSOR_STATE_CAPTURE_TX_WAIT) {
        SignalCapture_reset(&detector->capture);
        detector->coinc_active = false;
        detector->coinc_samples_remaining = 0;
        detector->state = SENSOR_STATE_ARMED;
        for (size_t s = 0; s < SENSOR_COUNT; ++s) {
            detector->channels[s].dynamic_threshold = (float)detector->channels[s].base_threshold;
        }
    }
}

void HitDetector_suppress_hits(HitDetector* detector, uint32_t duration_ms) {
    if (!detector) return;
    uint64_t until = Time_now_us() + ((uint64_t)duration_ms * 1000ULL);
    if (until > detector->ignore_until_us) {
        detector->ignore_until_us = until;
    }
}

SensorState HitDetector_get_state(const HitDetector* detector) {
    return detector ? detector->state : SENSOR_STATE_ERROR;
}

uint8_t HitDetector_get_capture_target(const HitDetector* detector) {
    return detector ? (uint8_t)detector->capture.target : 255;
}

uint8_t HitDetector_get_calibration_progress(const HitDetector* detector) {
    return detector ? detector->last_progress_percent : 0;
}

uint16_t HitDetector_get_sensor_threshold(const HitDetector* detector, uint8_t sensor_id) {
    if (!detector || sensor_id >= SENSOR_COUNT) return 0;
    return detector->channels[sensor_id].base_threshold;
}

uint16_t HitDetector_get_sensor_baseline(const HitDetector* detector, uint8_t sensor_id) {
    if (!detector || sensor_id >= SENSOR_COUNT) return 0;
    return detector->channels[sensor_id].baseline;
}

uint16_t HitDetector_get_sensor_noise(const HitDetector* detector, uint8_t sensor_id) {
    if (!detector || sensor_id >= SENSOR_COUNT) return 0;
    return detector->channels[sensor_id].noise;
}

bool HitDetector_is_sensor_ignored(const HitDetector* detector, uint8_t sensor_id) {
    if (!detector || sensor_id >= SENSOR_COUNT) return false;
    return detector->channels[sensor_id].ignored;
}

/**
 * Decays dynamic threshold towards base threshold (excess-threshold decay).
 */
static inline void HitDetector_decay_channel(HitDetectorChannel* ch, float decay) {
    float delta = ch->dynamic_threshold - (float)ch->base_threshold;
    if (delta > 0.0f) {
        ch->dynamic_threshold = (float)ch->base_threshold + (delta * decay);
    } else {
        ch->dynamic_threshold = (float)ch->base_threshold;
    }
}

/* Start: HitDetector_process_buffer */

/**
 * Processes ADC samples during raw signal capture mode (armed, active capturing, or awaiting transmission).
 */
static bool HitDetector_process_buffer_capture(HitDetector* detector, const uint16_t* samples, size_t count) {
    if (detector->state == SENSOR_STATE_CAPTURE_ARMED ||
        detector->state == SENSOR_STATE_CAPTURING) {
        bool triggered = false;
        bool completed = false;
        SignalCapture_process_buffer(&detector->capture, samples, count, &triggered, &completed);
        if (triggered) {
            detector->state = SENSOR_STATE_CAPTURING;
        }
        if (completed) {
            detector->state = SENSOR_STATE_CAPTURE_TX_WAIT;
        }
    }
    return false;
}

/**
 * Accumulates baseline and noise statistics during sensor calibration until complete.
 */
static bool HitDetector_process_buffer_calibrating(HitDetector* detector,
                                                  const uint16_t* samples,
                                                  size_t triplet_count,
                                                  uint64_t now) {
    for (size_t t = 0; t < triplet_count; ++t) {
        for (size_t s = 0; s < SENSOR_COUNT; ++s) {
            uint16_t val = samples[t * SENSOR_COUNT + s];
            detector->channels[s].calib_sample_sum += val;
            detector->channels[s].calib_sample_sq_sum += (uint64_t)val * val;
            detector->channels[s].calib_sample_count++;
            if (val < detector->channels[s].calib_min) detector->channels[s].calib_min = val;
            if (val > detector->channels[s].calib_max) detector->channels[s].calib_max = val;
        }
    }

    uint64_t elapsed_us = (now >= detector->calib_start_us) ? (now - detector->calib_start_us) : 0;
    uint32_t elapsed_ms = (uint32_t)(elapsed_us / 1000ULL);
    uint32_t duration_ms = detector->config.calibration_duration_ms;
    if (duration_ms > 0) {
        uint32_t pct = (elapsed_ms * 100) / duration_ms;
        if (pct > 100) pct = 100;
        detector->last_progress_percent = (uint8_t)pct;
    }

    /* Check calibration completion */
    size_t min_per_sensor = detector->config.calibration_min_samples / SENSOR_COUNT;
    if (min_per_sensor == 0) min_per_sensor = 1000;

    bool samples_ready = true;
    for (size_t s = 0; s < SENSOR_COUNT; ++s) {
        if (detector->channels[s].calib_sample_count < min_per_sensor) {
            samples_ready = false;
            break;
        }
    }

    if (elapsed_ms >= duration_ms && samples_ready) {
        size_t ignored_count = 0;
        for (size_t s = 0; s < SENSOR_COUNT; ++s) {
            HitDetectorChannel* ch = &detector->channels[s];
            double mean = (double)ch->calib_sample_sum / (double)ch->calib_sample_count;
            double mean_sq = (double)ch->calib_sample_sq_sum / (double)ch->calib_sample_count;
            double variance = mean_sq - (mean * mean);
            double noise = (variance > 0.0) ? sqrt(variance) : 0.0;
            uint16_t range = ch->calib_max - ch->calib_min;

            ch->baseline = (uint16_t)(mean + 0.5);
            ch->noise = (uint16_t)(detector->config.noise_offset + noise + 0.5);

            if (ch->baseline < detector->config.min_baseline_for_active_sensor) {
                ch->ignored = true;
                ignored_count++;
            } else {
                ch->ignored = false;
                /* Plausibility check for active sensors: 12-bit ADC range 0..4095 */
                if (mean > 4000.0 || noise > 350.0 || range > 800) {
                    detector->state = SENSOR_STATE_ERROR;
                    return false;
                }
            }

            float delta = detector->config.noise_factor * (float)ch->noise;
            if (delta < (float)detector->config.min_threshold_delta) {
                delta = (float)detector->config.min_threshold_delta;
            }

            uint32_t thresh = (uint32_t)ch->baseline + (uint32_t)(delta + 0.5f);
            if (thresh > 4090) thresh = 4090;

            ch->base_threshold = (uint16_t)thresh;
            ch->dynamic_threshold = (float)ch->base_threshold;
        }

        if (ignored_count == SENSOR_COUNT) {
            detector->state = SENSOR_STATE_ERROR;
            return false;
        }

        detector->state = SENSOR_STATE_ARMED;
        detector->last_progress_percent = 100;
    }

    return false;
}

/**
 * Resolves the winning piezo sensor by peak intensity upon coincidence window expiration.
 */
static bool HitDetector_process_buffer_resolve_coincidence(HitDetector* detector,
                                                           uint64_t now,
                                                           HitEvent* out_event) {
    detector->coinc_active = false;
    uint8_t winner = 0;
    uint32_t best_score = 0;
    bool winner_found = false;

    for (size_t s = 0; s < SENSOR_COUNT; ++s) {
        if (detector->channels[s].ignored) {
            continue;
        }
        uint16_t peak = detector->coinc_peaks[s];
        uint16_t base = detector->channels[s].baseline;
        uint16_t thresh = detector->channels[s].base_threshold;
        uint32_t delta_base = (thresh > base) ? (thresh - base) : 1;
        uint32_t intensity = (peak > base) ? (peak - base) : 0;
        /* Relative intensity score: (intensity * 1000) / threshold_delta */
        uint32_t score = (intensity * 1000U) / delta_base;

        if (!winner_found || score > best_score) {
            best_score = score;
            winner = (uint8_t)s;
            winner_found = true;
        }
    }

    if (!winner_found) {
        return false;
    }

    detector->current_hit_id++;
    detector->lockout_start_us = now;
    detector->state = SENSOR_STATE_HIT_LOCKOUT;

    for (size_t s = 0; s < SENSOR_COUNT; ++s) {
        detector->channels[s].dynamic_threshold = (float)detector->coinc_peaks[s];
    }

    if (out_event) {
        uint16_t peak = detector->coinc_peaks[winner];
        uint16_t base = detector->channels[winner].baseline;
        out_event->hit_id = detector->current_hit_id;
        out_event->sensor_id = winner;
        out_event->timestamp_us = now;
        out_event->peak_value = peak;
        out_event->baseline_value = base;
        out_event->threshold_value = detector->channels[winner].base_threshold;
        out_event->intensity = (peak > base) ? (peak - base) : 0;
    }

    return true;
}

/**
 * Processes sample triplets in ARMED state, decays dynamic thresholds, and manages coincidence window.
 */
static bool HitDetector_process_buffer_armed(HitDetector* detector,
                                            const uint16_t* samples,
                                            size_t triplet_count,
                                            uint64_t now,
                                            float decay,
                                            HitEvent* out_event) {
    if (now < detector->ignore_until_us) {
        detector->coinc_active = false;
        detector->coinc_samples_remaining = 0;
        for (size_t t = 0; t < triplet_count; ++t) {
            for (size_t s = 0; s < SENSOR_COUNT; ++s) {
                uint16_t val = samples[t * SENSOR_COUNT + s];
                if ((float)val > detector->channels[s].dynamic_threshold) {
                    detector->channels[s].dynamic_threshold = (float)val;
                }
                HitDetector_decay_channel(&detector->channels[s], decay);
            }
        }
        return false;
    }

    for (size_t t = 0; t < triplet_count; ++t) {
        /* Decay dynamic thresholds for all channels */
        for (size_t s = 0; s < SENSOR_COUNT; ++s) {
            HitDetector_decay_channel(&detector->channels[s], decay);
        }

        if (!detector->coinc_active) {
            /* Check if any non-ignored sensor exceeds its dynamic threshold */
            bool triggered = false;
            for (size_t s = 0; s < SENSOR_COUNT; ++s) {
                if (detector->channels[s].ignored) {
                    continue;
                }
                uint16_t val = samples[t * SENSOR_COUNT + s];
                if ((float)val > detector->channels[s].dynamic_threshold) {
                    triggered = true;
                    break;
                }
            }

            if (triggered) {
                detector->coinc_active = true;
                detector->coinc_samples_remaining = COINCIDENCE_WINDOW_SAMPLES;
                for (size_t s = 0; s < SENSOR_COUNT; ++s) {
                    detector->coinc_peaks[s] = samples[t * SENSOR_COUNT + s];
                }
            }
        }

        if (detector->coinc_active) {
            /* Update peak seen during coincidence window */
            for (size_t s = 0; s < SENSOR_COUNT; ++s) {
                uint16_t val = samples[t * SENSOR_COUNT + s];
                if (val > detector->coinc_peaks[s]) {
                    detector->coinc_peaks[s] = val;
                }
            }

            if (detector->coinc_samples_remaining > 0) {
                detector->coinc_samples_remaining--;
            }

            if (detector->coinc_samples_remaining == 0) {
                if (HitDetector_process_buffer_resolve_coincidence(detector, now, out_event)) {
                    return true;
                }
            }
        }
    }
    return false;
}

/**
 * Tracks peak intensity decay during post-hit lockout dead time to suppress ringdown oscillations.
 */
static bool HitDetector_process_buffer_lockout(HitDetector* detector,
                                              const uint16_t* samples,
                                              size_t triplet_count,
                                              uint64_t now,
                                              float decay) {
    detector->coinc_active = false;
    detector->coinc_samples_remaining = 0;

    for (size_t t = 0; t < triplet_count; ++t) {
        for (size_t s = 0; s < SENSOR_COUNT; ++s) {
            uint16_t val = samples[t * SENSOR_COUNT + s];
            if ((float)val > detector->channels[s].dynamic_threshold) {
                detector->channels[s].dynamic_threshold = (float)val;
            }
            HitDetector_decay_channel(&detector->channels[s], decay);
        }
    }

    uint64_t elapsed_us = now - detector->lockout_start_us;
    uint64_t lockout_us = (uint64_t)detector->config.lockout_duration_ms * 1000ULL;

    if (elapsed_us >= lockout_us) {
        detector->state = SENSOR_STATE_ARMED;
    }
    return false;
}

bool HitDetector_process_buffer(HitDetector* detector, const uint16_t* samples, size_t count, HitEvent* out_event) {
    if (!detector || !samples || count == 0) return false;

    if (detector->state == SENSOR_STATE_INIT) {
        HitDetector_start_calibration(detector);
    }

    uint64_t now = Time_now_us();
    size_t triplet_count = count / SENSOR_COUNT;
    float decay = detector->config.decay_factor;

    switch (detector->state) {
        case SENSOR_STATE_CAPTURE_ARMED:
        case SENSOR_STATE_CAPTURING:
        case SENSOR_STATE_CAPTURE_TX_WAIT:
            return HitDetector_process_buffer_capture(detector, samples, count);

        case SENSOR_STATE_CALIBRATING:
            return HitDetector_process_buffer_calibrating(detector, samples, triplet_count, now);

        case SENSOR_STATE_ARMED:
            return HitDetector_process_buffer_armed(detector, samples, triplet_count, now, decay, out_event);

        case SENSOR_STATE_HIT_LOCKOUT:
            return HitDetector_process_buffer_lockout(detector, samples, triplet_count, now, decay);

        default:
            return false;
    }
}

/* End: HitDetector_process_buffer */
