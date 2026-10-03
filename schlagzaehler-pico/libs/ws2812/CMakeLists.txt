add_library(ws2812 STATIC ws2812.c)

pico_generate_pio_header(
    ws2812
    ${CMAKE_CURRENT_LIST_DIR}/ws2812.pio
    OUTPUT_DIR ${CMAKE_CURRENT_LIST_DIR}/generated
)

target_link_libraries(ws2812
    pico_stdlib
    hardware_pio
)