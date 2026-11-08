# Schlagzähler

Piezo-based hit detection and interactive target gaming system featuring dual-core embedded firmware on the Raspberry Pi Pico W and an Angular companion web application.

---

## 1. System Overview

Schlagzähler combines physical target hardware with a real-time web dashboard. One or more battery- or USB-powered physical targets can be operated standalone (via their on-board TFT display and 4-button navigation) or connected simultaneously over USB CDC Serial to the companion web application for synchronized multiplayer matches, telemetry monitoring, and raw waveform signal analysis.

### Repository Structure

- **[`schlagzaehler-pico/`](./schlagzaehler-pico/)**: Dual-core C23/C++23 firmware for Raspberry Pi Pico W (`pico_w`, RP2040) built with the Raspberry Pi Pico SDK, CMake, and Ninja.
- **[`schlagzaehler-web/`](./schlagzaehler-web/)**: Real-time companion single-page application built with Angular v22, TypeScript, Tailwind CSS 4, and Vitest.
- **[`docs/diagrams/`](./docs/diagrams/)**: PlantUML architectural, sequence, component, and state diagrams.
- **[`AGENTS.md`](./AGENTS.md)**: Monorepo architectural context and developer guidelines. Dedicated subproject guides are located in [`schlagzaehler-pico/AGENTS.md`](./schlagzaehler-pico/AGENTS.md) and [`schlagzaehler-web/AGENTS.md`](./schlagzaehler-web/AGENTS.md).

---

## 2. Firmware Services & Architecture (`schlagzaehler-pico`)

The firmware runs a strict three-layer architecture: **Application Layer** (`src/App/`), **Operating System Abstraction Layer (OSAL)** (`src/OSAL/`), and **Hardware Drivers/SDK** (`libs/`, Pico SDK). Application logic is 100% hardware-independent and unit-tested natively on the host OS.

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

### Application Services (`src/App/`)

- **`HitDetector` & `SignalCapture`** (`src/App/HitDetection/`):
  - **Hit Detection Engine**: Samples the piezo sensor at **50 kHz** via continuous ping-pong DMA buffers (256 samples per buffer). Performs dynamic statistical calibration (mean baseline and noise variance over 1.5 s / 10,000 samples). Calculates an adaptive dynamic threshold with exponential decay (`decay_factor = 0.995`) and enforces a configurable lockout dead-time (`100 ms`) to reject mechanical ringdown reverberations.
  - **Mechanical Vibration Suppression**: Automatically ignores piezo triggers during and immediately following button presses (`150–250 ms`) to prevent button-press vibrations from registering as hits.
  - **Raw Waveform Capture Engine (`SignalCapture`)**: Single-shot raw signal recording tool. Uses **5:1 max-pooling** (10 kHz effective rate) to preserve high-frequency hit peaks while capturing **21,000 samples (2.1 seconds)** into a static 42 KB buffer (`0` dynamic allocations). Unrolls a 1,000-sample circular pre-trigger buffer (`0.1 s`) and records 20,000 post-trigger samples (`2.0 s`).
  - **Sensor Lifecycle**: Authoritative state machine managing `SENSOR_STATE_INIT`, `CALIBRATING`, `ARMED`, `HIT_LOCKOUT`, `CAPTURE_ARMED`, `CAPTURING` (LED on), and `CAPTURE_TX_WAIT` (LED off).
- **`GameController` & `GameState`** (`src/App/Game/`):
  - Authoritative game engine for all match rules, scorekeeping, and countdown timing.
  - Manages transitions between `GAME_STATE_BOOT`, `MENU`, `READY`, `RUNNING`, `FINISHED`, and `CAPTURING`.
  - Supports three built-in game modes:
    - **`COUNT`**: Open-ended hit counter.
    - **`TIMED`**: Countdown timer (5–600 s) counting maximum hits before expiration.
    - **`RACE`**: Target hit race (5–1,000 hits) measuring elapsed time to reach target.
  - Provides menu-based mode selection and parameter configuration directly from local hardware buttons.
