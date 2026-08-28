#include <stdio.h>
#include <stdint.h>
#include "pico/stdlib.h"
#include "hardware/adc.h"
#include "src/pico_helpers.h"
#include "src/piezo_analyzer.h"

#define ADC_PIN 26  // GPIO 26
#define ADC_INPUT 0 // GPIO 26 is ADC 0

#define BTN_UP_PIN 10 // GPIO 10
#define BTN_DOWN_PIN 14 // GPIO 14
#define BTN_LEFT_PIN 15 // GPIO 15
#define BTN_RIGHT_PIN 11 // GPIO 11

#define DECAY_FACTOR 0.99f     // Defines the rate at which the dynamic threshold decays over time
#define SAMPLE_INTERVAL_US 100 // Interval between samples in microseconds

#define THRESHOLD_FINDER_DURATION_US 5000000                                         // Duration for finding the minimum threshold (in microseconds)
#define THRESHOLD_FINDER_SAMPLES (THRESHOLD_FINDER_DURATION_US / SAMPLE_INTERVAL_US) // Number of samples to take for finding the minimum threshold

uint16_t hit_threshold = 100;         // Threshold for hit detection
float dynamic_hit_threshold = 100.0f; // Dynamic threshold that will decay over time
bool hit_detected = false;

/**
 * @brief Find the minimum ADC hit threshold based on initial environmental readings.
 */
void piezo_find_hit_threshold()
{
    pico_set_led(true);
    printf("Finding minimum hit threshold based on %d samples with interval %d us...\n", THRESHOLD_FINDER_SAMPLES, SAMPLE_INTERVAL_US);
    uint16_t min_value = 65535;
    uint16_t max_value = 0;

    uint16_t current_value;
    absolute_time_t next_sample_time = get_absolute_time();
    for (int i = 0; i < THRESHOLD_FINDER_SAMPLES; i++)
    {
        sleep_until(next_sample_time);
        next_sample_time = delayed_by_us(next_sample_time, SAMPLE_INTERVAL_US);

        current_value = adc_read();
        if (current_value < min_value)
        {
            min_value = current_value;
        }
        if (current_value > max_value)
        {
            max_value = current_value;
        }
    }

    // set the hit threshold to 10% above the maximum observed value
    hit_threshold = max_value + (max_value - min_value) * 0.1f;
    dynamic_hit_threshold = hit_threshold;
    printf("Set hit threshold to %d based on observed range of %d to %d\n", hit_threshold, min_value, max_value);
    pico_set_led(false);
}

void process_piezo_sample()
{
    uint16_t raw_value = adc_read();

    // 1. Exponential decay of the dynamic threshold over time
    dynamic_hit_threshold *= DECAY_FACTOR;
    if (dynamic_hit_threshold < hit_threshold)
    {
        dynamic_hit_threshold = hit_threshold;
    }

    // 2. Peak detection logic
    if (raw_value > dynamic_hit_threshold)
    {
        if (!hit_detected)
        {
            printf("Hit detected! Value: %d\n", raw_value);
            hit_detected = true;
            pico_set_led(true);
        }
        // Update the dynamic threshold to the new peak value to prevent immediate re-triggering by the same hit
        dynamic_hit_threshold = raw_value;
    }
    else if (hit_detected && raw_value < (dynamic_hit_threshold - 10)) // Adding a small differential to avoid immediate reset
    {
        printf("Hit ended. Value: %d\n", raw_value);
        hit_detected = false;
        pico_set_led(false);
    }
}

void callback_gpio_irq(uint gpio, uint32_t events)
{
    if (gpio == BTN_UP_PIN && (events & GPIO_IRQ_EDGE_RISE))
    {
        // Increase the hit threshold by 1
        hit_threshold++;
        dynamic_hit_threshold = hit_threshold; // Reset dynamic threshold to new hit threshold
        printf("Button UP pressed. New hit threshold: %d\n", hit_threshold);
    }
    else if (gpio == BTN_DOWN_PIN && (events & GPIO_IRQ_EDGE_RISE))
    {
        // Decrease the hit threshold by 1
        hit_threshold--;
        dynamic_hit_threshold = hit_threshold; // Reset dynamic threshold to new hit threshold
        printf("Button DOWN pressed. New hit threshold: %d\n", hit_threshold);
    }
}

int main()
{
    stdio_init_all();
    pico_led_init();
    adc_init();
    adc_gpio_init(ADC_PIN);
    adc_select_input(ADC_INPUT);

    printf("Program started.\n");

    piezo_find_hit_threshold();

    gpio_init(BTN_UP_PIN);
    gpio_init(BTN_DOWN_PIN);
    gpio_init(BTN_LEFT_PIN);
    gpio_init(BTN_RIGHT_PIN);
    gpio_set_irq_enabled_with_callback(BTN_UP_PIN, GPIO_IRQ_EDGE_RISE, true, &callback_gpio_irq);
    gpio_set_irq_enabled_with_callback(BTN_DOWN_PIN, GPIO_IRQ_EDGE_RISE, true, &callback_gpio_irq);

    // Run the piezo analyzer if the right button is pressed at startup
    if (gpio_get(BTN_RIGHT_PIN) == 0)
    {
        printf("Right button pressed at startup. Running piezo analyzer...\n");
        run_piezo_analyzer();
    }

    while (true)
    {
        process_piezo_sample();
        sleep_us(SAMPLE_INTERVAL_US);
    }
}
