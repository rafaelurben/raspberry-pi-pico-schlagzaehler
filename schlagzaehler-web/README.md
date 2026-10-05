# Schlagzähler Web Interface

Real-time multi-device Web Serial interface for Raspberry Pi Pico devices built with Angular v22, Tailwind CSS 4, and Vitest.

## Features

- **Multi-Device Concurrency**: Connects to multiple Raspberry Pi Pico devices concurrently using the W3C Web Serial API.
- **Transport Abstraction Layer**: Generic `DeviceTransport` contract allowing future transports (e.g. Web Bluetooth, WebSocket) to be plugged in without changing the UI or application state.
- **Robust Line Buffering**: `NewlineEventParser` handles chunk fragmentation, CRLF / LF line endings, and ignores empty lines.
- **Fault Isolation**: Device connection drops and transport errors are isolated per-device without affecting other active streams.
- **Modern Angular State**: Uses Angular Signals for UI and connection state management, with RxJS for asynchronous event streams.
- **Accessible UI**: High-contrast, WCAG AA compliant dashboard built with Tailwind CSS.

## Getting Started

### Development Server

Run:

```bash
npm start
```

Navigate to `http://localhost:4200/` using a browser supporting the Web Serial API (Google Chrome, Microsoft Edge, Opera).

### Running Tests

```bash
npm test -- --watch=false
```

All unit tests are executed using [Vitest](https://vitest.dev/).

### Linting

```bash
npm run lint
```

### Formatting

```bash
npm run format
```

### Production Build

```bash
npm run build
```

## Architecture

See the root [**`AGENTS.md`**](../AGENTS.md) and [`AGENTS.md`](./AGENTS.md) for full architectural specifications, design guidelines, and extension runbooks.
