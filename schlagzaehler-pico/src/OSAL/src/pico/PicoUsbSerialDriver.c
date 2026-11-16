#include "../../inc/UsbSerialDriver.h"
#include "pico/stdlib.h"
#include <stdio.h>
#include <string.h>

#define USB_RX_BUF_SIZE 256

static char s_rx_buffer[USB_RX_BUF_SIZE];
static size_t s_rx_pos = 0;

void UsbSerialDriver_init(void) {
    s_rx_pos = 0;
    memset(s_rx_buffer, 0, sizeof(s_rx_buffer));
}

int UsbSerialDriver_read_line(char* buffer, size_t max_len) {
    if (!buffer || max_len == 0) return -1;

    /* Read all currently pending characters without blocking */
    int c;
    while ((c = getchar_timeout_us(0)) != PICO_ERROR_TIMEOUT) {
        if (c == '\r' || c == '\n') {
            if (s_rx_pos > 0) {
                /* Line complete */
                size_t copy_len = (s_rx_pos < max_len - 1) ? s_rx_pos : (max_len - 1);
                memcpy(buffer, s_rx_buffer, copy_len);
                buffer[copy_len] = '\0';
                s_rx_pos = 0;
                return (int)copy_len;
            }
            /* Ignore empty lines (\r\n) */
            continue;
        }

        if (s_rx_pos < sizeof(s_rx_buffer) - 1) {
            s_rx_buffer[s_rx_pos++] = (char)c;
        } else {
            /* Overflow buffer protection: reset */
            s_rx_pos = 0;
        }
    }

    return 0; /* No complete line ready */
}

int UsbSerialDriver_read_bytes(uint8_t* buffer, size_t max_len) {
    if (!buffer || max_len == 0) return -1;

    size_t count = 0;
    int c;
    while (count < max_len && (c = getchar_timeout_us(0)) != PICO_ERROR_TIMEOUT) {
        buffer[count++] = (uint8_t)c;
    }

    return (int)count;
}

int UsbSerialDriver_write_bytes(const uint8_t* buffer, size_t len) {
    if (!buffer || len == 0) return 0;
    size_t written = fwrite(buffer, 1, len, stdout);
    fflush(stdout);
    return (int)written;
}

void UsbSerialDriver_write_string(const char* str) {
    if (!str) return;
    fputs(str, stdout);
    fflush(stdout);
}

void UsbSerialDriver_write_line(const char* line) {
    if (!line) return;
    fputs(line, stdout);
    fputc('\n', stdout);
    fflush(stdout);
}
