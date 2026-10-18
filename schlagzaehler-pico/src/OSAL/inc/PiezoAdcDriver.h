#ifndef OSAL_PIEZO_ADC_DRIVER_H
#define OSAL_PIEZO_ADC_DRIVER_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include "../../Common/Config.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Initialize ADC hardware, FIFO, and DMA ping-pong buffers.
 */
bool PiezoAdcDriver_init(const Config* config);

/**
 * @brief Start continuous ADC sampling and DMA transfer.
 */
void PiezoAdcDriver_start(void);

/**
 * @brief Stop sampling.
 */
void PiezoAdcDriver_stop(void);

/**
 * @brief Check if ADC sampling and DMA are currently active.
 */
bool PiezoAdcDriver_is_running(void);

/**
 * @brief Retrieve next completed DMA buffer if ready.
 * @param out_buffer Filled with pointer to buffer samples.
 * @param out_count Filled with number of samples.
 * @return true if a new completed buffer was available, false otherwise.
 */
bool PiezoAdcDriver_poll_buffer(uint16_t** out_buffer, size_t* out_count);

/**
 * @brief Release currently processed buffer, making it available again.
 */
void PiezoAdcDriver_release_buffer(void);

/**
 * @brief Get total buffer overruns / drops.
 */
uint32_t PiezoAdcDriver_get_overrun_count(void);

#ifdef __cplusplus
}
#endif

#endif /* OSAL_PIEZO_ADC_DRIVER_H */
