# Schlagzähler Project Knowledge & Context

This file provides the high-level monorepo overview for AI agents and CLI sessions. Detailed architecture, conventions, and commands for each subproject are maintained in their dedicated `AGENTS.md` files:

- **[`schlagzaehler-pico/AGENTS.md`](./schlagzaehler-pico/AGENTS.md)**: Raspberry Pi Pico W (RP2040) C23/C++23 firmware architecture, dual-core execution model, OSAL layer, hardware pinout, state machines, and build/test commands.
- **[`schlagzaehler-web/AGENTS.md`](./schlagzaehler-web/AGENTS.md)**: Angular v22 companion web application architecture, transport abstraction, TypeScript/Angular best practices, and build/test commands.

---

## 1. Project Overview

Schlagzähler is a piezo-based hit detection and interactive game system. One or more physical target units (powered by a Raspberry Pi Pico W with 3 piezo sensors on a single target mount, 4 navigation buttons, and an ST7735 TFT display) can be used standalone or connected concurrently via USB Serial to a companion Angular web dashboard.

### Repository Layout

- **`schlagzaehler-pico/`**: Dual-core C23/C++23 firmware for the Raspberry Pi Pico W (`pico_w`, RP2040) built with the Pico SDK and CMake/Ninja. Handles 150 kHz aggregate (3x 50 kHz hardware round-robin across GPIO 26, 27, 28) ADC DMA piezo sampling, coincidence window & peak intensity winner hit detection, target-selectable 10 kHz downsampled raw signal capture, local button/TFT UI, and the authoritative game state machine (`COUNT`, `TIMED`, `RACE` modes).
- **`schlagzaehler-web/`**: Angular v22 single-page application built with TypeScript, Tailwind CSS 4, and Vitest. Connects to multiple Pico devices via the W3C Web Serial API to display real-time telemetry, control single- or multi-device games, and analyze/export raw piezo waveforms (with multi-sensor waveform comparison).
- **`docs/diagrams/`**: PlantUML system context, class architecture, sequence, state, and dataflow diagrams (including [`sequence_companion_protocol.puml`](./docs/diagrams/sequence_companion_protocol.puml)).
- **`docs/protocol.md`**: Full Interface Control Document (ICD) covering the serial companion protocol and 
  inter-core message schemas.

---

## 2. System Integration (Companion Protocol)

The Pico firmware (`CompanionProtocol`) and the Angular web app (`companion-protocol.ts`) communicate over USB CDC Serial (`115200` baud, newline-delimited `\n` ASCII messages):

- **Telemetry (`Pico -> Web`)**: `BOOT`, `SENSOR`, `CALIB`, `HIT`, `STATE`, `MODE`, `SCORE`, `TIMER`, `RESULT`, `CAPTURE_START`, `CAPTURE_DATA`, `CAPTURE_END`, `ERROR`.
- **Commands (`Web -> Pico`)**: `START`, `RESET`, `CALIB`, `STATUS`, `CAPTURE [target=<0|1|2|all>]`, `CAPTURE:STOP`, `MODE:<COUNT|TIMED|RACE>`, `PARAM:<u32>`, `SENS:<float>`.

The hardware device on Core 0 is always the authoritative source of truth for sensor calibration, hit detection, game state transitions, scores, and timers.
