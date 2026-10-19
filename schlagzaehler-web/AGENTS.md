# Schlagzähler Web – Architecture & Best Practices

You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

---

## 1. Web Architecture (`schlagzaehler-web`)

`schlagzaehler-web` is an Angular v22 single-page application built with TypeScript, Tailwind CSS 4, and Vitest. It connects to one or more Raspberry Pi Pico devices concurrently via the W3C Web Serial API.

The application is structured in strict conceptual layers to isolate the UI from hardware communication:

```text
Angular UI
  ├── Dashboard (/, DeviceCardComponent, synchronized multi-device controls)
  └── Settings (/settings, DeviceListComponent, EventListComponent)
    │
    ▼
Device Manager (DeviceManagerService - Angular Signals & State)
    │
    ├──► Companion Protocol (companion-protocol.ts - Command builders & state parser)
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
  - `device.model.ts`: Domain `Device` and `DeviceState` models tracking connection state, `gameState` (`BOOT`, `MENU`, `READY`, `RUNNING`, `FINISHED`), `mode` (`COUNT`, `TIMED`, `RACE`), `sensorState` (`INIT`, `CALIBRATING`, `ARMED`, `LOCKOUT`, `ERROR`), `score`, `parameter`, `elapsedMs`, `remainingMs`, and USB metadata.
  - `device-event.model.ts`: Domain `DeviceEvent` model with unique ID, originating `deviceId`, direction (`'received' | 'sent'`), timestamp, and raw payload text.
- **`src/app/core/device/protocol/`**:
  - `companion-protocol.ts`: Bidirectional protocol implementation with `CompanionCommands` (`START`, `RESET`, `CALIB`, `STATUS`, `MODE:...`, `PARAM:...`, `SENS:...`) and `parseCompanionMessage()` to reduce incoming serial lines into immutable `DeviceState` updates.
- **`src/app/core/device/transport/`**:
  - `device-transport.interface.ts`: Generic `DeviceTransport` contract (`state$`, `events$`, `errors$`, `getMetadata()`, `connect()`, `disconnect()`, `send()`). UI and Device Manager never depend directly on Web Serial types.
  - `newline-event-parser.ts`: `NewlineEventParser` handles chunk buffering across arbitrary read boundaries, supports LF (`\n`) and CRLF (`\r\n`), ignores empty lines, and preserves trailing partial lines.
  - `web-serial-transport.ts`: Native `SerialPort` integration using `TextDecoderStream` and `pipeTo` for reading and a UTF-8 writer for sending newline-terminated commands.
  - `web-serial-transport-factory.service.ts`: Angular service wrapping `navigator.serial.requestPort()` and capability checks (`isSupported()`) for full mockability in tests.
- **`src/app/core/device/services/device-manager.service.ts`**:
  - Central manager using Angular Signals (`devices`, `events`, `isConnecting`, `isSupported`, `lastError`).
  - Supports multiple concurrent connections independently with fault isolation.
  - Exposes connection lifecycle methods (`connectSerialDevice()`, `attachDevice()`, `reconnectDevice()`, `disconnectDevice()`, `removeDevice()`) and game/device control methods (`sendCommand()`, `sendCommandToDevices()`, `setGameMode()`, `setGameParameter()`, `startGame()`, `resetGame()`, `calibrateDevice()`, `requestStatus()`).
- **`src/app/features/dashboard/`**:
  - `dashboard.component`: Main game dashboard for controlling one or multiple connected devices simultaneously and viewing live scores/timers.
  - `components/device-card/`: Per-device card displaying live score, smooth interpolated countdown/elapsed timer, game mode selector, parameter controls, and start/reset/calibrate actions.
- **`src/app/features/settings/`**:
  - `settings.component`: Device management and raw serial diagnostics page.
  - `components/device-list/`: Manages connected devices, custom device names, connection state badges, USB metadata, and manual command sending.
  - `components/event-list/`: Reverse-chronological event stream (`received` and `sent`) with millisecond timestamps and device filtering.

### How to Extend With Future Transports

When adding future transports (e.g. Web Bluetooth or WebSocket):

1. Implement the `DeviceTransport` interface in `src/app/core/device/transport/`.
2. Connect or authenticate the connection.
3. Pass the instance to `deviceManager.attachDevice(newTransport, optionalName)`.
4. **No changes to `DeviceManagerService`, companion protocol parsing, state signals, or UI components are required.**

---

## 2. Angular & TypeScript Best Practices

### TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

### Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Do NOT set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly. `OnPush` is the default in Angular v22+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images (`NgOptimizedImage` does not work for inline base64 images).

### Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `model()` for two-way bound properties with `[(prop)]` syntax instead of pairing `input()` with `output()`
- Use `computed()` for derived state
- Use `linkedSignal()` for state derived from multiple reactive sources that must stay synchronized
- Prefer inline templates for small components
- Prefer Signal Forms (`@angular/forms/signals`) for new forms. They are stable in Angular v22+ and provide signal-based state, type-safe field access, and schema-based validation
- When not using Signal Forms, prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- Do NOT import `CommonModule`, import only the directives and pipes the template uses, such as `AsyncPipe` or `DatePipe`
- When using external templates/styles, use paths relative to the component TS file.

### State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

### Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

### Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Prefer the `@Service` decorator over `@Injectable({providedIn: 'root'})` for new singleton services (Angular v22+)
- Use the `inject()` function instead of constructor injection

---

## 3. Useful Commands

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
