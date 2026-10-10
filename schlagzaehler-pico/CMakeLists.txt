# Generated Cmake Pico project file

cmake_minimum_required(VERSION 3.13)

set(CMAKE_C_STANDARD 23)
set(CMAKE_CXX_STANDARD 23)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Initialise pico_sdk from installed location
# (note this can come from environment, CMake cache etc)

# == DO NOT EDIT THE FOLLOWING LINES for the Raspberry Pi Pico VS Code Extension to work ==
if(WIN32)
    set(USERHOME $ENV{USERPROFILE})
else()
    set(USERHOME $ENV{HOME})
endif()

set(sdkVersion 2.3.0)
set(toolchainVersion 15_2_Rel1)
set(picotoolVersion 2.3.0)
set(picoVscode ${USERHOME}/.pico-sdk/cmake/pico-vscode.cmake)

if(EXISTS ${picoVscode})
    include(${picoVscode})
endif()

# ====================================================================================
set(PICO_BOARD pico_w CACHE STRING "Board type")

# Pull in Raspberry Pi Pico SDK (must be before project)
include(pico_sdk_import.cmake)

project(schlagzaehler C CXX ASM)

# Initialise the Raspberry Pi Pico SDK
pico_sdk_init()

# Turn on all compiler warnings
add_compile_options(-Wall -Wextra)

# Add executable with all architectural components
add_executable(schlagzaehler
    src/main.c
    src/Common/Crc.c
    src/Platform/Pico/PicoBoard.c
    src/Platform/Pico/PicoInterrupt.c
    src/Platform/Pico/PicoTime.c
    src/Platform/Pico/PicoQueue.c
    src/Platform/Pico/PicoDma.c
    src/Platform/Pico/PicoUsbSerial.c
    src/Platform/Pico/CoreStartup.c
    src/Drivers/PiezoAdcDriver.c
    src/Drivers/GpioDriver.c
    src/Drivers/UsbSerialDriver.c
    src/Drivers/DisplayDriverAdapter.cpp
    src/Services/ConfigService.c
    src/Services/WatchdogService.c
    src/App/HitDetection/HitDetector.c
    src/App/Input/ButtonController.c
    src/App/Game/GameState.c
    src/App/Game/Modes/CountMode.c
    src/App/Game/Modes/TimedMode.c
    src/App/Game/Modes/RaceMode.c
    src/App/Game/GameController.c
    src/App/Display/DisplayPresenter.c
    src/App/Companion/CommandHandler.c
    src/App/Companion/CompanionProtocol.c
    src/App/App.c
)

pico_set_program_name(schlagzaehler "schlagzaehler")
pico_set_program_version(schlagzaehler "0.2")

# Enable both UART and USB CDC stdio output
pico_enable_stdio_uart(schlagzaehler 1)
pico_enable_stdio_usb(schlagzaehler 1)

# Add standard and hardware libraries to the build
target_link_libraries(schlagzaehler
    pico_stdlib
    pico_multicore
    pico_util
    hardware_adc
    hardware_dma
    hardware_gpio
    hardware_timer
    hardware_sync
    hardware_watchdog
    hardware_spi
)

if(PICO_CYW43_SUPPORTED)
    target_link_libraries(schlagzaehler pico_cyw43_arch_none)
endif()

# Add display library
add_subdirectory(libs/displaylib_16bit)
target_link_libraries(schlagzaehler
    pico_displaylib_16
)

# Add include directories
target_include_directories(schlagzaehler PRIVATE
    ${CMAKE_CURRENT_LIST_DIR}/src
    ${CMAKE_CURRENT_LIST_DIR}/libs/displaylib_16bit/include
)

pico_add_extra_outputs(schlagzaehler)
