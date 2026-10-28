#ifndef COMMON_CONFIG_H
#define COMMON_CONFIG_H

#include <stdint.h>
#include <stdbool.h>
#include "GameTypes.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Hardware Pin Definitions */
#define SENSOR_COUNT            3
#define PIN_PIEZO_ADC_0         26  /* GPIO 26 / ADC 0 */
#define PIN_PIEZO_ADC_1         27  /* GPIO 27 / ADC 1 */
#define PIN_PIEZO_ADC_2         28  /* GPIO 28 / ADC 2 */
#define ADC_INPUT_CHANNEL       0
#define ADC_ROUND_ROBIN_MASK    0x07 /* for ADC 0, 1, 2 */

#define PIN_BTN_UP              10  /* GPIO 10 */
#define PIN_BTN_DOWN            14  /* GPIO 14 */
#define PIN_BTN_LEFT            15  /* GPIO 15 */
#define PIN_BTN_RIGHT           11  /* GPIO 11 */

/* Display ST7735 Pin Definitions (SPI0) */
#define PIN_DISPLAY_BL          2   /* GPIO 2 (Backlight) */
#define PIN_DISPLAY_DC          3   /* GPIO 3 (Data/Command) */
#define PIN_DISPLAY_RST         6   /* GPIO 6 (Reset) */
#define PIN_DISPLAY_CS          17  /* GPIO 17 (SPI0 CSn) */
#define PIN_DISPLAY_SCLK        18  /* GPIO 18 (SPI0 SCK) */
#define PIN_DISPLAY_MOSI        19  /* GPIO 19 (SPI0 TX) */

#define DISPLAY_WIDTH           128
#define DISPLAY_HEIGHT          160

/* Inter-core Queue Capacities */
#define QUEUE_CORE0_TO_CORE1_CAPACITY   64
#define QUEUE_CORE1_TO_CORE0_CAPACITY   16

/* Configuration Struct */
typedef struct {
    /* Piezo & Detection Settings */
    uint32_t sample_rate_hz;
    uint16_t dma_buffer_samples;
    uint32_t calibration_duration_ms;
    uint32_t calibration_min_samples;
    float    noise_factor;           /* k in threshold = baseline + k * noise */
    uint16_t min_threshold_delta;    /* Minimum offset above baseline */
    uint32_t lockout_duration_ms;    /* Dead time after hit to prevent re-triggering */
    float    decay_factor;           /* Dynamic peak threshold decay per sample */

    /* Game Mode Settings */
    GameMode default_mode;
    uint32_t timed_duration_s;       /* Default duration for TIMED mode (e.g. 30s) */
    uint32_t race_target_hits;       /* Default target count for RACE mode (e.g. 50) */

    /* System / Watchdog Settings */
    uint32_t watchdog_timeout_ms;
} Config;

static inline void Config_set_defaults(Config* config) {
    if (!config) return;
    /* 3 sensors sampled round-robin at 50 kHz each = 150 kHz aggregate */
    config->sample_rate_hz           = 150000;
    config->dma_buffer_samples       = 384;   /* 128 samples per sensor, divisible by 3 */
    config->calibration_duration_ms  = 1500;
    config->calibration_min_samples  = 30000; /* 10000 samples per sensor */
    config->noise_factor             = 4.5f;
    config->min_threshold_delta      = 25;
    config->lockout_duration_ms      = 25;
    config->decay_factor             = 0.995f;

    config->default_mode             = GAME_MODE_COUNT;
    config->timed_duration_s         = 30;
    config->race_target_hits         = 50;

    config->watchdog_timeout_ms      = 5000;
}

#ifdef __cplusplus
}
#endif

#endif /* COMMON_CONFIG_H */
