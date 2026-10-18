#include "ButtonController.h"
#include "../../Drivers/GpioDriver.h"
#include "../../OSAL/Time.h"
#include "../../OSAL/Interrupt.h"

static void button_irq_trampoline(ButtonId button, bool is_press_edge, void* user_data) {
    ButtonController* ctrl = (ButtonController*)user_data;
    ButtonController_on_irq(ctrl, button, is_press_edge);
}

void ButtonController_init(ButtonController* ctrl) {
    if (!ctrl) return;

    ctrl->debounce_time_us = 25000; /* 25 ms debounce */
    ctrl->queue_head = 0;
    ctrl->queue_count = 0;

    for (int i = 0; i < BTN_ID_COUNT; ++i) {
        ctrl->last_change_time_us[i] = 0;
    }

    GpioDriver_enable_button_irqs(button_irq_trampoline, ctrl);
}

void ButtonController_on_irq(ButtonController* ctrl, ButtonId button, bool is_press_edge) {
    if (!ctrl || button >= BTN_ID_COUNT) return;

    uint64_t now = Time_now_us();
    uint64_t prev_time = ctrl->last_change_time_us[button];
    ctrl->last_change_time_us[button] = now;

    if (is_press_edge && (prev_time == 0 || (now - prev_time) >= ctrl->debounce_time_us)) {
        uint32_t irq_state = Interrupt_disable();
        if (ctrl->queue_count < BUTTON_EVENT_QUEUE_CAPACITY) {
            uint8_t write_idx = (uint8_t)((ctrl->queue_head + ctrl->queue_count) % BUTTON_EVENT_QUEUE_CAPACITY);
            ctrl->event_queue[write_idx] = (ButtonEvent){
                .button = button,
                .pressed = true,
                .timestamp_us = now
            };
            ctrl->queue_count++;
        }
        Interrupt_restore(irq_state);
    }
}

bool ButtonController_pop_event(ButtonController* ctrl, ButtonEvent* out_event) {
    if (!ctrl || !out_event) return false;

    bool has_event = false;
    uint32_t irq_state = Interrupt_disable();
    if (ctrl->queue_count > 0) {
        *out_event = ctrl->event_queue[ctrl->queue_head];
        ctrl->queue_head = (uint8_t)((ctrl->queue_head + 1) % BUTTON_EVENT_QUEUE_CAPACITY);
        ctrl->queue_count--;
        has_event = true;
    }
    Interrupt_restore(irq_state);

    return has_event;
}
