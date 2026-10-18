#include "../../inc/Dma.h"
#include "hardware/dma.h"
#include "hardware/adc.h"
#include "hardware/irq.h"
#include <stddef.h>

static int s_chan0 = -1;
static int s_chan1 = -1;
static uint16_t* s_buffer0 = NULL;
static uint16_t* s_buffer1 = NULL;
static size_t s_sample_count = 0;
static DmaBufferCompleteCallback s_callback = NULL;
static void* s_callback_context = NULL;

static volatile uint32_t s_transfer_count = 0;
static volatile uint32_t s_overrun_count = 0;
static volatile bool s_buf0_pending = false;
static volatile bool s_buf1_pending = false;

static void dma_irq_handler(void) {
    if (s_chan0 >= 0 && dma_channel_get_irq0_status(s_chan0)) {
        dma_channel_acknowledge_irq0(s_chan0);

        if (s_buf0_pending) {
            s_overrun_count++;
        }
        s_buf0_pending = true;
        s_transfer_count++;

        /* Re-arm channel 0 for next ping-pong cycle */
        dma_channel_set_write_addr(s_chan0, s_buffer0, false);
        dma_channel_set_trans_count(s_chan0, s_sample_count, false);

        if (s_callback) {
            s_callback(s_callback_context, 0);
        }
    }

    if (s_chan1 >= 0 && dma_channel_get_irq0_status(s_chan1)) {
        dma_channel_acknowledge_irq0(s_chan1);

        if (s_buf1_pending) {
            s_overrun_count++;
        }
        s_buf1_pending = true;
        s_transfer_count++;

        /* Re-arm channel 1 for next ping-pong cycle */
        dma_channel_set_write_addr(s_chan1, s_buffer1, false);
        dma_channel_set_trans_count(s_chan1, s_sample_count, false);

        if (s_callback) {
            s_callback(s_callback_context, 1);
        }
    }
}

static void configure_dma_channels(void) {
    /* Channel 0 configuration */
    dma_channel_config c0 = dma_channel_get_default_config(s_chan0);
    channel_config_set_transfer_data_size(&c0, DMA_SIZE_16);
    channel_config_set_read_increment(&c0, false);
    channel_config_set_write_increment(&c0, true);
    channel_config_set_dreq(&c0, DREQ_ADC);
    channel_config_set_chain_to(&c0, s_chan1);

    dma_channel_configure(
        s_chan0,
        &c0,
        s_buffer0,             /* dest */
        &adc_hw->fifo,         /* src */
        s_sample_count,        /* count */
        false                  /* don't start yet */
    );

    /* Channel 1 configuration */
    dma_channel_config c1 = dma_channel_get_default_config(s_chan1);
    channel_config_set_transfer_data_size(&c1, DMA_SIZE_16);
    channel_config_set_read_increment(&c1, false);
    channel_config_set_write_increment(&c1, true);
    channel_config_set_dreq(&c1, DREQ_ADC);
    channel_config_set_chain_to(&c1, s_chan0);

    dma_channel_configure(
        s_chan1,
        &c1,
        s_buffer1,             /* dest */
        &adc_hw->fifo,         /* src */
        s_sample_count,        /* count */
        false                  /* don't start yet */
    );
}

bool Dma_init_adc_double_buffer(const DmaAdcConfig* config) {
    if (!config || !config->buffer0 || !config->buffer1 || config->sample_count == 0) {
        return false;
    }

    s_buffer0 = config->buffer0;
    s_buffer1 = config->buffer1;
    s_sample_count = config->sample_count;
    s_callback = config->callback;
    s_callback_context = config->user_data;

    s_transfer_count = 0;
    s_overrun_count = 0;
    s_buf0_pending = false;
    s_buf1_pending = false;

    if (s_chan0 < 0) {
        s_chan0 = dma_claim_unused_channel(false);
        if (s_chan0 < 0) return false;
    }

    if (s_chan1 < 0) {
        s_chan1 = dma_claim_unused_channel(false);
        if (s_chan1 < 0) {
            dma_channel_unclaim(s_chan0);
            s_chan0 = -1;
            return false;
        }
    }

    configure_dma_channels();

    /* IRQ setup */
    dma_channel_set_irq0_enabled(s_chan0, true);
    dma_channel_set_irq0_enabled(s_chan1, true);
    irq_set_exclusive_handler(DMA_IRQ_0, dma_irq_handler);
    irq_set_enabled(DMA_IRQ_0, true);

    return true;
}

void Dma_start_adc(void) {
    if (s_chan0 >= 0 && s_chan1 >= 0) {
        s_buf0_pending = false;
        s_buf1_pending = false;
        configure_dma_channels();
        dma_channel_acknowledge_irq0(s_chan0);
        dma_channel_acknowledge_irq0(s_chan1);
        dma_channel_set_irq0_enabled(s_chan0, true);
        dma_channel_set_irq0_enabled(s_chan1, true);
        dma_channel_start(s_chan0);
    }
}

void Dma_stop_adc(void) {
    if (s_chan0 >= 0 && s_chan1 >= 0) {
        dma_channel_set_irq0_enabled(s_chan0, false);
        dma_channel_set_irq0_enabled(s_chan1, false);

        /* Disable chaining before aborting (prevents RP2040-E13 chain trigger during abort) */
        dma_channel_config c0 = dma_get_channel_config(s_chan0);
        channel_config_set_chain_to(&c0, s_chan0);
        dma_channel_set_config(s_chan0, &c0, false);

        dma_channel_config c1 = dma_get_channel_config(s_chan1);
        channel_config_set_chain_to(&c1, s_chan1);
        dma_channel_set_config(s_chan1, &c1, false);

        uint32_t mask = (1u << (uint32_t)s_chan0) | (1u << (uint32_t)s_chan1);
        dma_hw->abort = mask;
        while (dma_hw->abort & mask) {
            tight_loop_contents();
        }

        dma_channel_acknowledge_irq0(s_chan0);
        dma_channel_acknowledge_irq0(s_chan1);
        s_buf0_pending = false;
        s_buf1_pending = false;
    }
}

uint32_t Dma_get_transfer_count(void) {
    return s_transfer_count;
}

uint32_t Dma_get_overrun_count(void) {
    return s_overrun_count;
}
