#ifndef APP_INPUT_BUTTON_CONTROLLER_H
#define APP_INPUT_BUTTON_CONTROLLER_H

#include <stdint.h>
#include <stdbool.h>
#include "../../Common/Events.h"

#ifdef __cplusplus
extern "C" {
#endif

#define BUTTON_EVENT_QUEUE_CAPACITY 8

typedef struct {
    uint64_t last_change_time_us[BTN_ID_COUNT];
    uint32_t debounce_time_us;

    /* Interrupt-safe ring buffer for detected button press events */
    ButtonEvent event_queue[BUTTON_EVENT_QUEUE_CAPACITY];
    volatile uint8_t queue_head;
    volatile uint8_t queue_count;
} ButtonController;

/**
 * @brief Initialize the button controller and register GPIO interrupts.
 */
void ButtonController_init(ButtonController* ctrl);

/**
 * @brief Handle a GPIO button edge interrupt (called from ISR context).
 * @param ctrl ButtonController instance
 * @param button Button identifier (UP/DOWN/LEFT/RIGHT)
 * @param is_press_edge true if falling edge (active-low button pressed), false if rising edge
 */
void ButtonController_on_irq(ButtonController* ctrl, ButtonId button, bool is_press_edge);

/**
 * @brief Pop the next interrupt-triggered button press event from the queue.
 * @return true if an event was available and written to out_event.
 */
bool ButtonController_pop_event(ButtonController* ctrl, ButtonEvent* out_event);

#ifdef __cplusplus
}
#endif

#endif /* APP_INPUT_BUTTON_CONTROLLER_H */
