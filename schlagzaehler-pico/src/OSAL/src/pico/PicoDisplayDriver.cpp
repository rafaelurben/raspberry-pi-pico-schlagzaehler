#include "../../inc/DisplayDriver.h"
#include "../../../Common/Config.h"
#include "displaylib_16/st7735.hpp"
#include "displaylib_16/displaylib_16_Font.hpp"

static ST7735_TFT s_tft;
static bool s_initialized = false;

extern "C" bool DisplayDriver_init(void) {
    s_tft.TFTInitSPIType(8000, spi0);
    s_tft.setupGPIO(PIN_DISPLAY_RST, PIN_DISPLAY_DC, PIN_DISPLAY_CS, PIN_DISPLAY_SCLK, PIN_DISPLAY_MOSI);
    s_tft.TFTInitScreenSize(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
    s_tft.TFTInitPCBType(ST7735_TFT::TFT_ST7735S_Black);
    s_tft.fillScreen(ST7735_TFT::C_BLACK);
    s_tft.setRotation(ST7735_TFT::Degrees_0);
    s_initialized = true;
    return true;
}

extern "C" void DisplayDriver_clear(uint16_t color) {
    if (!s_initialized) return;
    s_tft.fillScreen(color);
}

extern "C" void DisplayDriver_fill_rect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t color) {
    if (!s_initialized || w <= 0 || h <= 0) return;
    s_tft.fillRect((uint16_t)x, (uint16_t)y, (uint16_t)w, (uint16_t)h, color);
}

extern "C" void DisplayDriver_draw_rect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t color) {
    if (!s_initialized || w <= 0 || h <= 0) return;
    s_tft.drawRectWH((uint16_t)x, (uint16_t)y, (uint16_t)w, (uint16_t)h, color);
}

extern "C" void DisplayDriver_draw_line(int16_t x0, int16_t y0, int16_t x1, int16_t y1, uint16_t color) {
    if (!s_initialized) return;
    s_tft.drawLine(x0, y0, x1, y1, color);
}

extern "C" void DisplayDriver_draw_string(int16_t x, int16_t y, const char* str, uint16_t fg_color, uint16_t bg_color, DisplayFontId font_id) {
    if (!s_initialized || !str) return;

    switch (font_id) {
        case DISPLAY_FONT_PICO:
            s_tft.setFont(font_pico);
            break;
        case DISPLAY_FONT_RETRO:
            s_tft.setFont(font_retro);
            break;
        case DISPLAY_FONT_BIG:
            s_tft.setFont(font_mega);
            break;
        case DISPLAY_FONT_DEFAULT:
        default:
            s_tft.setFont(font_default);
            break;
    }

    s_tft.setTextColor(fg_color, bg_color);
    s_tft.writeCharString(x, y, str);
}

extern "C" uint16_t DisplayDriver_get_width(void) {
    return DISPLAY_WIDTH;
}

extern "C" uint16_t DisplayDriver_get_height(void) {
    return DISPLAY_HEIGHT;
}
