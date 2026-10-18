#ifndef OSAL_DISPLAY_DRIVER_H
#define OSAL_DISPLAY_DRIVER_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* RGB565 Color Definitions */
#define DISPLAY_COLOR_BLACK     0x0000
#define DISPLAY_COLOR_WHITE     0xFFFF
#define DISPLAY_COLOR_RED       0xF800
#define DISPLAY_COLOR_GREEN     0x07E0
#define DISPLAY_COLOR_BLUE      0x001F
#define DISPLAY_COLOR_CYAN      0x07FF
#define DISPLAY_COLOR_YELLOW    0xFFE0
#define DISPLAY_COLOR_MAGENTA   0xF81F
#define DISPLAY_COLOR_ORANGE    0xFC00
#define DISPLAY_COLOR_GRAY      0x8410
#define DISPLAY_COLOR_DARKGRAY  0x3186

/* Font IDs */
typedef enum {
    DISPLAY_FONT_DEFAULT = 1,   /* 8x8 font */
    DISPLAY_FONT_PICO    = 2,   /* 8x12 font */
    DISPLAY_FONT_RETRO   = 5,   /* 8x16 font */
    DISPLAY_FONT_BIG     = 6    /* 16x16 font */
} DisplayFontId;

/**
 * @brief Initialize ST7735 display hardware, SPI, and GPIO.
 */
bool DisplayDriver_init(void);

/**
 * @brief Clear entire screen with specified color.
 */
void DisplayDriver_clear(uint16_t color);

/**
 * @brief Fill a solid rectangular area.
 */
void DisplayDriver_fill_rect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t color);

/**
 * @brief Draw an outline rectangle.
 */
void DisplayDriver_draw_rect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t color);

/**
 * @brief Draw a line from (x0, y0) to (x1, y1).
 */
void DisplayDriver_draw_line(int16_t x0, int16_t y0, int16_t x1, int16_t y1, uint16_t color);

/**
 * @brief Draw a text string at (x, y) with specified foreground and background colors.
 */
void DisplayDriver_draw_string(int16_t x, int16_t y, const char* str, uint16_t fg_color, uint16_t bg_color, DisplayFontId font_id);

/**
 * @brief Get display width in pixels.
 */
uint16_t DisplayDriver_get_width(void);

/**
 * @brief Get display height in pixels.
 */
uint16_t DisplayDriver_get_height(void);

#ifdef __cplusplus
}
#endif

#endif /* OSAL_DISPLAY_DRIVER_H */
