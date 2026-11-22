#include "../../inc/UsbSerialDriver.h"
#include "pico/stdlib.h"
#include <stdio.h>
#include <string.h>

void UsbSerialDriver_init(void) {
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

void UsbSerialDriver_write_line(const char* line) {
    if (!line) return;
    fputs(line, stdout);
    fputc('\n', stdout);
    fflush(stdout);
}