- **`ButtonController`** (`src/App/Input/`):
  - Active-low GPIO interrupt handler for 4 navigation buttons (`UP`, `DOWN`, `LEFT`, `RIGHT`).
  - ISR-safe ring buffer with 25 ms software debouncing.
  - Exposes `ButtonController_is_active_or_settling()` to coordinate mechanical hit suppression with `HitDetector`.
- **`DisplayPresenter`** (`src/App/Display/`):
  - Core 1 graphical presenter rendering UI screens onto the 128x160 ST7735 16-bit color TFT display over SPI0.
  - Flicker-free rendering using dirty-region tracking (`needs_full_redraw`, `needs_score_redraw`, `needs_timer_redraw`).
  - Renders dedicated screens for boot/calibration, menu navigation, ready/running/finished game states, and specialized analysis screens (`BEREIT!`, `AUFNAHME`, `TRANSFER`).
- **`CompanionProtocol` & `CommandHandler`** (`src/App/Companion/`):
  - Core 1 bi-directional ASCII serial communication protocol over USB CDC.
  - Parses incoming companion commands and routes them via non-blocking queues to Core 0.
  - Streams telemetry events and non-blocking chunked raw waveform data (`CAPTURE_DATA`, 50 samples per line, 1 line per tick) without stalling UI rendering or tripping watchdogs.
- **`ConfigService`** (`src/App/ConfigService.c`):
  - Validates and clamps runtime parameters (game modes, durations, target hits, noise factors, and sensitivity).
- **`App` Orchestrator** (`src/App/App.c`):
  - Top-level supervisor allocating static `.bss` storage and managing inter-core message dispatching and power gating (disables ADC/DMA during menus to conserve power).

### Hardware Abstraction Layer (OSAL Services, `src/OSAL/`)

- **`WatchdogService`**: Cooperative dual-core hardware watchdog supervisor. Requires both Core 0 and Core 1 to check in within 5,000 ms before petting the RP2040 hardware watchdog.
- **`PiezoAdcDriver` & `Dma`**: Configures RP2040 ADC0 (GPIO 26) with pacing timer and ping-pong DMA channels.
- **`GpioDriver` & `Interrupt`**: Configures button pull-ups and registers edge-fall/rise interrupt callbacks.
- **`DisplayDriver`**: C wrapper interfacing with the vendored C++ `displaylib_16bit` library for SPI0 display communication.
- **`UsbSerialDriver`**: Non-blocking line reading and writing over USB CDC (`stdio_usb`).
- **`OsalQueue`**: Lock-free, non-blocking inter-core queues (`queue_core0_to_core1` and `queue_core1_to_core0`).
- **`Board` & `Time`**: Board LED control, microsecond timestamps (`Time_now_us()`), and busy/sleep delays.

---

## 3. Web Application Services & Architecture (`schlagzaehler-web`)

The Angular v22 single-page companion app provides real-time multi-target match coordination, telemetry tracking, and waveform analysis.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                             UI Components                               │
│      DashboardComponent        AnalyzerComponent     SettingsComponent  │
│  (Multi-Target Telemetry)    (Waveform Canvas Chart)  (Connection/Logs) │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Core Application Services                         │
│   DeviceManagerService  •  CompanionProtocol  •  AudioFeedbackService   │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Transport Abstraction Layer                       │
│    DeviceTransport (Interface)  •  WebSerialTransport (Web Serial)     │
│                   NewlineEventParser (Chunk Deframing)                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Core Services (`src/app/core/device/services/`)

