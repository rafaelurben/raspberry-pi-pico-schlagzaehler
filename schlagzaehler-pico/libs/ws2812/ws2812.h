#ifndef WS2812_H
#define WS2812_H

/**
 * Copyright (c) 2020 Raspberry Pi (Trading) Ltd.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include <stdint.h>

#include "pico/stdlib.h"
#include "hardware/pio.h"
#include "hardware/clocks.h"

/**
 * NOTE:
 * Take into consideration if your WS2812 is a RGB or RGBW variant.
 *
 * If it is RGBW, set IS_RGBW to true and provide 4 bytes per pixel
 * (Red, Green, Blue, White) and use urgbw_u32().
 *
 * If it is RGB, set IS_RGBW to false and provide 3 bytes per pixel
 * (Red, Green, Blue) and use urgb_u32().
 *
 * When RGBW is used with urgb_u32(), the White channel will be ignored.
 */
#define IS_RGBW false
#define NUM_PIXELS 4

#ifdef PICO_DEFAULT_WS2812_PIN
#define WS2812_PIN PICO_DEFAULT_WS2812_PIN
#else
// Default to pin 1 if the board doesn't have a default WS2812 pin defined.
#define WS2812_PIN 1
#endif

// Check the pin is compatible with the platform.
#if WS2812_PIN >= NUM_BANK0_GPIOS
#error Attempting to use a pin >= 32 on a platform that does not support it
#endif

/**
 * Send a pixel value to the WS2812 PIO state machine.
 *
 * @param pio PIO instance.
 * @param sm PIO state machine number.
 * @param pixel_grb Pixel data in GRB format.
 */
static inline void put_pixel(PIO pio, uint sm, uint32_t pixel_grb)
{
    pio_sm_put_blocking(pio, sm, pixel_grb << 8u);
}

/**
 * Convert RGB values to the 32-bit format expected by the WS2812 PIO.
 *
 * @param r Red component.
 * @param g Green component.
 * @param b Blue component.
 * @return Encoded pixel value.
 */
static inline uint32_t urgb_u32(uint8_t r, uint8_t g, uint8_t b)
{
    return ((uint32_t)(r) << 8) |
           ((uint32_t)(g) << 16) |
           (uint32_t)(b);
}

/**
 * Convert RGBW values to the 32-bit format expected by the WS2812 PIO.
 *
 * @param r Red component.
 * @param g Green component.
 * @param b Blue component.
 * @param w White component.
 * @return Encoded pixel value.
 */
static inline uint32_t urgbw_u32(uint8_t r, uint8_t g, uint8_t b, uint8_t w)
{
    return ((uint32_t)(r) << 8) |
           ((uint32_t)(g) << 16) |
           ((uint32_t)(w) << 24) |
           (uint32_t)(b);
}

/**
 * Function pointer type for LED animation patterns.
 */
typedef void (*pattern)(PIO pio, uint sm, uint len, uint t);

/**
 * Pattern descriptor.
 */
typedef struct
{
    pattern pat;
    const char *name;
} pattern_entry_t;

/**
 * LED animation patterns.
 */
void pattern_snakes(PIO pio, uint sm, uint len, uint t);
void pattern_random(PIO pio, uint sm, uint len, uint t);
void pattern_sparkle(PIO pio, uint sm, uint len, uint t);
void pattern_greys(PIO pio, uint sm, uint len, uint t);

/**
 * Pattern table.
 */
extern const pattern_entry_t pattern_table[];
extern const size_t pattern_table_count;

#endif /* WS2812_H */
