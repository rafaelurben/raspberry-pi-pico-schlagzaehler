/**
 * @file piezo_analyzer.c
 * @author Rafael Urben
 * @brief A small script to analyze piezo sensor data from the ADC and output it in CSV format.
 * @version 0.1
 * @date 2026-08-21
 * 
 * @copyright Copyright (c) 2026 Rafael Urben
 * 
 */

#include <stdio.h>
#include <stdint.h>

#include "pico/stdlib.h"
#include "hardware/adc.h"

#define ADC_PIN 26
#define ADC_INPUT 0

#define SAMPLE_RATE_HZ 10000
#define SAMPLE_PERIOD_US (1000000 / SAMPLE_RATE_HZ)

#define PRE_TRIGGER 100     // Number of samples to capture before the trigger event
#define POST_TRIGGER 20000  // Number of samples to capture after the trigger event

#define TRIGGER_THRESHOLD 100   // ADC value threshold to detect a hit

#define BUFFER_SIZE (PRE_TRIGGER + POST_TRIGGER)

static uint16_t buffer[BUFFER_SIZE];

int main(void)
{
    stdio_init_all();

    adc_init();
    adc_gpio_init(ADC_PIN);
    adc_select_input(ADC_INPUT);

    sleep_ms(2000);

    printf("Piezo analyzer\n");
    printf("Sample rate: %d Hz\n", SAMPLE_RATE_HZ);
    printf("Trigger threshold: %d\n", TRIGGER_THRESHOLD);
    printf("\n");

    uint32_t sample = 0;

    /*
     * Circular buffer containing the samples immediately
     * preceding the trigger.
     */
    uint16_t circular[PRE_TRIGGER];
    uint32_t circular_index = 0;

    absolute_time_t next_sample = get_absolute_time();

    while (true)
    {
        /*
         * Wait for the next sample time.
         */
        sleep_until(next_sample);

        next_sample = delayed_by_us(
            next_sample,
            SAMPLE_PERIOD_US);

        uint16_t value = adc_read();

        /*
         * Store sample in circular buffer.
         */
        circular[circular_index] = value;

        circular_index++;
        if (circular_index >= PRE_TRIGGER)
            circular_index = 0;

        /*
         * Trigger detection.
         */
        if (value >= TRIGGER_THRESHOLD)
        {
            printf("TRIGGER\n");
            /*
             * We have detected a possible hit.
             *
             * First copy the previous samples from the
             * circular buffer into the output buffer.
             */

            for (uint32_t i = 0; i < PRE_TRIGGER; i++)
            {
                uint32_t index =
                    (circular_index + i) % PRE_TRIGGER;

                buffer[i] = circular[index];
            }

            /*
             * The current sample is already the first
             * post-trigger sample.
             */
            buffer[PRE_TRIGGER] = value;

            /*
             * Capture the remaining samples.
             */
            for (uint32_t i = PRE_TRIGGER + 1;
                 i < BUFFER_SIZE;
                 i++)
            {
                sleep_until(next_sample);

                next_sample = delayed_by_us(
                    next_sample,
                    SAMPLE_PERIOD_US);

                buffer[i] = adc_read();
            }

            /*
             * Output CSV.
             */
            printf("sample,adc\n");

            for (uint32_t i = 0; i < BUFFER_SIZE; i++)
            {
                printf(
                    "%lu,%u\n",
                    i,
                    buffer[i]);
            }

            printf("END\n\n");

            /*
             * Wait until the signal falls below the threshold
             * before allowing another trigger.
             *
             * This prevents one hit from producing multiple
             * captures.
             */
            while (adc_read() >= TRIGGER_THRESHOLD)
            {
                sleep_us(100);
            }

            /*
             * Additional dead time to avoid detecting the
             * same hit again because of ringing.
             */
            sleep_ms(50);

            /*
             * Reset sampling schedule after the capture.
             */
            next_sample = get_absolute_time();
        }

        sample++;
    }
}
