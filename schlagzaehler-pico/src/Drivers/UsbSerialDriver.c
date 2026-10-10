#include "UsbSerialDriver.h"
#include "../Platform/Pico/PicoUsbSerial.h"

void UsbSerialDriver_init(void) {
    PicoUsbSerial_init();
}

int UsbSerialDriver_read_line(char* buffer, size_t max_len) {
    return PicoUsbSerial_read_line(buffer, max_len);
}

void UsbSerialDriver_write_line(const char* line) {
    PicoUsbSerial_write_line(line);
}
