#ifndef DRIVERS_GPIO_DRIVER_H
#define DRIVERS_GPIO_DRIVER_H

#include <stdbool.h>
#include "../Common/Events.h"
#include "../Common/Config.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Initialize button GPIO pins with internal pull-ups.
 */
void GpioDriver_init(void);

/**
 * @brief Read immediate physical button state (active low, returns true if pressed).
 */
bool GpioDriver_is_button_pressed(ButtonId button);

#ifdef __cplusplus
}
#endif

#endif /* DRIVERS_GPIO_DRIVER_H */
