#include "GpioDriver.h"
#include "hardware/gpio.h"

static const uint8_t s_button_pins[BTN_ID_COUNT] = {
    [BTN_ID_UP]    = PIN_BTN_UP,
    [BTN_ID_DOWN]  = PIN_BTN_DOWN,
    [BTN_ID_LEFT]  = PIN_BTN_LEFT,
    [BTN_ID_RIGHT] = PIN_BTN_RIGHT
};

void GpioDriver_init(void) {
    for (int i = 0; i < BTN_ID_COUNT; ++i) {
        uint pin = s_button_pins[i];
        gpio_init(pin);
        gpio_set_dir(pin, GPIO_IN);
        gpio_pull_up(pin);
    }
    gpio_init(PIN_DISPLAY_BL);
    gpio_set_dir(PIN_DISPLAY_BL, GPIO_OUT);
    gpio_put(PIN_DISPLAY_BL, 1); // Turn on backlight
}

bool GpioDriver_is_button_pressed(ButtonId button) {
    if (button >= BTN_ID_COUNT) return false;
    uint pin = s_button_pins[button];
    /* Active-low: pressed connects to ground */
    return !gpio_get(pin);
}
