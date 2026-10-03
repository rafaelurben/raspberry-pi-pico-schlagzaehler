#include "ws2812.h"
#include "generated/ws2812.pio.h"

#include <stdlib.h>

void pattern_snakes(PIO pio, uint sm, uint len, uint t)
{
    for (uint i = 0; i < len; ++i)
    {
        uint x = (i + (t >> 1)) % 64;

        if (x < 10)
            put_pixel(pio, sm, urgb_u32(0xff, 0, 0));
        else if (x >= 15 && x < 25)
            put_pixel(pio, sm, urgb_u32(0, 0xff, 0));
        else if (x >= 30 && x < 40)
            put_pixel(pio, sm, urgb_u32(0, 0, 0xff));
        else
            put_pixel(pio, sm, 0);
    }
}

void pattern_random(PIO pio, uint sm, uint len, uint t)
{
    if (t % 8)
        return;

    for (uint i = 0; i < len; ++i)
        put_pixel(pio, sm, rand());
}

void pattern_sparkle(PIO pio, uint sm, uint len, uint t)
{
    if (t % 8)
        return;

    for (uint i = 0; i < len; ++i)
        put_pixel(pio, sm, rand() % 16 ? 0 : 0xffffffff);
}

void pattern_greys(PIO pio, uint sm, uint len, uint t)
{
    uint max = 100;
    t %= max;

    for (uint i = 0; i < len; ++i)
    {
        put_pixel(pio, sm, t * 0x10101);

        if (++t >= max)
            t = 0;
    }
}

const pattern_entry_t pattern_table[] = {
    {pattern_snakes, "Snakes!"},
    {pattern_random, "Random data"},
    {pattern_sparkle, "Sparkles"},
    {pattern_greys, "Greys"},
};
const size_t pattern_table_count =
    sizeof(pattern_table) / sizeof(pattern_table[0]);
