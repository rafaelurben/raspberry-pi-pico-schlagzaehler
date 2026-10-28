# Schlagzähler Pico Firmware – Architecture & Best Practices

You are an expert in embedded C (C23) and C++ (C++23) development for the Raspberry Pi Pico / Pico W (RP2040) using the Pico C SDK. You write deterministic, real-time safe, modular, and testable firmware following strict architectural boundaries.

---

## 1. Project Overview & Target Hardware

`schlagzaehler-pico` is the embedded firmware for the Schlagzähler piezo-based hit detection and game system running on a **Raspberry Pi Pico W (`pico_w`, RP2040)**.

### Hardware Peripherals & Pinout (`src/Common/Config.h`)

- **Piezo Sensors (3x ADC + DMA Hardware Round-Robin)**:
  - `PIN_PIEZO_ADC_0`: GPIO 26 (`ADC_INPUT_CHANNEL` 0)
  - `PIN_PIEZO_ADC_1`: GPIO 27 (`ADC_INPUT_CHANNEL` 1)
  - `PIN_PIEZO_ADC_2`: GPIO 28 (`ADC_INPUT_CHANNEL` 2)
  - Sampled continuously using RP2040 hardware round-robin (`ADC_ROUND_ROBIN_MASK = 0x07`) at **150 kHz aggregate** (**50 kHz** per channel, `50000` Hz) using ping-pong DMA buffers of **384** samples (`128` per sensor per buffer, interleaved `0, 1, 2, 0, 1, 2...`).
- **Navigation Buttons (Active-Low with Internal Pull-Ups, Interrupt-Driven)**:
  - `PIN_BTN_UP`: GPIO 10
  - `PIN_BTN_DOWN`: GPIO 14
  - `PIN_BTN_LEFT`: GPIO 15
  - `PIN_BTN_RIGHT`: GPIO 11
- **ST7735 16-bit TFT Display (128x160, SPI0)**:
  - `PIN_DISPLAY_BL`: GPIO 2 (Backlight)
  - `PIN_DISPLAY_DC`: GPIO 3 (Data/Command)
  - `PIN_DISPLAY_RST`: GPIO 6 (Reset)
  - `PIN_DISPLAY_CS`: GPIO 17 (SPI0 CSn)
  - `PIN_DISPLAY_SCLK`: GPIO 18 (SPI0 SCK)
  - `PIN_DISPLAY_MOSI`: GPIO 19 (SPI0 TX)
- **Status LED**: On-board LED (`CYW43_WL_GPIO_LED_PIN` on Pico W via `PicoBoard`).
- **Companion Interface**: USB CDC Serial (`stdio_usb` & `stdio_uart` enabled).

---

## 2. Layered Software Architecture

