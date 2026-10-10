#ifndef PLATFORM_PICO_USB_SERIAL_H
#define PLATFORM_PICO_USB_SERIAL_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Initialize USB serial hardware / buffers if needed.
 */
void PicoUsbSerial_init(void);

/**
 * @brief Non-blocking read of a complete line from USB serial.
 * @param buffer Destination buffer for line (excluding trailing newline).
 * @param max_len Capacity of destination buffer.
 * @return Positive length of received line if a full line is ready,
 *         0 if no complete line yet, or -1 on error.
 */
int PicoUsbSerial_read_line(char* buffer, size_t max_len);

/**
 * @brief Write a string to USB serial.
 */
void PicoUsbSerial_write_string(const char* str);

/**
 * @brief Write a newline-terminated string to USB serial.
 */
void PicoUsbSerial_write_line(const char* line);

#ifdef __cplusplus
}
#endif

#endif /* PLATFORM_PICO_USB_SERIAL_H */