- **`DeviceManagerService`**:
  - Central reactive state store managing multiple connected Pico devices concurrently.
  - Maintains connection states (`disconnected`, `connecting`, `connected`, `error`), device readiness, active game states, sensor statuses, scores, and calibration metrics using Angular Signals.
  - Reassembles chunked `CAPTURE_START`, `CAPTURE_DATA`, and `CAPTURE_END` packets into completed `PiezoCaptureResult` waveforms with real-time transfer progress tracking.
  - Manages the auto-rearming pipeline for automated continuous hit waveform captures.
  - Isolates errors so a disconnect on one physical target does not interrupt other connected targets.
- **`CompanionProtocol` Parser & Serializer** (`src/app/core/device/protocol/`):
  - Bi-directional serializer and parser converting ASCII protocol lines into typed domain models.
  - Filters out raw high-frequency `CAPTURE_DATA` chunks from the user-facing live event log while assembling full sample buffers in the background.
- **`WebSerialTransport` & `NewlineEventParser`** (`src/app/core/device/transport/`):
  - Implementation of the `DeviceTransport` contract using the W3C Web Serial API (115,200 baud).
  - Handles USB chunk fragmentation, stream assembly, and CRLF / LF line endings with fault tolerance.
- **`AudioFeedbackService`** (`src/app/core/services/`):
  - Synthesizes low-latency audio feedback (hits, countdown beeps, start buzzer, victory fanfare) using the Web Audio API without requiring external audio assets.

### Features & Views (`src/app/features/`)

- **Dashboard (`/dashboard`)**:
  - Multi-target live match coordination.
  - Displays device status cards showing connection state, current score, game mode, remaining time, and sensor state.
  - Global match controls (Start, Reset, Mode selector).
- **Signal Analyzer (`/analyzer`)**:
  - Interactive raw waveform debugger replacing legacy Python plotting tools.
  - High-DPI HTML5 canvas renderer with min/max bucketing for 21,000 samples.
  - Reference overlays for baseline, noise margin, trigger threshold, and hit impact point.
  - Zoom presets: **Full (2.1 s)**, **Ringdown (270 ms)**, and **Impact (60 ms)**.
  - Auto-rearm toggle for repeated test strikes.
  - **CSV Export** (`Sample,ADC_Value`) and **PNG Image Export**.
- **Settings (`/settings`)**:
  - USB Serial port connection manager.
  - Calibration trigger and noise factor sensitivity configuration.
  - Live filterable event log.

---

## 4. Dual-Core Execution Model

The RP2040's dual ARM Cortex-M0+ cores run strictly separated roles communicating exclusively through two thread-safe queues:

```text
┌──────────────────────────────────────────────┐          ┌──────────────────────────────────────────────┐
│           Core 0 (Execution Core)            │          │             Core 1 (I/O Core)                │
│                                              │          │                                              │
│  - 50 kHz ADC DMA buffer processing          │          │  - ST7735 SPI0 TFT Display Rendering         │
│  - Hit detection & dynamic thresholding      │          │  - USB CDC Serial line polling (RX)          │
│  - SignalCapture (10 kHz max-pooling)        │          │  - USB CDC Telemetry & Capture streaming(TX) │
│  - Authoritative GameController state machine│          │  - Core 1 watchdog heartbeat                 │
│  - ButtonController event consumption        │          │                                              │
│  - Core 0 watchdog check & hardware pet      │          │                                              │
└──────────────────────┬───────────────────────┘          └──────────────────────▲───────────────────────┘
                       │                                                         │
                       │           queue_core0_to_core1 (capacity 64)            │
                       └─────────────────────────────────────────────────────────┘
                       ┌─────────────────────────────────────────────────────────┐
                       │           queue_core1_to_core0 (capacity 16)            │
                       └─────────────────────────────────────────────────────────┘
                               ▲                                                         │
                               └─────────────────────────────────────────────────────────┘
```

---

## 5. System Integration (Companion Protocol)

Communication over USB CDC Serial runs at `115200` baud using newline-delimited (`\n`) ASCII messages:

### Telemetry (`Pico -> Web`)

