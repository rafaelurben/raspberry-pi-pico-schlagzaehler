#include "../../OSAL/Time.h"
#include "pico/stdlib.h"
#include "hardware/timer.h"

uint64_t Time_now_us(void) {
    return time_us_64();
}

uint32_t Time_now_ms(void) {
    return (uint32_t)(time_us_64() / 1000ULL);
}

void Time_delay_us(uint32_t us) {
    sleep_us(us);
}

void Time_delay_ms(uint32_t ms) {
    sleep_ms(ms);
}
