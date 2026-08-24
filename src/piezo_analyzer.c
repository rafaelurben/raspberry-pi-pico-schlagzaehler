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

#define SAMPLE_INTERVAL_US 100                        // Interval between samples in microseconds
#define SAMPLE_RATE_HZ (1000000 / SAMPLE_INTERVAL_US) // Sample rate in Hz

#define SAMPLE_COUNT_PRE_TRIGGER (SAMPLE_RATE_HZ / 10) // Number of samples to capture before the trigger event (0.1 seconds worth of samples)
#define SAMPLE_COUNT_POST_TRIGGER (SAMPLE_RATE_HZ * 1) // Number of samples to capture after the trigger event (1 second worth of samples)
#define SAMPLE_BUFFER_SIZE (SAMPLE_COUNT_PRE_TRIGGER + SAMPLE_COUNT_POST_TRIGGER)

extern uint16_t hit_threshold; // Threshold for hit detection

void run_piezo_analyzer(void)
{
    static uint16_t buffer[SAMPLE_BUFFER_SIZE];

    printf("Piezo analyzer\n");
    printf("Sample rate: %d Hz\n", SAMPLE_RATE_HZ);
    printf("Trigger threshold: %d\n", hit_threshold);
    printf("\n");

    uint32_t sample = 0;

    /*
     * Circular buffer containing the samples immediately
     * preceding the trigger.
     */
    uint16_t circular[SAMPLE_COUNT_PRE_TRIGGER];
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
            SAMPLE_INTERVAL_US);

        uint16_t value = adc_read();

        /*
         * Store sample in circular buffer.
         */
        circular[circular_index] = value;

        circular_index++;
        if (circular_index >= SAMPLE_COUNT_PRE_TRIGGER)
            circular_index = 0;

        /*
         * Trigger detection.
         */
        if (value >= hit_threshold)
        {
            printf("TRIGGER\n");
            /*
             * We have detected a possible hit.
             *
             * First copy the previous samples from the
             * circular buffer into the output buffer.
             */

            for (uint32_t i = 0; i < SAMPLE_COUNT_PRE_TRIGGER; i++)
            {
                uint32_t index =
                    (circular_index + i) % SAMPLE_COUNT_PRE_TRIGGER;

                buffer[i] = circular[index];
            }

            /*
             * The current sample is already the first
             * post-trigger sample.
             */
            buffer[SAMPLE_COUNT_PRE_TRIGGER] = value;

            /*
             * Capture the remaining samples.
             */
            for (uint32_t i = SAMPLE_COUNT_PRE_TRIGGER + 1;
                 i < SAMPLE_BUFFER_SIZE;
                 i++)
            {
                sleep_until(next_sample);

                next_sample = delayed_by_us(
                    next_sample,
                    SAMPLE_INTERVAL_US);

                buffer[i] = adc_read();
            }

            /*
             * Output CSV.
             */
            printf("START\n");

            for (int32_t i = 0; i < SAMPLE_BUFFER_SIZE; i++)
            {
                printf(
                    "%d,%u\n",
                    i - SAMPLE_COUNT_PRE_TRIGGER,
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
            while (adc_read() >= hit_threshold)
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
