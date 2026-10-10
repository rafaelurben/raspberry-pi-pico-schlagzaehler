#ifndef PLATFORM_PICO_BOARD_H
#define PLATFORM_PICO_BOARD_H

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Initialize Pico hardware, stdio (UART/USB), and LED.
 */
void PicoBoard_init(void);

/**
 * @brief Turn board LED on or off (supports Pico and Pico W).
 */
void PicoBoard_set_led(bool on);

/**
 * @brief Toggle board LED.
 */
void PicoBoard_toggle_led(void);

#ifdef __cplusplus
}
#endif

#endif /* PLATFORM_PICO_BOARD_H */
