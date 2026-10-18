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
    volatile bool is_button_down[BTN_ID_COUNT];
    volatile uint64_t last_edge_time_us;

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

/**
 * @brief Check if any button is currently held down or recently had an interrupt edge.
 * @param ctrl ButtonController instance
 * @param settle_ms Settling duration after the last edge in milliseconds
 * @return true if a button is held or within the post-edge settling window
 */
bool ButtonController_is_active_or_settling(const ButtonController* ctrl, uint32_t settle_ms);

#ifdef __cplusplus
}
#endif

#endif /* APP_INPUT_BUTTON_CONTROLLER_H */