| Message | Format / Parameters | Description |
| --- | --- | --- |
| `BOOT` | `BOOT success=<0\|1> msg=<text>` | Initial firmware boot status. |
| `SENSOR` | `SENSOR status=<INIT\|CALIBRATING\|ARMED\|LOCKOUT\|CAPTURE_ARMED\|CAPTURING\|TRANSMITTING\|ERROR>` | Current sensor state. |
| `CALIB` | `CALIB success=<0\|1> baseline=<u16> noise=<u16> threshold=<u16>` | Calibration results. |
| `HIT` | `HIT id=<u32> peak=<u16> intensity=<u16>` | Registered piezo hit event. |
| `STATE` | `STATE old=<state> new=<state>` | Authoritative game state transition. |
| `MODE` | `MODE active=<mode> param=<u32>` | Active game mode and parameter. |
| `SCORE` | `SCORE value=<u32>` | Current score update. |
| `TIMER` | `TIMER elapsed=<ms> remaining=<ms>` | Periodic timer update (active games). |
| `RESULT` | `RESULT score=<u32> time_ms=<u32> reason=<reason>` | Final game result on completion. |
| `CAPTURE_START` | `CAPTURE_START rate=<hz> pre=<u16> count=<u16> baseline=<u16> noise=<u16> threshold=<u16>` | Header for raw signal capture. |
| `CAPTURE_DATA` | `CAPTURE_DATA offset=<u16> values=<v0>,<v1>,...` | Chunk of 50 raw ADC waveform samples. |
| `CAPTURE_END` | `CAPTURE_END count=<u16>` | Terminal message for waveform transfer. |
| `ERROR` | `ERROR code=<u32> comp=<component> msg=<text>` | System error notice. |

### Commands (`Web -> Pico`)

| Command | Syntax | Description |
| --- | --- | --- |
| `START` | `START` | Starts game from `READY` state. |
| `RESET` | `RESET` | Resets game to `READY` state and stops active capture. |
| `CALIB` | `CALIB` | Triggers sensor recalibration (1.5 s). |
| `STATUS` | `STATUS` | Requests immediate telemetry broadcast. |
| `CAPTURE` | `CAPTURE` or `CAPTURE:START` | Arms raw piezo signal capture mode. |
| `CAPTURE:STOP` | `CAPTURE:STOP` | Cancels raw piezo signal capture mode. |
| `MODE` | `MODE:<COUNT\|TIMED\|RACE>` | Sets game mode. |
| `PARAM` | `PARAM:<u32>` | Sets game parameter (seconds for `TIMED`, hits for `RACE`). |
| `SENS` | `SENS:<float>` | Sets sensor noise factor multiplier (1.0 to 30.0). |

---

## 6. Getting Started

### Web Application

The companion web dashboard is hosted on [GitHub Pages](https://www.rafaelurben.ch/raspberry-pi-pico-schlagzaehler/).

To run locally:

```bash
cd schlagzaehler-web
npm install
npm start
```

Open `http://localhost:4200/` in a Chromium-based browser supporting the Web Serial API (Chrome, Edge, Opera).

To run unit tests:

```bash
npm test -- --watch=false
```

### Firmware Build & Flash

Prerequisites: CMake, Ninja, GCC ARM Embedded toolchain (`arm-none-eabi-gcc`), and the Raspberry Pi Pico SDK (`PICO_SDK_PATH`).

```bash
cd schlagzaehler-pico
mkdir -p build && cd build
cmake -G Ninja -DPICO_BOARD=pico_w ..
ninja
```

Flash the generated `schlagzaehler.uf2` binary to your Raspberry Pi Pico W by holding `BOOTSEL` while plugging in the USB cable and copying the UF2 file to the mounted storage volume.

To run the host architecture unit test suite (compiles natively without Pico SDK hardware dependencies):

```bash
cd schlagzaehler-pico
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
  -lm -o test_firmware && ./test_firmware && rm -f test_firmware
```
