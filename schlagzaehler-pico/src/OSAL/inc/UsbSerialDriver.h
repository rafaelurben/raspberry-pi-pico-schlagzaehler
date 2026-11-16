#ifndef OSAL_USB_SERIAL_DRIVER_H
#define OSAL_USB_SERIAL_DRIVER_H

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Initialize USB serial hardware / buffers if needed.
 */
void UsbSerialDriver_init(void);

/**
 * @brief Non-blocking check for an incoming newline-delimited command.
 * @return length of line if received, 0 if nothing, -1 on error.
 */
int UsbSerialDriver_read_line(char* buffer, size_t max_len);

/**
 * @brief Non-blocking read of raw binary bytes from USB serial.
 * @return Number of bytes actually read (0 if nothing, -1 on error).
 */
int UsbSerialDriver_read_bytes(uint8_t* buffer, size_t max_len);

/**
 * @brief Write raw binary bytes to USB serial.
 * @return Number of bytes written.
 */
int UsbSerialDriver_write_bytes(const uint8_t* buffer, size_t len);

/**
 * @brief Write a string to USB serial.
 */
void UsbSerialDriver_write_string(const char* str);

/**
 * @brief Send a line over USB serial (appends newline).
 */
void UsbSerialDriver_write_line(const char* line);

#ifdef __cplusplus
}
#endif

#endif /* OSAL_USB_SERIAL_DRIVER_H */