The firmware is strictly divided into three layers so that all application logic in `src/App/` and `src/Common/` is 100% hardware-independent and can be compiled and unit-tested natively on the host OS.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                       Application Layer (src/App/)                      │
│  App, ConfigService, HitDetector, ButtonController, GameController,     │
│  GameState, Modes (Count/Timed/Race), DisplayPresenter,                 │
│  CompanionProtocol, CommandHandler                                      │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ Depends ONLY on src/Common/ & src/OSAL/inc/
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  Abstraction Layer / OSAL (src/OSAL/)                   │
│  Interfaces (src/OSAL/inc/): Board, CoreStartup, DisplayDriver, Dma,    │
│  GpioDriver, Interrupt, PiezoAdcDriver, Queue, Time, UsbSerialDriver,   │
│  WatchdogService                                                        │
│  Pico Implementations (src/OSAL/src/pico/Pico*.c / .cpp)                │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│             External Libraries & Hardware SDK (libs/, Pico SDK)         │
│  displaylib_16bit (ST7735 C++ driver), pico_stdlib, pico_multicore,     │
│  pico_util, hardware_adc, hardware_dma, hardware_gpio, hardware_spi,    │
│  hardware_timer, hardware_sync, hardware_watchdog, pico_cyw43_arch_none │
└─────────────────────────────────────────────────────────────────────────┘
```

### Directory Structure

- **`src/main.c`**: Entrypoint. Calls `Board_init()`, initializes default `Config`, calls `App_init()`, and runs `App_run_core0()` in an infinite loop.
- **`src/Common/`**: Shared pure-C data structures, enums, and constants:
  - `Config.h`: Pin definitions, queue capacities, `Config` struct, and `Config_set_defaults()`.
  - `GameTypes.h`: Enums (`GameMode`, `GameState`, `GameEndReason`, `SensorState`) and string conversion helpers.
  - `Events.h`: `ButtonId`, `ButtonEvent`, and `HitEvent`.
  - `Messages.h`: Typed inter-core message unions (`Core0ToCore1Message` and `Core1ToCore0Message`).
- **`src/App/`**: Platform-agnostic application logic:
  - `App.h` / `App.c`: Top-level orchestrator owning state, inter-core queues, Core 0 loop (`App_run_core0`), and Core 1 loop (`App_run_core1`).
  - `ConfigService.h` / `ConfigService.c`: Validates, clamps, and updates runtime configuration parameters.
  - `HitDetection/HitDetector.h` / `.c`: De-interleaves 3-channel round-robin ADC sample buffers, performs per-sensor baseline/noise calibration, computes per-sensor dynamic threshold with exponential decay, enforces per-sensor hit lockout and button-settling suppression windows, aggregates simultaneous vibrations across the target mount via a 2.5 ms coincidence window, and selects the winning piezo based on maximum peak intensity.
  - `HitDetection/SignalCapture.h` / `.c`: Captures target-selected raw piezo waveforms (`0`, `1`, `2`, or `all`). Single-sensor capture downsamples at 5:1 max-pooling (10 kHz effective rate); "all" mode downsamples at 15:1 max-pooling per sensor interleaved `0,1,2,0,1,2...` for 10 kHz total rate without requiring additional RAM (`21,000` samples max).
  - `Input/ButtonController.h` / `.c`: Handles GPIO edge interrupts with 25 ms debouncing, queues `ButtonEvent`s in an ISR-safe ring buffer, and tracks button settling periods to suppress mechanical button-press vibrations from triggering piezo hits.
  - `Game/GameController.h` / `.c` & `GameState.h` / `.c`: Authoritative state machine managing game states, modes, score, timers, local button navigation, companion commands, and state broadcasts to Core 1.
  - `Game/Modes/`: Mode-specific rules (`CountMode`, `TimedMode`, `RaceMode`).
  - `Display/DisplayPresenter.h` / `.c`: Core 1 UI presenter. Consumes `Core0ToCore1Message` events, tracks dirty flags (`needs_full_redraw`, `needs_score_redraw`, `needs_timer_redraw`), and renders screens via `DisplayDriver` without flickering.
  - `Companion/CompanionProtocol.h` / `.c` & `CommandHandler.h` / `.c`: Core 1 ASCII serial protocol parser and formatter. Parses incoming companion commands into `Core1ToCore0Message` items and serializes outgoing `Core0ToCore1Message` events over USB serial.
- **`src/OSAL/`**: Operating System & Hardware Abstraction Layer:
  - `inc/`: Pure C headers (`extern "C"`) defining platform contracts.
  - `src/pico/`: RP2040 / Pico SDK implementations (`PicoBoard.c`, `PicoCoreStartup.c`, `PicoDisplayDriver.cpp`, `PicoDma.c`, `PicoGpioDriver.c`, `PicoInterrupt.c`, `PicoPiezoAdcDriver.c`, `PicoQueue.c`, `PicoTime.c`, `PicoUsbSerialDriver.c`, `PicoWatchdogService.c`).
- **`libs/displaylib_16bit/`**: Vendored C++17/23 16-bit color graphics library for the ST7735 SPI TFT display (wrapped behind C-compatible `DisplayDriver.h` via `PicoDisplayDriver.cpp`).
- **`tests/test_firmware.c`**: Host-compiled unit test suite mocking OSAL primitives (`Time`, `Interrupt`, `GpioDriver`, `OsalQueue`, `UsbSerialDriver`) to test `ConfigService`, `HitDetector`, `GameController`, `CompanionProtocol`, and `ButtonController`.

---

## 3. Dual-Core Execution Model

The RP2040's two ARM Cortex-M0+ cores have strictly separated responsibilities and communicate exclusively via two non-blocking, lock-safe `OsalQueue` instances (`queue_core0_to_core1` and `queue_core1_to_core0`).

### Core 0: Real-Time Sensing & Authoritative Game Logic (`App_run_core0`)

1. **ADC DMA Processing**: Polls completed 384-sample ping-pong buffers from `PiezoAdcDriver` (128 samples per sensor, interleaved `[S0, S1, S2, ...]`) and feeds them into `HitDetector_process_buffer()`.
2. **Power & Noise Gating**: Automatically stops ADC/DMA when in `GAME_STATE_MENU` (unless calibrating) to save resources and avoid spurious hits, and suppresses piezo detection for 150–250 ms during and immediately after physical button presses (`HitDetector_suppress_hits()`).
3. **Button Processing**: Drains debounced `ButtonEvent`s from `ButtonController` and forwards them to `GameController_on_button()`.
4. **Companion Command Processing**: Pops `Core1ToCore0Message` commands queued by Core 1 and applies calibration, sensitivity, mode, parameter, start, or reset actions.
5. **Game Timer Tick & Watchdog**: Advances `GameController_tick()` (broadcasting timer updates every 100 ms during active games) and feeds Core 0's watchdog slot (`WatchdogService_feed_core0()` + `WatchdogService_tick()`).

### Core 1: Display Rendering & USB Serial I/O (`App_run_core1`)

1. **Event Dispatch**: Pops `Core0ToCore1Message` items from `queue_core0_to_core1` and passes each message to both `DisplayPresenter_handle_message()` and `CompanionProtocol_send_message()`.
2. **Serial Command Polling**: Polls `CompanionProtocol_poll_input()` (non-blocking `UsbSerialDriver_read_line()`) and pushes parsed commands to `queue_core1_to_core0`.
3. **Incremental Display Rendering**: Calls `DisplayPresenter_render()`, which only redraws dirty screen regions over SPI0.
4. **Watchdog Heartbeat**: Updates Core 1's timestamp via `WatchdogService_feed_core1()`. Hardware watchdog (`WatchdogService_tick()` on Core 0) only pets the RP2040 hardware watchdog if **both** Core 0 and Core 1 have checked in within `watchdog_timeout_ms` (5000 ms).

---

## 4. State Machines & Game Modes

### Sensor State (`SensorState`)

- `SENSOR_STATE_INIT`: Initial uncalibrated state on boot.
- `SENSOR_STATE_CALIBRATING`: Samples baseline mean and variance across all 3 sensors over `1500 ms` (min `10000` samples per sensor), computing per-sensor `base_threshold = baseline + max(min_threshold_delta, noise_factor * noise)`. Fails to `ERROR` if signal span exceeds 1500 ADC counts on any sensor.
- `SENSOR_STATE_ARMED`: Ready to detect hits exceeding per-sensor thresholds.
- `SENSOR_STATE_HIT_LOCKOUT`: Triggered upon a hit; tracks peak intensity with exponential decay (`decay_factor`) per sensor during `lockout_duration_ms` to prevent double-counting ringdown oscillations. Coincidence window resolves multi-sensor vibration and picks the winning piezo by peak intensity.
- `SENSOR_STATE_CAPTURE_ARMED`: Armed via companion `CAPTURE` command (target `0`, `1`, `2`, or `all`); continuously fills a `0.1 s` pre-trigger circular buffer (`1,000` samples at `10 kHz`, 5:1 max-pooled or 15:1 max-pooled per sensor) until a sample crosses the trigger threshold.
- `SENSOR_STATE_CAPTURING`: Triggered; collects `2.0 s` post-trigger samples (`20,000` samples at `10 kHz`) into the `21,000`-sample buffer (`SignalCapture`).
- `SENSOR_STATE_TRANSMITTING`: Streams chunks of samples non-blockingly over USB CDC via Core 1.
- `SENSOR_STATE_ERROR`: Calibration or sensor fault.

### Game State (`GameState`)

- `GAME_STATE_BOOT`: Shown during initial sensor calibration; transitions to `READY` when calibration succeeds.
- `GAME_STATE_MENU`: Mode selection (`UP`/`DOWN` to cycle mode, `RIGHT` to confirm and enter `READY`).
- `GAME_STATE_READY`: Pre-game screen (`LEFT` returns to `MENU`, `UP`/`DOWN` adjusts parameter in `TIMED` or `RACE` mode, `RIGHT` or companion `START` command transitions to `RUNNING`).
- `GAME_STATE_RUNNING`: Active gameplay (`LEFT` aborts and resets to `READY`; hits increment authoritative aggregate score; timer ticks; individual winning piezo ID is not displayed on TFT).
- `GAME_STATE_FINISHED`: Game over screen (`LEFT` returns to `MENU`, `RIGHT` resets to `READY`).
- `GAME_STATE_CAPTURING`: Dedicated screen shown while raw piezo signal capture is armed (`SENSOR_STATE_CAPTURE_ARMED`) or actively recording/streaming (`SENSOR_STATE_CAPTURING`).

### Game Modes (`GameMode`)

- **`GAME_MODE_COUNT` ("Zaehlen")**: Open-ended hit counter with elapsed stopwatch.
- **`GAME_MODE_TIMED` ("Zeit")**: Count as many hits as possible within a countdown duration (default `30 s`, adjustable in `5 s` steps between `5 s` and `300 s`). Ends with `GAME_END_TIME_LIMIT`.
- **`GAME_MODE_RACE` ("Rennen")**: Reach a target hit count (default `50` hits, adjustable in `5`-hit steps between `5` and `500`) as fast as possible. Ends with `GAME_END_TARGET_REACHED`.

---

## 5. USB CDC Companion Protocol

Communication with `schlagzaehler-web` uses newline-delimited (`\n`) ASCII messages at `115200` baud.

### Outgoing Events (Core 1 -> Companion Web App)

- `BOOT success=<0|1> msg=<text>`
- `SENSOR status=<INIT|CALIBRATING|ARMED|LOCKOUT|CAPTURE_ARMED|CAPTURING|TRANSMITTING|ERROR>`
- `CALIB success=<0|1> sensor=<0|1|2> baseline=<u16> noise=<u16> threshold=<u16>`
- `HIT id=<u32> target=<0|1|2> peak=<u16> intensity=<u16>`
- `STATE old=<BOOT|MENU|READY|RUNNING|FINISHED|CAPTURING> new=<...>`
- `MODE active=<COUNT|TIMED|RACE> param=<u32>`
- `SCORE value=<u32>`
- `TIMER elapsed=<u32> remaining=<u32>`
- `RESULT score=<u32> time_ms=<u32> reason=<NONE|TIME_LIMIT|TARGET_REACHED|ABORTED>`
- `CAPTURE_START rate=<u32> pre=<u16> count=<u16> target=<0|1|2|all> baseline=<u16> noise=<u16> threshold=<u16>`
- `CAPTURE_DATA offset=<u16> values=<v0>,<v1>,...`
- `CAPTURE_END count=<u16>`
- `ERROR code=<u32> comp=<name> msg=<text>`

### Incoming Commands (Companion Web App -> Core 1)

- `START`: Start game (if in `MENU` or `READY`) or restart (if `FINISHED`).
- `RESET`: Abort/reset current game back to `READY` with score 0 (also cancels active capture).
- `CALIB`: Trigger sensor recalibration for all sensors.
- `STATUS`: Broadcast a full state snapshot (`SENSOR`, `STATE`, `MODE`, `SCORE`, `TIMER`).
- `CAPTURE [target=<0|1|2|all>]` (or `CAPTURE:START ...`): Arm single-shot raw piezo waveform capture for a target piezo or all piezos (`1,000` pre + `20,000` post samples at `10 kHz`).
- `CAPTURE:STOP`: Cancel armed or ongoing raw piezo waveform capture.
- `MODE:<COUNT|TIMED|RACE|0|1|2>`: Switch active game mode.
- `PARAM:<u32>`: Set mode parameter (seconds for `TIMED`, target hits for `RACE`).
- `SENS:<float>`: Set piezo sensitivity (`noise_factor`, clamped to `1.0`–`20.0`) for all sensors.

---

## 6. Coding Conventions & Best Practices

- **Strict Layering**: Never include Pico SDK headers (`pico/*.h`, `hardware/*.h`) or C++ display headers inside `src/App/` or `src/Common/`. Always go through `src/OSAL/inc/*.h`.
- **Naming Conventions**:
  - Types & structs: `PascalCase` (e.g., `GameController`, `HitDetector`, `OsalQueue`).
  - Functions: `ModuleName_snake_case` (e.g., `GameController_on_hit`, `PiezoAdcDriver_poll_buffer`).
  - Constants & Enum values: `UPPER_SNAKE_CASE` (e.g., `GAME_STATE_RUNNING`, `PIN_PIEZO_ADC`).
  - OSAL Pico implementations: Prefix files with `Pico` in `src/OSAL/src/pico/` (e.g., `PicoDma.c` implementing `Dma.h`).
- **Memory & Real-Time Safety**:
  - Avoid dynamic heap allocation (`malloc`/`free`/`new`) in application and ISR paths; use static allocation or fixed-size structs/queues owned by `App`.
  - Keep ISR callbacks (`PicoGpioDriver`, `PicoDma`) minimal and non-blocking.
  - Never call `DisplayDriver` or `UsbSerialDriver` from Core 0, and never mutate `GameController` or `HitDetector` state directly from Core 1.
- **C/C++ Interop**: All headers in `src/Common/`, `src/App/`, and `src/OSAL/inc/` must wrap declarations in `#ifdef __cplusplus extern "C" { #endif` guards.

---

## 7. Building & Testing

### Build Firmware (Pico SDK + Ninja)

The project uses the Raspberry Pi Pico SDK (`2.3.0`) and Ninja configured in `build/`:

```bash
# Compile firmware using the Pico SDK Ninja toolchain
~/.pico-sdk/ninja/v1.13.2/ninja -C build
```

If `build/` needs to be reconfigured from scratch:

```bash
~/.pico-sdk/cmake/v4.3.4/bin/cmake -B build -G Ninja
~/.pico-sdk/ninja/v1.13.2/ninja -C build
```

### Run Host-Side Unit Tests

Because `src/App/` is decoupled via the OSAL, the architecture unit test suite in `tests/test_firmware.c` can be compiled and executed directly on the host machine (macOS/Linux) without hardware:

```bash
cc -std=c23 -Wall -Wextra -Isrc \
  tests/test_firmware.c \
  src/App/ConfigService.c \
  src/App/HitDetection/HitDetector.c \
  src/App/HitDetection/SignalCapture.c \
  src/App/Game/GameState.c \
  src/App/Game/Modes/CountMode.c \
  src/App/Game/Modes/TimedMode.c \
  src/App/Game/Modes/RaceMode.c \
  src/App/Game/GameController.c \
  src/App/Input/ButtonController.c \
  src/App/Companion/CommandHandler.c \
  src/App/Companion/CompanionProtocol.c \
  src/App/Display/DisplayPresenter.c \
  -lm -o /tmp/test_firmware && /tmp/test_firmware && rm -f /tmp/test_firmware
```
