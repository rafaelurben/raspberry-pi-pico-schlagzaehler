#ifndef APP_HIT_DETECTION_SIGNAL_CAPTURE_H
#define APP_HIT_DETECTION_SIGNAL_CAPTURE_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "../../Common/Config.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    CAPTURE_TARGET_0   = 0,
    CAPTURE_TARGET_1   = 1,
    CAPTURE_TARGET_2   = 2,
    CAPTURE_TARGET_ALL = 255
} CaptureTarget;

/* Single sensor: 50 kHz / 5 = 10 kHz effective capture rate */
#define SIGNAL_CAPTURE_DECIMATION_SINGLE    5U
/* All 3 sensors: (50 kHz / 15) * 3 = 10 kHz aggregate capture rate (0,1,2,0,1,2...) */
#define SIGNAL_CAPTURE_DECIMATION_ALL       15U

#define SIGNAL_CAPTURE_PRE_SAMPLES          1000U   /* 0.1 s at 10 kHz for single target */
#define SIGNAL_CAPTURE_PRE_SAMPLES_ALL      999U    /* 333 triplets (0.1 s at 10 kHz aggregate) */
#define SIGNAL_CAPTURE_POST_SAMPLES         20000U  /* 2.0 s at 10 kHz */
#define SIGNAL_CAPTURE_TOTAL_SAMPLES        (SIGNAL_CAPTURE_PRE_SAMPLES + SIGNAL_CAPTURE_POST_SAMPLES)

typedef struct {
    CaptureTarget target;
    uint32_t effective_sample_rate_hz;
    uint16_t pre_samples;
    uint16_t total_samples;
    bool collecting_post_trigger;
    bool buffer_ready;
    bool completed;

    /* Max-pooling accumulators */
    uint8_t decimation_count;
    uint16_t decimation_max[SENSOR_COUNT];

    /* Circular pre-trigger buffer */
    uint16_t pre_ring[SIGNAL_CAPTURE_PRE_SAMPLES];
    uint16_t pre_ring_index;
    uint16_t pre_ring_filled;

    /* Linearized output buffer: [0..PRE-1] = pre-trigger, [PRE..TOTAL-1] = post-trigger */
    uint16_t buffer[SIGNAL_CAPTURE_TOTAL_SAMPLES];
    uint32_t write_index;

    /* Snapshot of calibration metrics at arming/trigger time */
    uint16_t baseline;
    uint16_t noise;
    uint16_t threshold;
    uint16_t sensor_baselines[SENSOR_COUNT];
    uint16_t sensor_noises[SENSOR_COUNT];
    uint16_t sensor_thresholds[SENSOR_COUNT];
} SignalCapture;

void SignalCapture_init(SignalCapture* cap, const Config* config);
void SignalCapture_arm(
    SignalCapture* cap,
    CaptureTarget target,
    const uint16_t baselines[SENSOR_COUNT],
    const uint16_t noises[SENSOR_COUNT],
    const uint16_t thresholds[SENSOR_COUNT]
);
void SignalCapture_reset(SignalCapture* cap);
const uint16_t* SignalCapture_get_samples(const SignalCapture* cap);

/**
 * @brief Process an interleaved DMA buffer of raw ADC samples while in CAPTURE_ARMED or CAPTURING state.
 * @param out_triggered Set to true when the trigger threshold is crossed.
 * @param out_completed Set to true when all post-trigger samples have been collected.
 */
void SignalCapture_process_buffer(
    SignalCapture* cap,
    const uint16_t* samples,
    size_t count,
    bool* out_triggered,
    bool* out_completed
);

#ifdef __cplusplus
}
#endif

#endif /* APP_HIT_DETECTION_SIGNAL_CAPTURE_H */
