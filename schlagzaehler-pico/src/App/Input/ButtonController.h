#ifndef APP_INPUT_BUTTON_CONTROLLER_H
#define APP_INPUT_BUTTON_CONTROLLER_H

#include <stdint.h>
#include <stdbool.h>
#include "../../Common/Events.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    bool last_raw_state[BTN_ID_COUNT];
    bool debounced_state[BTN_ID_COUNT];
    uint64_t last_change_time_us[BTN_ID_COUNT];
    uint32_t debounce_time_us;

    /* Single event queue slot or pending event */
    bool has_pending_event;
    ButtonEvent pending_event;
} ButtonController;

void ButtonController_init(ButtonController* ctrl);

/**
 * @brief Update debouncing logic and poll for newly pressed button events.
 * @return true if a button press event occurred.
 */
bool ButtonController_poll_event(ButtonController* ctrl, ButtonEvent* out_event);

#ifdef __cplusplus
}
#endif

#endif /* APP_INPUT_BUTTON_CONTROLLER_H */
