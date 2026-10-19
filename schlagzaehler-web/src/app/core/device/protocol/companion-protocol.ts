import {
  DeviceState,
  GameEndReason,
  GameMode,
  GameState,
  SelectableGameMode,
  SensorState,
} from '../models/device.model';
import { CaptureProtocolMessage } from '../models/piezo-capture.model';

const VALID_GAME_MODES = new Set<GameMode>(['COUNT', 'TIMED', 'RACE', 'UNKNOWN']);
const VALID_GAME_STATES = new Set<GameState>([
  'BOOT',
  'MENU',
  'READY',
  'RUNNING',
  'FINISHED',
  'CAPTURING',
  'UNKNOWN',
]);
const VALID_SENSOR_STATES = new Set<SensorState>([
  'INIT',
  'CALIBRATING',
  'ARMED',
  'LOCKOUT',
  'CAPTURE_ARMED',
  'CAPTURING',
  'TRANSMITTING',
  'ERROR',
  'UNKNOWN',
]);
const VALID_END_REASONS = new Set<GameEndReason>([
  'NONE',
  'TIME_LIMIT',
  'TARGET_REACHED',
  'ABORTED',
]);

export const CompanionCommands = {
  start: (): string => 'START',
  reset: (): string => 'RESET',
  calibrate: (): string => 'CALIB',
  status: (): string => 'STATUS',
  captureStart: (): string => 'CAPTURE',
  captureStop: (): string => 'CAPTURE:STOP',
  setMode: (mode: SelectableGameMode): string => `MODE:${mode}`,
  setParameter: (param: number): string => `PARAM:${Math.max(1, Math.floor(param))}`,
  setSensitivity: (sensitivity: number): string => `SENS:${sensitivity}`,
} as const;

function computeIsReady(
  connectionState: DeviceState['connectionState'],
  gameState: GameState,
  sensorState: SensorState,
): boolean {
  if (connectionState !== 'connected' || sensorState === 'ERROR') {
    return false;
  }
  return gameState === 'READY' || gameState === 'RUNNING' || sensorState === 'ARMED';
}

function parseKeyValuePairs(tokens: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const token of tokens) {
    const eqIdx = token.indexOf('=');
    if (eqIdx > 0) {
      const key = token.slice(0, eqIdx);
      const val = token.slice(eqIdx + 1);
      result[key] = val;
    }
  }
  return result;
}

/**
 * Parses CAPTURE_START, CAPTURE_DATA, or CAPTURE_END messages if matched.
 */
export function parseCaptureMessage(rawLine: string): CaptureProtocolMessage | null {
  const trimmed = rawLine.trim();
  if (!trimmed.startsWith('CAPTURE_')) {
    return null;
  }

  const parts = trimmed.split(/\s+/);
  const type = parts[0];
  const kv = parseKeyValuePairs(parts.slice(1));

  if (type === 'CAPTURE_START') {
    const sampleRateHz = Number.parseInt(kv['rate'] ?? '10000', 10);
    const preSamples = Number.parseInt(kv['pre'] ?? '1000', 10);
    const totalSamples = Number.parseInt(kv['count'] ?? '21000', 10);
    const baseline = Number.parseInt(kv['baseline'] ?? '0', 10);
    const noise = Number.parseInt(kv['noise'] ?? '0', 10);
    const threshold = Number.parseInt(kv['threshold'] ?? '0', 10);

    if (Number.isNaN(totalSamples) || totalSamples <= 0) {
      return null;
    }

    return {
      type: 'CAPTURE_START',
      sampleRateHz: Number.isNaN(sampleRateHz) ? 10000 : sampleRateHz,
      preSamples: Number.isNaN(preSamples) ? 0 : preSamples,
      totalSamples,
      baseline: Number.isNaN(baseline) ? 0 : baseline,
      noise: Number.isNaN(noise) ? 0 : noise,
      threshold: Number.isNaN(threshold) ? 0 : threshold,
    };
  }

  if (type === 'CAPTURE_DATA') {
    const offset = Number.parseInt(kv['offset'] ?? '0', 10);
    const rawValues = kv['values'] ?? '';
    if (Number.isNaN(offset) || offset < 0 || !rawValues) {
      return null;
    }
    const values: number[] = [];
    for (const part of rawValues.split(',')) {
      const n = Number.parseInt(part, 10);
      if (!Number.isNaN(n)) {
        values.push(n);
      }
    }
    return {
      type: 'CAPTURE_DATA',
      offset,
      values,
    };
  }

  if (type === 'CAPTURE_END') {
    const totalSamples = Number.parseInt(kv['count'] ?? '0', 10);
    return {
      type: 'CAPTURE_END',
      totalSamples: Number.isNaN(totalSamples) ? 0 : totalSamples,
    };
  }

  return null;
}

/**
 * Parses a single newline-delimited message from the Pico companion protocol
 * and returns an updated DeviceState.
 */
