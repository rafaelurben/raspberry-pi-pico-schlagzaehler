import {
  DeviceMetadata,
  DeviceState,
  GameEndReason,
  GameMode,
  GameState,
  SelectableGameMode,
  SensorState,
} from '../models/device.model';
import {
  CaptureDataMessage,
  CaptureEndMessage,
  CaptureProtocolMessage,
  CaptureStartMessage,
} from '../models/piezo-capture.model';
import { serializeBinaryFrame } from './binary-frame-parser';
import {
  BinaryCommandType,
  BinaryFrame,
  BinaryGameMode,
  BinaryMessageType,
  CALIB_FLAG_IGNORED,
  CALIB_FLAG_REPEATED,
  HANDSHAKE_FLAG_TLV_MODE,
  PROTOCOL_VERSION,
} from './binary-protocol.types';

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
  'CAPTURE_TX_WAIT',
  'ERROR',
  'UNKNOWN',
]);
const VALID_END_REASONS = new Set<GameEndReason>([
  'NONE',
  'TIME_LIMIT',
  'TARGET_REACHED',
  'ABORTED',
]);

const BINARY_SENSOR_STATE_MAP: readonly SensorState[] = [
  'INIT',
  'CALIBRATING',
  'ARMED',
  'LOCKOUT',
  'CAPTURE_ARMED',
  'CAPTURING',
  'CAPTURE_TX_WAIT',
  'ERROR',
];

const BINARY_GAME_STATE_MAP: readonly GameState[] = [
  'BOOT',
  'MENU',
  'READY',
  'RUNNING',
  'FINISHED',
  'CAPTURING',
];

const BINARY_GAME_MODE_MAP: readonly GameMode[] = ['COUNT', 'TIMED', 'RACE'];

const BINARY_END_REASON_MAP: readonly GameEndReason[] = [
  'NONE',
  'TIME_LIMIT',
  'TARGET_REACHED',
  'ABORTED',
];

const BINARY_COMPONENT_MAP: readonly string[] = ['SYSTEM', 'ADC', 'DMA', 'USB', 'DISPLAY'];

export interface SensorCalibration {
  readonly sensorId: number;
  readonly baseline: number;
  readonly noise: number;
  readonly threshold: number;
  readonly ignored: boolean;
  readonly repeated: boolean;
}

let outgoingSeqCounter = 0;
function getNextSeq(): number {
  outgoingSeqCounter = (outgoingSeqCounter + 1) & 0xffff;
  return outgoingSeqCounter;
}

export function resetSequenceCounter(): void {
  outgoingSeqCounter = 0;
}

/**
 * Text-based ASCII command builders (ICD Section 7.1).
 */
export const CompanionCommands = {
  start: (): string => 'START',
  reset: (): string => 'RESET',
  calibrate: (): string => 'CALIB',
  status: (): string => 'STATUS',
  captureStart: (target?: number | 'all'): string =>
    target !== undefined ? `CAPTURE:${target}` : 'CAPTURE',
  captureStop: (): string => 'CAPTURE:STOP',
  setMode: (mode: SelectableGameMode): string => `MODE:${mode}`,
  setParameter: (param: number): string => `PARAM:${Math.max(1, Math.floor(param))}`,
  setSensitivity: (sensitivity: number): string => `SENS:${sensitivity}`,
} as const;

/**
 * Binary command packet builders (ICD Section 5).
 */
