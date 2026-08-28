add_library(pico_displaylib_16 INTERFACE)

target_sources(pico_displaylib_16 INTERFACE
    ${CMAKE_CURRENT_LIST_DIR}/src/displaylib_16/st7735.cpp
    ${CMAKE_CURRENT_LIST_DIR}/src/displaylib_16/st7789.cpp
    ${CMAKE_CURRENT_LIST_DIR}/src/displaylib_16/ili9341.cpp
    ${CMAKE_CURRENT_LIST_DIR}/src/displaylib_16/ssd1331.cpp
    ${CMAKE_CURRENT_LIST_DIR}/src/displaylib_16/gc9a01.cpp
    ${CMAKE_CURRENT_LIST_DIR}/src/displaylib_16/gc9d01.cpp
    ${CMAKE_CURRENT_LIST_DIR}/src/displaylib_16/gc9107.cpp
    ${CMAKE_CURRENT_LIST_DIR}/src/displaylib_16/displaylib_16_graphics.cpp
    ${CMAKE_CURRENT_LIST_DIR}/src/displaylib_16/displaylib_16_Print.cpp
    ${CMAKE_CURRENT_LIST_DIR}/src/displaylib_16/displaylib_16_Font.cpp
    ${CMAKE_CURRENT_LIST_DIR}/src/displaylib_16/displaylib_16_common.cpp
    ${CMAKE_CURRENT_LIST_DIR}/src/displaylib_16/Bitmap_TEST_Data.cpp
)

target_include_directories(pico_displaylib_16 INTERFACE
    ${CMAKE_CURRENT_LIST_DIR}/include
)

target_link_libraries(pico_displaylib_16 INTERFACE
    pico_stdlib
    hardware_spi
)
