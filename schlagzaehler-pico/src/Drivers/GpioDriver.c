#include "GpioDriver.h"
#include "hardware/gpio.h"
#include <stddef.h>

static const uint8_t s_button_pins[BTN_ID_COUNT] = {
    [BTN_ID_UP]    = PIN_BTN_UP,
    [BTN_ID_DOWN]  = PIN_BTN_DOWN,
    [BTN_ID_LEFT]  = PIN_BTN_LEFT,
    [BTN_ID_RIGHT] = PIN_BTN_RIGHT
};

static GpioButtonIrqCallback s_irq_callback = NULL;
static void* s_irq_user_data = NULL;

static void gpio_irq_handler(uint gpio, uint32_t events) {
    if (!s_irq_callback) {
        return;
    }

    for (int i = 0; i < BTN_ID_COUNT; ++i) {
        if (s_button_pins[i] == gpio) {
            /* Active-low switch with pull-up: falling edge = pressed, rising edge = released */
            bool is_press_edge = (events & GPIO_IRQ_EDGE_FALL) && !(events & GPIO_IRQ_EDGE_RISE);
            if ((events & GPIO_IRQ_EDGE_FALL) && (events & GPIO_IRQ_EDGE_RISE)) {
                is_press_edge = !gpio_get(gpio);
            }
            s_irq_callback((ButtonId)i, is_press_edge, s_irq_user_data);
            break;
        }
    }
}

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

void GpioDriver_enable_button_irqs(GpioButtonIrqCallback callback, void* user_data) {
    s_irq_callback = callback;
    s_irq_user_data = user_data;

    const uint32_t event_mask = GPIO_IRQ_EDGE_FALL | GPIO_IRQ_EDGE_RISE;
    for (int i = 0; i < BTN_ID_COUNT; ++i) {
        uint pin = s_button_pins[i];
        if (i == 0) {
            gpio_set_irq_enabled_with_callback(pin, event_mask, true, &gpio_irq_handler);
        } else {
            gpio_set_irq_enabled(pin, event_mask, true);
        }
    }
}
