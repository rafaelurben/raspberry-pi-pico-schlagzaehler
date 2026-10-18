#ifndef APP_HIT_DETECTION_HIT_DETECTOR_H
#define APP_HIT_DETECTION_HIT_DETECTOR_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "../../Common/GameTypes.h"
#include "../../Common/Events.h"
#include "../../Common/Config.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    SensorState state;
    uint16_t baseline;
    uint16_t noise;
    uint16_t base_threshold;
    float dynamic_threshold;

    /* Calibration accumulators */
    uint64_t calib_start_us;
    uint64_t calib_sample_sum;
    uint64_t calib_sample_sq_sum;
    size_t calib_sample_count;
    uint16_t calib_min;
    uint16_t calib_max;
    uint8_t last_progress_percent;

    /* Hit tracking */
    uint32_t current_hit_id;
    uint64_t lockout_start_us;
    uint64_t ignore_until_us;

    /* Configuration */
    Config config;
} HitDetector;

void HitDetector_init(HitDetector* detector, const Config* config);
void HitDetector_start_calibration(HitDetector* detector);
void HitDetector_reset_to_armed(HitDetector* detector);
void HitDetector_suppress_hits(HitDetector* detector, uint32_t duration_ms);
SensorState HitDetector_get_state(const HitDetector* detector);
uint16_t HitDetector_get_threshold(const HitDetector* detector);
uint16_t HitDetector_get_baseline(const HitDetector* detector);
uint16_t HitDetector_get_noise(const HitDetector* detector);
uint8_t HitDetector_get_calibration_progress(const HitDetector* detector);

/**
 * @brief Process a completed buffer of samples from ADC DMA.
 * @return true if a new hit was detected, filling out_event.
 */
bool HitDetector_process_buffer(HitDetector* detector, const uint16_t* samples, size_t count, HitEvent* out_event);

#ifdef __cplusplus
}
#endif

#endif /* APP_HIT_DETECTION_HIT_DETECTOR_H */
