#ifndef OSAL_DMA_H
#define OSAL_DMA_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void (*DmaBufferCompleteCallback)(void* context, uint8_t buffer_index);

typedef struct {
    uint16_t* buffer0;
    uint16_t* buffer1;
    size_t sample_count;
    DmaBufferCompleteCallback callback;
    void* user_data;
} DmaAdcConfig;

/**
 * @brief Configure double-buffered DMA for continuous ADC sampling.
 */
bool Dma_init_adc_double_buffer(const DmaAdcConfig* config);

/**
 * @brief Start continuous DMA transfers.
 */
void Dma_start_adc(void);

/**
 * @brief Stop continuous DMA transfers.
 */
void Dma_stop_adc(void);

/**
 * @brief Query total DMA buffer transfer completions.
 */
uint32_t Dma_get_transfer_count(void);

/**
 * @brief Query number of detected buffer overwrite/overrun conditions.
 */
uint32_t Dma_get_overrun_count(void);

#ifdef __cplusplus
}
#endif

#endif /* OSAL_DMA_H */
