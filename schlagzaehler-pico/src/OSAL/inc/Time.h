#ifndef OSAL_TIME_H
#define OSAL_TIME_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Get monotonic system time in microseconds since boot.
 */
uint64_t Time_now_us(void);

/**
 * @brief Get monotonic system time in milliseconds since boot.
 */
uint32_t Time_now_ms(void);

/**
 * @brief Busy-wait or sleep for specified microseconds.
 */
void Time_delay_us(uint32_t us);

/**
 * @brief Busy-wait or sleep for specified milliseconds.
 */
void Time_delay_ms(uint32_t ms);

#ifdef __cplusplus
}
#endif

#endif /* OSAL_TIME_H */
