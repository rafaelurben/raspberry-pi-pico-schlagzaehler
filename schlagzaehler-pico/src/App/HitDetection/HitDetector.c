#include "HitDetector.h"
#include "../../OSAL/inc/Time.h"
#include <math.h>

void HitDetector_init(HitDetector* detector, const Config* config) {
    if (!detector) return;

    if (config) {
        detector->config = *config;
    } else {
        Config_set_defaults(&detector->config);
    }

    detector->state = SENSOR_STATE_INIT;
    detector->baseline = 0;
    detector->noise = 0;
    detector->base_threshold = 100;
    detector->dynamic_threshold = 100.0f;
    detector->current_hit_id = 0;
    detector->lockout_start_us = 0;
    detector->ignore_until_us = 0;
    detector->last_progress_percent = 0;
    detector->calib_start_us = 0;
    detector->calib_sample_sum = 0;
    detector->calib_sample_sq_sum = 0;
    detector->calib_sample_count = 0;
    detector->calib_min = 65535;
    detector->calib_max = 0;
}

void HitDetector_start_calibration(HitDetector* detector) {
    if (!detector) return;

    detector->state = SENSOR_STATE_CALIBRATING;
    detector->calib_start_us = Time_now_us();
    detector->calib_sample_sum = 0;
    detector->calib_sample_sq_sum = 0;
    detector->calib_sample_count = 0;
    detector->calib_min = 65535;
    detector->calib_max = 0;
    detector->last_progress_percent = 0;
}

void HitDetector_reset_to_armed(HitDetector* detector) {
    if (!detector) return;
    if (detector->state == SENSOR_STATE_HIT_LOCKOUT) {
        detector->state = SENSOR_STATE_ARMED;
        detector->dynamic_threshold = (float)detector->base_threshold;
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

uint16_t HitDetector_get_threshold(const HitDetector* detector) {
    return detector ? detector->base_threshold : 0;
}

uint16_t HitDetector_get_baseline(const HitDetector* detector) {
    return detector ? detector->baseline : 0;
}

uint16_t HitDetector_get_noise(const HitDetector* detector) {
    return detector ? detector->noise : 0;
}

uint8_t HitDetector_get_calibration_progress(const HitDetector* detector) {
    return detector ? detector->last_progress_percent : 0;
}

bool HitDetector_process_buffer(HitDetector* detector, const uint16_t* samples, size_t count, HitEvent* out_event) {
    if (!detector || !samples || count == 0) return false;

    if (detector->state == SENSOR_STATE_INIT) {
        HitDetector_start_calibration(detector);
    }

    uint64_t now = Time_now_us();

    if (detector->state == SENSOR_STATE_CALIBRATING) {
        for (size_t i = 0; i < count; ++i) {
            uint16_t val = samples[i];
            detector->calib_sample_sum += val;
            detector->calib_sample_sq_sum += (uint64_t)val * val;
            detector->calib_sample_count++;
            if (val < detector->calib_min) detector->calib_min = val;
            if (val > detector->calib_max) detector->calib_max = val;
        }

        uint64_t elapsed_us = (now >= detector->calib_start_us) ? (now - detector->calib_start_us) : 0;
        uint32_t elapsed_ms = (uint32_t)(elapsed_us / 1000ULL);
        uint32_t duration_ms = detector->config.calibration_duration_ms;
        if (duration_ms > 0) {
            uint32_t pct = (elapsed_ms * 100) / duration_ms;
            if (pct > 100) pct = 100;
            detector->last_progress_percent = (uint8_t)pct;
        }

        if (elapsed_ms >= duration_ms && detector->calib_sample_count >= detector->config.calibration_min_samples) {
            /* Compute statistics */
            double mean = (double)detector->calib_sample_sum / (double)detector->calib_sample_count;
            double mean_sq = (double)detector->calib_sample_sq_sum / (double)detector->calib_sample_count;
            double variance = mean_sq - (mean * mean);
            double noise = (variance > 0.0) ? sqrt(variance) : 0.0;
            uint16_t range = detector->calib_max - detector->calib_min;

            /* Plausibility check: 12-bit ADC range 0..4095 */
            if (mean < 2.0 || mean > 4000.0 || noise > 350.0 || range > 800) {
                detector->state = SENSOR_STATE_ERROR;
                return false;
            }

            detector->baseline = (uint16_t)(mean + 0.5);
            detector->noise = (uint16_t)(noise + 0.5);

            float delta = detector->config.noise_factor * (float)detector->noise;
            if (delta < (float)detector->config.min_threshold_delta) {
                delta = (float)detector->config.min_threshold_delta;
            }

            uint32_t thresh = (uint32_t)detector->baseline + (uint32_t)(delta + 0.5f);
            if (thresh > 4090) thresh = 4090;

            detector->base_threshold = (uint16_t)thresh;
            detector->dynamic_threshold = (float)detector->base_threshold;
            detector->state = SENSOR_STATE_ARMED;
            detector->last_progress_percent = 100;
        }

        return false;
    }

    if (detector->state == SENSOR_STATE_ARMED) {
        float decay = detector->config.decay_factor;
        float base = (float)detector->base_threshold;

        if (now < detector->ignore_until_us) {
            for (size_t i = 0; i < count; ++i) {
                uint16_t val = samples[i];
                if ((float)val > detector->dynamic_threshold) {
                    detector->dynamic_threshold = (float)val;
                }
                detector->dynamic_threshold *= decay;
                if (detector->dynamic_threshold < base) {
                    detector->dynamic_threshold = base;
                }
            }
            return false;
        }

        for (size_t i = 0; i < count; ++i) {
            uint16_t val = samples[i];

            /* Exponential decay of dynamic threshold */
            detector->dynamic_threshold *= decay;
            if (detector->dynamic_threshold < base) {
                detector->dynamic_threshold = base;
            }

            if ((float)val > detector->dynamic_threshold) {
                /* Hit detected! */
                uint16_t peak = val;
                /* Look ahead in current buffer for peak */
                for (size_t j = i + 1; j < count; ++j) {
                    if (samples[j] > peak) {
                        peak = samples[j];
                    }
                }

                detector->current_hit_id++;
                detector->dynamic_threshold = (float)peak;
                detector->lockout_start_us = now;
                detector->state = SENSOR_STATE_HIT_LOCKOUT;

                if (out_event) {
                    out_event->hit_id = detector->current_hit_id;
                    out_event->timestamp_us = now;
                    out_event->peak_value = peak;
                    out_event->baseline_value = detector->baseline;
                    out_event->threshold_value = detector->base_threshold;
                    out_event->intensity = (peak > detector->baseline) ? (peak - detector->baseline) : 0;
                }
                return true;
            }
        }
        return false;
    }

    if (detector->state == SENSOR_STATE_HIT_LOCKOUT) {
        float decay = detector->config.decay_factor;
        float base = (float)detector->base_threshold;

        for (size_t i = 0; i < count; ++i) {
            uint16_t val = samples[i];
            if ((float)val > detector->dynamic_threshold) {
                detector->dynamic_threshold = (float)val;
            }
            detector->dynamic_threshold *= decay;
            if (detector->dynamic_threshold < base) {
                detector->dynamic_threshold = base;
            }
        }

        uint64_t elapsed_us = now - detector->lockout_start_us;
        uint64_t lockout_us = (uint64_t)detector->config.lockout_duration_ms * 1000ULL;

        if (elapsed_us >= lockout_us) {
            detector->state = SENSOR_STATE_ARMED;
        }
        return false;
    }

    return false;
}
