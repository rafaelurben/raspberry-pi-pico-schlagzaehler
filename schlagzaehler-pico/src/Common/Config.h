#ifndef COMMON_CONFIG_H
#define COMMON_CONFIG_H

#include <stdint.h>
#include <stdbool.h>
#include "GameTypes.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Hardware Pin Definitions */
#define PIN_PIEZO_ADC           26  /* GPIO 26 / ADC 0 */
#define ADC_INPUT_CHANNEL       0

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
    config->sample_rate_hz           = 50000;
    config->dma_buffer_samples       = 256;
    config->calibration_duration_ms  = 1500;
    config->calibration_min_samples  = 10000;
    config->noise_factor             = 4.5f;
    config->min_threshold_delta      = 25;
    config->lockout_duration_ms      = 100;
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
