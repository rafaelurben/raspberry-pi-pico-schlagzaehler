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
    bool ignored;

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

/**
 * @brief Initialize the hit detector channels and configuration.
 * @param detector Pointer to HitDetector instance.
 * @param config Pointer to system configuration.
 */
void HitDetector_init(HitDetector* detector, const Config* config);

/**
 * @brief Begin sensor baseline and noise calibration.
 * @param detector Pointer to HitDetector instance.
 */
void HitDetector_start_calibration(HitDetector* detector);

/**
 * @brief Arm raw signal capture for a given sensor target or all sensors.
 * @param detector Pointer to HitDetector instance.
 * @param target Sensor channel target (0, 1, 2, or 255 for ALL).
 * @return true if successfully armed, false if calibrating or in error state.
 */
bool HitDetector_start_capture(HitDetector* detector, uint8_t target);

/**
 * @brief Immediately trigger raw signal capture for a target sensor.
 * @param detector Pointer to HitDetector instance.
 * @param target Sensor channel target (0, 1, 2, or 255 for ALL).
 * @return true if successfully triggered, false otherwise.
 */
bool HitDetector_trigger_capture(HitDetector* detector, uint8_t target);

/**
 * @brief Force-trigger post-trigger recording on the currently armed capture session.
 * @param detector Pointer to HitDetector instance.
 * @return true if successfully triggered, false otherwise.
 */
bool HitDetector_force_trigger(HitDetector* detector);

/**
 * @brief Cancel any active capture session and return to ARMED state.
 * @param detector Pointer to HitDetector instance.
 */
void HitDetector_stop_capture(HitDetector* detector);

/**
 * @brief Check if a raw signal capture has completed and retrieve its metadata and buffer.
 * @param detector Pointer to HitDetector instance.
 * @param out_ready Pointer to MsgCaptureReady struct to populate with capture information.
 * @return true if a completed capture was retrieved, false otherwise.
 */
bool HitDetector_take_completed_capture(HitDetector* detector, MsgCaptureReady* out_ready);

/**
 * @brief Reset the detector from lockout, error, or capture back to the ARMED state.
 * @param detector Pointer to HitDetector instance.
 */
void HitDetector_reset_to_armed(HitDetector* detector);

/**
 * @brief Temporarily suppress hit detection (e.g. during button presses) for a specified duration.
 * @param detector Pointer to HitDetector instance.
 * @param duration_ms Duration in milliseconds to suppress hit events.
 */
void HitDetector_suppress_hits(HitDetector* detector, uint32_t duration_ms);

/**
 * @brief Get the current sensor state of the hit detector.
 * @param detector Pointer to HitDetector instance.
 * @return Current SensorState enum value.
 */
SensorState HitDetector_get_state(const HitDetector* detector);

/**
 * @brief Get calibration progress percentage (0-100%).
 * @param detector Pointer to HitDetector instance.
 * @return Calibration progress percentage.
 */
uint8_t HitDetector_get_calibration_progress(const HitDetector* detector);

/**
 * @brief Get the active raw signal capture channel target.
 * @param detector Pointer to HitDetector instance.
 * @return Channel target index (0, 1, 2, or 255 for ALL).
 */
uint8_t HitDetector_get_capture_target(const HitDetector* detector);

/* Per-sensor accessors */

/**
 * @brief Get the configured base detection threshold for a sensor channel.
 * @param detector Pointer to HitDetector instance.
 * @param sensor_id Sensor index (0, 1, or 2).
 * @return Threshold ADC value.
 */
uint16_t HitDetector_get_sensor_threshold(const HitDetector* detector, uint8_t sensor_id);

/**
 * @brief Get the calibrated baseline ADC level for a sensor channel.
 * @param detector Pointer to HitDetector instance.
 * @param sensor_id Sensor index (0, 1, or 2).
 * @return Baseline ADC value.
 */
uint16_t HitDetector_get_sensor_baseline(const HitDetector* detector, uint8_t sensor_id);

/**
 * @brief Get the calibrated peak-to-peak noise span for a sensor channel.
 * @param detector Pointer to HitDetector instance.
 * @param sensor_id Sensor index (0, 1, or 2).
 * @return Noise span ADC value.
 */
uint16_t HitDetector_get_sensor_noise(const HitDetector* detector, uint8_t sensor_id);

/**
 * @brief Check if a sensor channel is ignored (e.g. disconnected / low baseline).
 * @param detector Pointer to HitDetector instance.
 * @param sensor_id Sensor index (0, 1, or 2).
 * @return true if ignored, false if active.
 */
bool HitDetector_is_sensor_ignored(const HitDetector* detector, uint8_t sensor_id);

/**
 * @brief Process a completed interleaved buffer of samples from ADC DMA.
 * @return true if a new hit was detected, filling out_event.
 */
bool HitDetector_process_buffer(HitDetector* detector, const uint16_t* samples, size_t count, HitEvent* out_event);

#ifdef __cplusplus
}
#endif

#endif /* APP_HIT_DETECTION_HIT_DETECTOR_H */
