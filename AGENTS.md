# Schlagzähler Project Knowledge & Context

This file serves as the persistent project context for AI agents and CLI sessions. It outlines the monorepo architecture, component responsibilities, current progress, and conventions.

---

## 1. Project Overview

Schlagzähler is a piezo-based hit detection system featuring embedded firmware on the Raspberry Pi Pico and a companion web interface.

### Repository Layout

- **`schlagzaehler-pico/`**: Embedded C firmware for the Raspberry Pi Pico (RP2040) using the Pico SDK and CMake.
  - Reads piezo sensor input on ADC 0 (GPIO 26).
  - Dynamically calculates hit thresholds with exponential decay.
  - Outputs newline-delimited event strings via USB CDC serial (`printf("%s\n")`).
- **`schlagzaehler-web/`**: Angular v22 single-page application built with TypeScript, Tailwind CSS 4, and Vitest.
  - Connects to multiple Raspberry Pi Pico devices concurrently using the W3C Web Serial API.
  - Displays real-time events and device connection statuses.
  - Structured with a clean transport abstraction for future expansion (e.g., Web Bluetooth, WebSocket).
- **`analysis/`**: Sensor analysis and diagnostic scripts.

---

## 2. Web Architecture (`schlagzaehler-web`)

The web application is structured in strict conceptual layers to isolate the UI from hardware communication:

```text
Angular UI (Dashboard, DeviceList, EventList)
    │
    ▼
Device Manager (DeviceManagerService - Angular Signals & State)
    │
    ▼
Transport Abstraction (DeviceTransport Interface)
    │
    ▼
Web Serial Transport (WebSerialTransport & WebSerialTransportFactory)
    │
    ▼
Browser Web Serial API (navigator.serial, SerialPort, TextDecoderStream)
```

### Key Modules & Files

- **`src/app/core/config/serial.config.ts`**:
  - `DEFAULT_SERIAL_CONFIG`: Centralized serial settings (Baud rate: `115200`, 8 data bits, 1 stop bit, no parity).
  - `MAX_RETAINED_EVENTS`: Maximum number of recent events retained in UI memory (default: `500`).
- **`src/app/core/device/models/`**:
  - `connection-state.type.ts`: Connection lifecycle union type (`'disconnected' | 'connecting' | 'connected' | 'error'`).
  - `device.model.ts`: Domain `Device` model with application-generated stable ID (`device-<uuid>`), display name (`Device 1`), state, transport type (`'serial'`), and USB vendor/product IDs (`0x2e8a:0x000a`).
  - `device-event.model.ts`: Domain `DeviceEvent` model with unique ID, originating `deviceId`, timestamp, and raw payload text.
- **`src/app/core/device/transport/`**:
  - `device-transport.interface.ts`: Generic `DeviceTransport` contract (`state$`, `events$`, `errors$`, `getMetadata()`, `connect()`, `disconnect()`). UI and Device Manager never depend directly on Web Serial types.
  - `newline-event-parser.ts`: `NewlineEventParser` handles chunk buffering across arbitrary read boundaries, supports LF (`\n`) and CRLF (`\r\n`), ignores empty lines, and preserves trailing partial lines.
  - `web-serial-transport.ts`: Native `SerialPort` integration using `TextDecoderStream` and `pipeTo`. Implements clean cancellation, reader lock release, and unexpected hardware disconnection recovery.
  - `web-serial-transport-factory.service.ts`: Angular service wrapping `navigator.serial.requestPort()` and capability checks (`isSupported()`) for full mockability in tests.
- **`src/app/core/device/services/device-manager.service.ts`**:
  - Central manager using Angular Signals (`devices`, `events`, `isConnecting`, `isSupported`, `lastError`).
  - Supports multiple concurrent connections independently.
  - Isolates errors so a disconnect/error on one device does not disrupt others.
  - Exposes `connectSerialDevice()`, `attachDevice(transport)`, `disconnectDevice()`, `removeDevice()`, and `clearEvents()`.
- **`src/app/features/dashboard/`**:
  - `dashboard.component`: Main container, handles capability warnings, error alerts, and "Connect device" action.
  - `components/device-list/`: Renders active devices, connection state badges, USB metadata, and per-device disconnect/remove buttons.
  - `components/event-list/`: Reverse-chronological event stream with formatted millisecond timestamps, device labels, and monospace text.

---

## 3. Current State of the Codebase

### Completed Work

- [x] Angular application configured with Angular 22, strict TypeScript, and Tailwind CSS.
- [x] Transport abstraction layer fully decoupling transports from UI/state.
- [x] Multi-device Web Serial connectivity implemented.
- [x] Per-device stream buffering and newline parsing handling all boundary conditions.
- [x] Fault isolation across simultaneous devices.
- [x] Graceful error handling for user cancellations and physical disconnections.
- [x] 100% passing test suite (33 tests across 6 Vitest test suites).
- [x] ESLint passing cleanly with zero errors/warnings.
- [x] Production build passes with lazy chunking.

### Out of Scope for Current Stage (Do Not Implement Yet)

- No Bluetooth / Web Bluetooth / BLE.
- No WebSocket or Wi-Fi transports.
- No application-level parsing of hit payloads (payload is treated as raw text).
- No battle logic, scoring, sound effects, or persistent storage.

---

## 4. How to Extend With Future Transports

When adding future transports (e.g. Web Bluetooth or WebSocket):

1. Implement the `DeviceTransport` interface in `src/app/core/device/transport/`.
2. Connect or authenticate the connection.
3. Pass the instance to `deviceManager.attachDevice(newTransport, optionalName)`.
4. **No changes to `DeviceManagerService`, state signals, or dashboard UI components are required.**

---

## 5. Useful Commands

### Web Application (`schlagzaehler-web/`)

```bash
# Run local dev server
npm start
# Run all unit tests (Vitest)
npm test -- --watch=false
# Run ESLint
npm run lint
# Run Prettier (to be run every time before committing)
npm run format
# Production build
npm run build
```

### Pico Firmware (`schlagzaehler-pico/`)

To be built using the VSCode CMake Tools extension.