export const BinaryCompanionCommands = {
  /**
   * Builds CMD_HANDSHAKE packet (0x01) with TLV_MODE flag and client nonce.
   */
  handshake: (options?: {
    clientNonce?: number;
    clientProtoMajor?: number;
    clientProtoMinor?: number;
    tlvMode?: boolean;
    seq?: number;
  }): Uint8Array => {
    const payload = new Uint8Array(8);
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

    const major = options?.clientProtoMajor ?? PROTOCOL_VERSION;
    const minor = options?.clientProtoMinor ?? 0;
    const tlv = options?.tlvMode ?? true;
    const flags = tlv ? HANDSHAKE_FLAG_TLV_MODE : 0;
    const nonce = options?.clientNonce ?? generateRandomNonce();

    view.setUint8(0, major);
    view.setUint8(1, minor);
    view.setUint16(2, flags, true);
    view.setUint32(4, nonce, true);

    const seq = options?.seq ?? getNextSeq();
    return serializeBinaryFrame(BinaryCommandType.CMD_HANDSHAKE, payload, 0, seq);
  },

  /**
   * Builds CMD_START packet (0x02).
   */
  start: (seq?: number): Uint8Array =>
    serializeBinaryFrame(BinaryCommandType.CMD_START, new Uint8Array(0), 0, seq ?? getNextSeq()),

  /**
   * Builds CMD_RESET packet (0x03).
   */
  reset: (seq?: number): Uint8Array =>
    serializeBinaryFrame(BinaryCommandType.CMD_RESET, new Uint8Array(0), 0, seq ?? getNextSeq()),

  /**
   * Builds CMD_CALIBRATE packet (0x04).
   */
  calibrate: (seq?: number): Uint8Array =>
    serializeBinaryFrame(
      BinaryCommandType.CMD_CALIBRATE,
      new Uint8Array(0),
      0,
      seq ?? getNextSeq(),
    ),

  /**
   * Builds CMD_STATUS packet (0x05).
   */
  status: (seq?: number): Uint8Array =>
    serializeBinaryFrame(BinaryCommandType.CMD_STATUS, new Uint8Array(0), 0, seq ?? getNextSeq()),

  /**
   * Builds CMD_SET_MODE packet (0x06).
   */
  setMode: (mode: SelectableGameMode | BinaryGameMode, seq?: number): Uint8Array => {
    let modeVal: number;
    if (typeof mode === 'string') {
      modeVal = mode === 'COUNT' ? 0 : mode === 'TIMED' ? 1 : 2;
    } else {
      modeVal = mode;
    }
    const payload = new Uint8Array([modeVal & 0xff]);
    return serializeBinaryFrame(BinaryCommandType.CMD_SET_MODE, payload, 0, seq ?? getNextSeq());
  },

  /**
   * Builds CMD_SET_PARAMETER packet (0x07).
   */
  setParameter: (param: number, seq?: number): Uint8Array => {
    const sanitized = Math.max(1, Math.floor(param));
    const payload = new Uint8Array(4);
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    view.setUint32(0, sanitized, true);
    return serializeBinaryFrame(
      BinaryCommandType.CMD_SET_PARAMETER,
      payload,
      0,
      seq ?? getNextSeq(),
    );
  },

  /**
   * Builds CMD_SET_SENSITIVITY packet (0x08).
   */
  setSensitivity: (noiseFactor: number, seq?: number): Uint8Array => {
    const payload = new Uint8Array(4);
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    view.setFloat32(0, noiseFactor, true);
    return serializeBinaryFrame(
      BinaryCommandType.CMD_SET_SENSITIVITY,
      payload,
      0,
      seq ?? getNextSeq(),
    );
  },

  /**
   * Builds CMD_CAPTURE packet (0x09).
   */
  capture: (
    action: 'start' | 'stop' | number,
    target?: number | 'all',
    seq?: number,
  ): Uint8Array => {
    const actionVal = action === 'start' || action === 1 ? 1 : 0;
    let targetVal = 3;
    if (typeof target === 'number' && target >= 0 && target <= 3) {
      targetVal = target;
    }
    const payload = new Uint8Array([actionVal, targetVal, 0, 0]);
    return serializeBinaryFrame(BinaryCommandType.CMD_CAPTURE, payload, 0, seq ?? getNextSeq());
  },

  captureStart: (target?: number | 'all', seq?: number): Uint8Array =>
    BinaryCompanionCommands.capture('start', target, seq),

  captureStop: (seq?: number): Uint8Array => BinaryCompanionCommands.capture('stop', 0, seq),
} as const;

