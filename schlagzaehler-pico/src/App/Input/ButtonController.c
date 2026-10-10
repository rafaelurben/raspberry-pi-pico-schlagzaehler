#include "ButtonController.h"
#include "../../Drivers/GpioDriver.h"
#include "../../OSAL/Time.h"

void ButtonController_init(ButtonController* ctrl) {
    if (!ctrl) return;

    uint64_t now = Time_now_us();
    ctrl->debounce_time_us = 25000; /* 25 ms debounce */
    ctrl->has_pending_event = false;

    for (int i = 0; i < BTN_ID_COUNT; ++i) {
        bool pressed = GpioDriver_is_button_pressed((ButtonId)i);
        ctrl->last_raw_state[i] = pressed;
        ctrl->debounced_state[i] = pressed;
        ctrl->last_change_time_us[i] = now;
    }
}

bool ButtonController_poll_event(ButtonController* ctrl, ButtonEvent* out_event) {
    if (!ctrl || !out_event) return false;

    if (ctrl->has_pending_event) {
        *out_event = ctrl->pending_event;
        ctrl->has_pending_event = false;
        return true;
    }

    uint64_t now = Time_now_us();

    for (int i = 0; i < BTN_ID_COUNT; ++i) {
        ButtonId btn = (ButtonId)i;
        bool raw = GpioDriver_is_button_pressed(btn);

        if (raw != ctrl->last_raw_state[i]) {
            ctrl->last_raw_state[i] = raw;
            ctrl->last_change_time_us[i] = now;
        }

        if ((now - ctrl->last_change_time_us[i]) >= ctrl->debounce_time_us) {
            if (raw != ctrl->debounced_state[i]) {
                ctrl->debounced_state[i] = raw;

                /* Trigger event on press (falling edge of active-low switch) */
                if (raw) {
                    out_event->button = btn;
                    out_event->pressed = true;
                    out_event->timestamp_us = now;
                    return true;
                }
            }
        }
    }

    return false;
}
