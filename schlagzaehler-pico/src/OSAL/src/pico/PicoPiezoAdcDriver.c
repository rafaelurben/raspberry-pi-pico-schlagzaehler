#include "../../inc/PiezoAdcDriver.h"
#include "../../inc/Dma.h"
#include "hardware/adc.h"
#include "hardware/gpio.h"

#define MAX_DMA_BUFFER_SAMPLES 512

static uint16_t s_buffer0[MAX_DMA_BUFFER_SAMPLES];
static uint16_t s_buffer1[MAX_DMA_BUFFER_SAMPLES];
static size_t s_sample_count = 256;

static volatile uint8_t s_completed_index = 0;
static volatile bool s_has_new_buffer = false;
static volatile uint32_t s_driver_overruns = 0;
static volatile uint8_t s_warmup_buffers_to_skip = 0;
static bool s_is_running = false;

static void on_dma_buffer_complete(void* context, uint8_t buffer_index) {
    (void)context;
    if (s_warmup_buffers_to_skip > 0) {
        s_warmup_buffers_to_skip--;
        return;
    }
    if (s_has_new_buffer) {
        s_driver_overruns++;
    }
    s_completed_index = buffer_index;
    s_has_new_buffer = true;
}

bool PiezoAdcDriver_init(const Config* config) {
    if (!config) return false;

    s_sample_count = config->dma_buffer_samples;
    if (s_sample_count > MAX_DMA_BUFFER_SAMPLES) {
        s_sample_count = MAX_DMA_BUFFER_SAMPLES;
    }

    s_has_new_buffer = false;
    s_driver_overruns = 0;
    s_warmup_buffers_to_skip = 0;
    s_is_running = false;

    /* Initialize ADC hardware */
    adc_init();
    adc_gpio_init(PIN_PIEZO_ADC);
    adc_select_input(ADC_INPUT_CHANNEL);

    /* Setup ADC FIFO */
    adc_fifo_setup(
        true,   /* Write results to FIFO */
        true,   /* Enable DMA data request (DREQ) */
        1,      /* DREQ asserted when FIFO has >= 1 sample */
        false,  /* No error bit */
        false   /* 16-bit samples (do not shift to byte) */
    );

    /* Set clock divisor: 48MHz / sample_rate_hz - 1 */
    float clkdiv = 0.0f;
    if (config->sample_rate_hz > 0) {
        clkdiv = (48000000.0f / (float)config->sample_rate_hz) - 1.0f;
        if (clkdiv < 0.0f) clkdiv = 0.0f;
    }
    adc_set_clkdiv(clkdiv);

    /* Setup DMA double buffering */
    DmaAdcConfig dma_cfg = {
        .buffer0 = s_buffer0,
        .buffer1 = s_buffer1,
        .sample_count = s_sample_count,
        .callback = on_dma_buffer_complete,
        .user_data = NULL
    };

    return Dma_init_adc_double_buffer(&dma_cfg);
}

void PiezoAdcDriver_start(void) {
    if (s_is_running) return;

    s_has_new_buffer = false;
    s_warmup_buffers_to_skip = 2;

    /* Drain any stale FIFO samples */
    adc_fifo_drain();

    /* Start DMA and ADC free-running mode */
    Dma_start_adc();
    adc_run(true);
    s_is_running = true;
}

void PiezoAdcDriver_stop(void) {
    if (!s_is_running) return;

    adc_run(false);
    Dma_stop_adc();
    while (!(adc_hw->cs & ADC_CS_READY_BITS)) {
        tight_loop_contents();
    }
    adc_fifo_drain();
    s_has_new_buffer = false;
    s_warmup_buffers_to_skip = 0;
    s_is_running = false;
}

bool PiezoAdcDriver_is_running(void) {
    return s_is_running;
}

bool PiezoAdcDriver_poll_buffer(uint16_t** out_buffer, size_t* out_count) {
    if (!out_buffer || !out_count) return false;

    if (!s_has_new_buffer) {
        return false;
    }

    *out_buffer = (s_completed_index == 0) ? s_buffer0 : s_buffer1;
    *out_count = s_sample_count;
    s_has_new_buffer = false;

    return true;
}

void PiezoAdcDriver_release_buffer(void) {
    /* Ready for next buffer */
}

uint32_t PiezoAdcDriver_get_overrun_count(void) {
    return s_driver_overruns + Dma_get_overrun_count();
}
