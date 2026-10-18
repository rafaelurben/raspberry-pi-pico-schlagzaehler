#ifndef OSAL_GPIO_DRIVER_H
#define OSAL_GPIO_DRIVER_H

#include <stdbool.h>
#include "../../Common/Events.h"
#include "../../Common/Config.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Callback invoked from GPIO ISR on button edge events.
 * @param button Button identifier (UP/DOWN/LEFT/RIGHT)
 * @param is_press_edge true if falling edge (active-low button pressed), false if rising edge
 * @param user_data User context pointer registered with GpioDriver_enable_button_irqs
 */
typedef void (*GpioButtonIrqCallback)(ButtonId button, bool is_press_edge, void* user_data);

/**
 * @brief Initialize button GPIO pins with internal pull-ups.
 */
void GpioDriver_init(void);

/**
 * @brief Register an interrupt callback for button presses and enable GPIO interrupts
 *        on the calling core (Core 0).
 */
void GpioDriver_enable_button_irqs(GpioButtonIrqCallback callback, void* user_data);

#ifdef __cplusplus
}
#endif

#endif /* OSAL_GPIO_DRIVER_H */
