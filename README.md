# Schlagzähler

Piezo-based hit detection system featuring embedded firmware on the Raspberry Pi Pico and an Angular Web Serial companion interface.

## Repository Structure

- **[`schlagzaehler-pico/`](./schlagzaehler-pico/)**: Firmware for Raspberry Pi Pico (RP2040) written in C. Reads piezo sensor signals and outputs newline-delimited event strings via USB serial.
- **[`schlagzaehler-web/`](./schlagzaehler-web/)**: Web interface built with Angular v22, Tailwind CSS 4, and Web Serial API. Connects to multiple Pico devices simultaneously and streams events in real time.
- **[`analysis/`](./analysis/)**: Sensor diagnostics and analysis scripts.

## Agent & Developer Context

Comprehensive architecture notes, state of progress, and guidelines for future CLI sessions can be found in [**`AGENTS.md`**](./AGENTS.md).

## Quick Start (Web)

```bash
cd schlagzaehler-web
npm install
npm start
```

Navigate to `http://localhost:4200/` in a Chromium-based browser supporting the Web Serial API (Chrome, Edge, Opera).
