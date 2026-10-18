#ifndef OSAL_INTERRUPT_H
#define OSAL_INTERRUPT_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Disable interrupts globally and return previous interrupt mask state.
 */
uint32_t Interrupt_disable(void);

/**
 * @brief Restore interrupts to previous state returned by Interrupt_disable().
 */
void Interrupt_restore(uint32_t status);

#ifdef __cplusplus
}
#endif

#endif /* OSAL_INTERRUPT_H */