export function parseCompanionMessage(
  rawLine: string,
  currentState: DeviceState,
  nowMs: number = Date.now(),
): DeviceState {
  const trimmed = rawLine.trim();
  if (!trimmed) {
    return currentState;
  }

  const parts = trimmed.split(/\s+/);
  const type = parts[0];
  const kv = parseKeyValuePairs(parts.slice(1));

  switch (type) {
    case 'STATE': {
      const rawNew = kv['new'] as GameState | undefined;
      const newState: GameState =
        rawNew && VALID_GAME_STATES.has(rawNew) ? rawNew : currentState.gameState;

      let elapsedMs = currentState.elapsedMs;
      let remainingMs = currentState.remainingMs;
      let score = currentState.score;
      let lastTimerUpdatedAt = currentState.lastTimerUpdatedAt;
      let endReason = currentState.endReason;

      if (newState === 'RUNNING' && currentState.gameState !== 'RUNNING') {
        elapsedMs = 0;
        remainingMs =
          currentState.mode === 'TIMED' && currentState.parameter > 0
            ? currentState.parameter * 1000
            : currentState.remainingMs;
        endReason = 'NONE';
        lastTimerUpdatedAt = nowMs;
      } else if (newState === 'READY') {
        score = 0;
        elapsedMs = 0;
        remainingMs =
          currentState.mode === 'TIMED' && currentState.parameter > 0
            ? currentState.parameter * 1000
            : 0;
        endReason = 'NONE';
        lastTimerUpdatedAt = null;
      } else if (newState !== 'RUNNING') {
        lastTimerUpdatedAt = null;
      }

      return new DeviceState({
        ...currentState,
        gameState: newState,
        score,
        elapsedMs,
        remainingMs,
        endReason,
        lastTimerUpdatedAt,
        isReady: computeIsReady(currentState.connectionState, newState, currentState.sensorState),
      });
    }

    case 'MODE': {
      const rawMode = kv['active'] as GameMode | undefined;
      const mode: GameMode = rawMode && VALID_GAME_MODES.has(rawMode) ? rawMode : currentState.mode;
      const paramParsed = Number.parseInt(kv['param'] ?? '', 10);
      const parameter = Number.isNaN(paramParsed) ? currentState.parameter : paramParsed;

      const isRunning = currentState.gameState === 'RUNNING';
      const elapsedMs = isRunning ? currentState.elapsedMs : 0;
      const remainingMs = isRunning
        ? currentState.remainingMs
        : mode === 'TIMED' && parameter > 0
          ? parameter * 1000
          : 0;

      return new DeviceState({
        ...currentState,
        mode,
        parameter,
        elapsedMs,
        remainingMs,
      });
    }

    case 'SCORE': {
      const scoreParsed = Number.parseInt(kv['value'] ?? '', 10);
      if (Number.isNaN(scoreParsed)) {
        return currentState;
      }
      return new DeviceState({
        ...currentState,
        score: scoreParsed,
      });
    }

    case 'TIMER': {
      const elapsedParsed = Number.parseInt(kv['elapsed'] ?? '', 10);
      const remainingParsed = Number.parseInt(kv['remaining'] ?? '', 10);
      const elapsedMs = Number.isNaN(elapsedParsed) ? currentState.elapsedMs : elapsedParsed;
      const remainingMs = Number.isNaN(remainingParsed)
        ? currentState.remainingMs
        : remainingParsed;

      return new DeviceState({
        ...currentState,
        elapsedMs,
        remainingMs,
        lastTimerUpdatedAt: currentState.gameState === 'RUNNING' ? nowMs : null,
      });
    }

    case 'RESULT': {
      const scoreParsed = Number.parseInt(kv['score'] ?? '', 10);
      const timeParsed = Number.parseInt(kv['time_ms'] ?? '', 10);
      const rawReason = kv['reason'] as GameEndReason | undefined;

      const score = Number.isNaN(scoreParsed) ? currentState.score : scoreParsed;
      const elapsedMs = Number.isNaN(timeParsed) ? currentState.elapsedMs : timeParsed;
      const endReason: GameEndReason =
        rawReason && VALID_END_REASONS.has(rawReason) ? rawReason : currentState.endReason;
      const remainingMs = endReason === 'TIME_LIMIT' ? 0 : currentState.remainingMs;

      return new DeviceState({
        ...currentState,
        gameState: 'FINISHED',
        score,
        elapsedMs,
        remainingMs,
        endReason,
        lastTimerUpdatedAt: null,
        isReady: computeIsReady(currentState.connectionState, 'FINISHED', currentState.sensorState),
      });
    }

    case 'SENSOR': {
      const rawStatus = kv['status'] as SensorState | undefined;
      const sensorState: SensorState =
        rawStatus && VALID_SENSOR_STATES.has(rawStatus) ? rawStatus : currentState.sensorState;

      return new DeviceState({
        ...currentState,
        sensorState,
        isReady: computeIsReady(currentState.connectionState, currentState.gameState, sensorState),
      });
    }

    case 'CALIB': {
      const success = kv['success'] === '1';
      const sensorState: SensorState = success ? 'ARMED' : 'ERROR';
      return new DeviceState({
        ...currentState,
        sensorState,
        isReady: computeIsReady(currentState.connectionState, currentState.gameState, sensorState),
      });
    }

    case 'BOOT': {
      const gameState: GameState =
        currentState.gameState === 'UNKNOWN' ? 'BOOT' : currentState.gameState;
      return new DeviceState({
        ...currentState,
        gameState,
        isReady: computeIsReady(currentState.connectionState, gameState, currentState.sensorState),
      });
    }

    default:
      return currentState;
  }
}
