#!/usr/bin/env bash
set -euo pipefail

# Resolve directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PICO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Switch to pico project directory so relative paths are consistent
cd "${PICO_DIR}"

# Compiler and temporary test binary
CC="${CC:-cc}"
# Note: X's are replaced by mktemp
OUTPUT_BIN="$(mktemp "${TMPDIR:-/tmp}/schlagzaehler_pico_test_firmware.XXXXXXX")"

# Ensure cleanup on exit
cleanup() {
  rm -f "${OUTPUT_BIN}"
}
trap cleanup EXIT

echo "Compiling firmware unit tests with ${CC}..."
"${CC}" -std=c23 -Wall -Wextra -Isrc \
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
  -lm -o "${OUTPUT_BIN}"

echo "Running tests..."
"${OUTPUT_BIN}" "$@"