function generateRandomNonce(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] || 0x12345678;
  }
  return (Math.floor(Math.random() * 0xffffffff) + 1) >>> 0;
}

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
 * Parses ASCII calibration result line:
 * `CALIB success=1 target=0 repeated=false baseline=1850 noise=12 threshold=1910 ignored=false`
 */
export function parseCalibrationMessage(rawLine: string): SensorCalibration | null {
  const trimmed = rawLine.trim();
  if (!trimmed.startsWith('CALIB')) {
    return null;
  }
  const parts = trimmed.split(/\s+/);
  const kv = parseKeyValuePairs(parts.slice(1));
  const targetParsed = Number.parseInt(kv['target'] ?? '0', 10);
  const baselineParsed = Number.parseInt(kv['baseline'] ?? '0', 10);
  const noiseParsed = Number.parseInt(kv['noise'] ?? '0', 10);
  const thresholdParsed = Number.parseInt(kv['threshold'] ?? '0', 10);

  return {
    sensorId: Number.isNaN(targetParsed) ? 0 : targetParsed,
    baseline: Number.isNaN(baselineParsed) ? 0 : baselineParsed,
    noise: Number.isNaN(noiseParsed) ? 0 : noiseParsed,
    threshold: Number.isNaN(thresholdParsed) ? 0 : thresholdParsed,
    ignored: kv['ignored'] === 'true',
    repeated: kv['repeated'] === 'true',
  };
}

/**
 * Parses CAPTURE_START, CAPTURE_DATA, or CAPTURE_END messages from an ASCII line.
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
    const targetParsed = Number.parseInt(kv['target'] ?? '', 10);
    const target = Number.isNaN(targetParsed) ? undefined : targetParsed;

    if (Number.isNaN(totalSamples) || totalSamples <= 0) {
      return null;
    }

    return {
      type: 'CAPTURE_START',
      sampleRateHz: Number.isNaN(sampleRateHz) ? 10000 : sampleRateHz,
      preSamples: Number.isNaN(preSamples) ? 0 : preSamples,
      totalSamples,
      target,
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
 * Parses a single newline-delimited ASCII message from the Pico companion protocol
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
      const repeated = kv['repeated'] === 'true';

      // If repeated, this was re-sent immediately before capture streaming; do not alter sensorState
      if (repeated) {
        return currentState;
      }

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

/**
 * Parses binary telemetry frames into updated DeviceState.
 */
