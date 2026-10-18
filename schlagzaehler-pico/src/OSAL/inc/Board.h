#ifndef OSAL_BOARD_H
#define OSAL_BOARD_H

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Initialize board hardware, stdio (UART/USB), and status LED.
 */
void Board_init(void);

/**
 * @brief Turn board status LED on or off.
 */
void Board_set_led(bool on);

/**
 * @brief Toggle board status LED.
 */
void Board_toggle_led(void);

#ifdef __cplusplus
}
#endif

#endif /* OSAL_BOARD_H */
