#ifndef APP_HIT_DETECTION_HIT_DETECTOR_H
#define APP_HIT_DETECTION_HIT_DETECTOR_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "../../Common/GameTypes.h"
#include "../../Common/Events.h"
#include "../../Common/Config.h"
#include "../../Common/Messages.h"
#include "SignalCapture.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint16_t baseline;
    uint16_t noise;
    uint16_t base_threshold;
    float dynamic_threshold;

    /* Calibration accumulators */
    uint64_t calib_sample_sum;
    uint64_t calib_sample_sq_sum;
    size_t calib_sample_count;
    uint16_t calib_min;
    uint16_t calib_max;
} HitDetectorChannel;

typedef struct {
    SensorState state;
    HitDetectorChannel channels[SENSOR_COUNT];

    /* Overall calibration state */
    uint64_t calib_start_us;
    uint8_t last_progress_percent;

    /* Strike Disambiguation & Coincidence Window */
    bool coinc_active;
    uint16_t coinc_samples_remaining;
    uint16_t coinc_peaks[SENSOR_COUNT];

    /* Hit tracking */
    uint32_t current_hit_id;
    uint64_t lockout_start_us;
    uint64_t ignore_until_us;

    /* Raw signal capture sub-component */
    SignalCapture capture;

    /* Configuration */
    Config config;
} HitDetector;

void HitDetector_init(HitDetector* detector, const Config* config);
void HitDetector_start_calibration(HitDetector* detector);
bool HitDetector_start_capture(HitDetector* detector, uint8_t target);
void HitDetector_stop_capture(HitDetector* detector);
bool HitDetector_take_completed_capture(HitDetector* detector, MsgCaptureReady* out_ready);
void HitDetector_reset_to_armed(HitDetector* detector);
void HitDetector_suppress_hits(HitDetector* detector, uint32_t duration_ms);

SensorState HitDetector_get_state(const HitDetector* detector);
uint8_t HitDetector_get_calibration_progress(const HitDetector* detector);
uint8_t HitDetector_get_capture_target(const HitDetector* detector);

/* Per-sensor accessors */
uint16_t HitDetector_get_sensor_threshold(const HitDetector* detector, uint8_t sensor_id);
uint16_t HitDetector_get_sensor_baseline(const HitDetector* detector, uint8_t sensor_id);
uint16_t HitDetector_get_sensor_noise(const HitDetector* detector, uint8_t sensor_id);

/**
 * @brief Process a completed interleaved buffer of samples from ADC DMA.
 * @return true if a new hit was detected, filling out_event.
 */
bool HitDetector_process_buffer(HitDetector* detector, const uint16_t* samples, size_t count, HitEvent* out_event);

#ifdef __cplusplus
}
#endif

#endif /* APP_HIT_DETECTION_HIT_DETECTOR_H */