export function parseBinaryCompanionMessage(
  frame: BinaryFrame,
  currentState: DeviceState,
  nowMs: number = Date.now(),
): DeviceState {
  const payload = frame.payload;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  switch (frame.type) {
    case BinaryMessageType.MSG_HANDSHAKE_ACK: {
      if (payload.length < 20) {
        return currentState;
      }
      const hardwareGen = view.getUint8(0);
      const hardwareRev = view.getUint8(1);
      const protoMajor = view.getUint8(2);
      const protoMinor = view.getUint8(3);
      const fwMajor = view.getUint8(4);
      const fwMinor = view.getUint8(5);
      const fwPatch = view.getUint8(6);
      const uptimeMs = view.getUint32(16, true);

      return new DeviceState({
        ...currentState,
        hardwareGen,
        hardwareRev,
        protoMajor,
        protoMinor,
        fwVersion: `${fwMajor}.${fwMinor}.${fwPatch}`,
        uptimeMs,
      });
    }

    case BinaryMessageType.MSG_SENSOR_STATUS: {
      if (payload.length < 1) {
        return currentState;
      }
      const stateNum = view.getUint8(0);
      const sensorState: SensorState = BINARY_SENSOR_STATE_MAP[stateNum] ?? 'UNKNOWN';

      return new DeviceState({
        ...currentState,
        sensorState,
        isReady: computeIsReady(currentState.connectionState, currentState.gameState, sensorState),
      });
    }

    case BinaryMessageType.MSG_CALIBRATION_RESULT: {
      if (payload.length < 8) {
        return currentState;
      }
      const flags = view.getUint8(0);
      const repeated = (flags & CALIB_FLAG_REPEATED) !== 0;
      const ignored = (flags & CALIB_FLAG_IGNORED) !== 0;

      // If repeated, do not overwrite sensorState (it was re-sent before capture streaming)
      if (repeated) {
        return currentState;
      }

      const sensorState: SensorState = ignored ? 'ERROR' : 'ARMED';
      return new DeviceState({
        ...currentState,
        sensorState,
        isReady: computeIsReady(currentState.connectionState, currentState.gameState, sensorState),
      });
    }

    case BinaryMessageType.MSG_GAME_STATE: {
      if (payload.length < 2) {
        return currentState;
      }
      const newNum = view.getUint8(1);
      const newState: GameState = BINARY_GAME_STATE_MAP[newNum] ?? currentState.gameState;

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

    case BinaryMessageType.MSG_GAME_MODE: {
      if (payload.length < 8) {
        return currentState;
      }
      const modeNum = view.getUint8(0);
      const mode: GameMode = BINARY_GAME_MODE_MAP[modeNum] ?? currentState.mode;
      const parameter = view.getUint32(4, true);

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

    case BinaryMessageType.MSG_SCORE: {
      if (payload.length < 4) {
        return currentState;
      }
      const score = view.getUint32(0, true);
      return new DeviceState({
        ...currentState,
        score,
      });
    }

    case BinaryMessageType.MSG_TIMER: {
      if (payload.length < 8) {
        return currentState;
      }
      const elapsedMs = view.getUint32(0, true);
      const remainingMs = view.getUint32(4, true);

      return new DeviceState({
        ...currentState,
        elapsedMs,
        remainingMs,
        lastTimerUpdatedAt: currentState.gameState === 'RUNNING' ? nowMs : null,
      });
    }

    case BinaryMessageType.MSG_GAME_FINISHED: {
      if (payload.length < 9) {
        return currentState;
      }
      const finalScore = view.getUint32(0, true);
      const totalTimeMs = view.getUint32(4, true);
      const reasonNum = view.getUint8(8);
      const endReason: GameEndReason = BINARY_END_REASON_MAP[reasonNum] ?? 'NONE';
      const remainingMs = endReason === 'TIME_LIMIT' ? 0 : currentState.remainingMs;

      return new DeviceState({
        ...currentState,
        gameState: 'FINISHED',
        score: finalScore,
        elapsedMs: totalTimeMs,
        remainingMs,
        endReason,
        lastTimerUpdatedAt: null,
        isReady: computeIsReady(currentState.connectionState, 'FINISHED', currentState.sensorState),
      });
    }

    default:
      return currentState;
  }
}

/**
 * Extracts calibration result from a MSG_CALIBRATION_RESULT binary frame.
 */
export function parseBinaryCalibration(frame: BinaryFrame): SensorCalibration | null {
  if (frame.type !== BinaryMessageType.MSG_CALIBRATION_RESULT || frame.payload.length < 8) {
    return null;
  }
  const view = new DataView(
    frame.payload.buffer,
    frame.payload.byteOffset,
    frame.payload.byteLength,
  );
  const flags = view.getUint8(0);
  const ignored = (flags & CALIB_FLAG_IGNORED) !== 0;
  const repeated = (flags & CALIB_FLAG_REPEATED) !== 0;
  const sensorId = view.getUint8(1);
  const baseline = view.getUint16(2, true);
  const noiseSpan = view.getUint16(4, true);
  const threshold = view.getUint16(6, true);

  return {
    sensorId,
    baseline,
    noise: noiseSpan,
    threshold,
    ignored,
    repeated,
  };
}

/**
 * Extracts capture protocol messages (MSG_CAPTURE_START, MSG_CAPTURE_DATA, MSG_CAPTURE_END)
 * from binary frames.
 *
 * For MSG_CAPTURE_DATA, samples are wrapped directly via zero-copy Uint16Array.
 */
export function parseBinaryCaptureMessage(frame: BinaryFrame): CaptureProtocolMessage | null {
  const payload = frame.payload;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  if (frame.type === BinaryMessageType.MSG_CAPTURE_START) {
    if (payload.length < 9) {
      return null;
    }
    const sampleRateHz = view.getUint32(0, true);
    const preSamples = view.getUint16(4, true);
    const totalSamples = view.getUint16(6, true);
    const targetChannel = view.getUint8(8);

    return {
      type: 'CAPTURE_START',
      sampleRateHz,
      preSamples,
      totalSamples,
      target: targetChannel,
    } satisfies CaptureStartMessage;
  }

  if (frame.type === BinaryMessageType.MSG_CAPTURE_DATA) {
    if (payload.length < 4) {
      return null;
    }
    const offset = view.getUint16(0, true);
    const count = view.getUint16(2, true);
    const expectedByteLen = 4 + count * 2;
    if (payload.length < expectedByteLen) {
      return null;
    }

    // Zero-copy wrapping of 16-bit little-endian samples
    const byteStart = payload.byteOffset + 4;
    const samples =
      byteStart % 2 === 0
        ? new Uint16Array(payload.buffer, byteStart, count)
        : new Uint16Array(payload.buffer.slice(byteStart, byteStart + count * 2));

    return {
      type: 'CAPTURE_DATA',
      offset,
      values: samples,
    } satisfies CaptureDataMessage;
  }

  if (frame.type === BinaryMessageType.MSG_CAPTURE_END) {
    if (payload.length < 2) {
      return null;
    }
    const totalSamples = view.getUint16(0, true);
    return {
      type: 'CAPTURE_END',
      totalSamples,
    } satisfies CaptureEndMessage;
  }

  return null;
}

/**
 * Extracts hardware/version metadata from MSG_HANDSHAKE_ACK.
 */
export function parseBinaryMetadata(frame: BinaryFrame): Partial<DeviceMetadata> | null {
  if (frame.type !== BinaryMessageType.MSG_HANDSHAKE_ACK || frame.payload.length < 20) {
    return null;
  }
  const view = new DataView(
    frame.payload.buffer,
    frame.payload.byteOffset,
    frame.payload.byteLength,
  );
  const hardwareGen = view.getUint8(0);
  const hardwareRev = view.getUint8(1);
  const protoMajor = view.getUint8(2);
  const protoMinor = view.getUint8(3);
  const fwMajor = view.getUint8(4);
  const fwMinor = view.getUint8(5);
  const fwPatch = view.getUint8(6);
  const uptimeMs = view.getUint32(16, true);

  return {
    hardwareGen,
    hardwareRev,
    protoMajor,
    protoMinor,
    fwVersion: `${fwMajor}.${fwMinor}.${fwPatch}`,
    uptimeMs,
  };
}

/**
 * Formats a binary frame into a readable string for the event log.
 */
export function formatBinaryEventForLog(frame: BinaryFrame): string {
  const payload = frame.payload;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  switch (frame.type) {
    case BinaryMessageType.MSG_HANDSHAKE_ACK: {
      if (payload.length < 20) return `[MSG_HANDSHAKE_ACK]`;
      const hwGen = view.getUint8(0);
      const hwRev = view.getUint8(1);
      const pMaj = view.getUint8(2);
      const pMin = view.getUint8(3);
      const fMaj = view.getUint8(4);
      const fMin = view.getUint8(5);
      const fPatch = view.getUint8(6);
      const status = view.getUint8(7);
      const uptime = view.getUint32(16, true);
      return `HANDSHAKE_ACK hw=${hwGen}.${hwRev} proto=${pMaj}.${pMin} fw=${fMaj}.${fMin}.${fPatch} status=${status} uptime=${uptime}ms`;
    }
    case BinaryMessageType.MSG_SENSOR_STATUS: {
      const state = BINARY_SENSOR_STATE_MAP[payload[0]] ?? 'UNKNOWN';
      return `SENSOR status=${state}`;
    }
    case BinaryMessageType.MSG_CALIBRATION_RESULT: {
      if (payload.length < 8) return `[MSG_CALIB]`;
      const flags = view.getUint8(0);
      const target = view.getUint8(1);
      const base = view.getUint16(2, true);
      const noise = view.getUint16(4, true);
      const thresh = view.getUint16(6, true);
      const ignored = (flags & CALIB_FLAG_IGNORED) !== 0;
      const repeated = (flags & CALIB_FLAG_REPEATED) !== 0;
      return `CALIB target=${target} repeated=${repeated} baseline=${base} noise=${noise} threshold=${thresh} ignored=${ignored}`;
    }
    case BinaryMessageType.MSG_HIT_DETECTED: {
      if (payload.length < 16) return `[MSG_HIT]`;
      const hitId = view.getUint32(0, true);
      const peak = view.getUint16(4, true);
      const intensity = view.getUint16(6, true);
      const sensorId = view.getUint8(8);
      return `HIT id=${hitId} target=${sensorId} peak=${peak} intensity=${intensity}`;
    }
    case BinaryMessageType.MSG_GAME_STATE: {
      const oldS = BINARY_GAME_STATE_MAP[payload[0]] ?? 'UNKNOWN';
      const newS = BINARY_GAME_STATE_MAP[payload[1]] ?? 'UNKNOWN';
      return `STATE old=${oldS} new=${newS}`;
    }
    case BinaryMessageType.MSG_GAME_MODE: {
      const mode = BINARY_GAME_MODE_MAP[payload[0]] ?? 'UNKNOWN';
      const param = view.getUint32(4, true);
      return `MODE active=${mode} param=${param}`;
    }
    case BinaryMessageType.MSG_SCORE: {
      const score = view.getUint32(0, true);
      return `SCORE value=${score}`;
    }
    case BinaryMessageType.MSG_TIMER: {
      const el = view.getUint32(0, true);
      const rem = view.getUint32(4, true);
      return `TIMER elapsed=${el} remaining=${rem}`;
    }
    case BinaryMessageType.MSG_GAME_FINISHED: {
      const score = view.getUint32(0, true);
      const timeMs = view.getUint32(4, true);
      const reason = BINARY_END_REASON_MAP[view.getUint8(8)] ?? 'NONE';
      return `RESULT score=${score} time_ms=${timeMs} reason=${reason}`;
    }
    case BinaryMessageType.MSG_CAPTURE_START: {
      const rate = view.getUint32(0, true);
      const pre = view.getUint16(4, true);
      const count = view.getUint16(6, true);
      const target = view.getUint8(8);
      return `CAPTURE_START rate=${rate} pre=${pre} count=${count} target=${target}`;
    }
    case BinaryMessageType.MSG_CAPTURE_END: {
      const count = view.getUint16(0, true);
      return `CAPTURE_END count=${count}`;
    }
    case BinaryMessageType.MSG_ERROR: {
      const code = view.getUint32(0, true);
      const comp = BINARY_COMPONENT_MAP[view.getUint8(4)] ?? 'UNKNOWN';
      const len = view.getUint8(6);
      const textDecoder = new TextDecoder('utf-8', { fatal: false });
      const msg = textDecoder.decode(payload.subarray(7, 7 + len));
      return `ERROR code=${code} comp=${comp} msg=${msg}`;
    }
    default:
      return `[BINARY 0x${frame.type.toString(16).padStart(2, '0').toUpperCase()} seq=${frame.seq}]`;
  }
}
