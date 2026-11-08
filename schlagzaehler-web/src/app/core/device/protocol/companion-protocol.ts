import {
  DeviceMetadata,
  DeviceState,
  GameState,
  SelectableGameMode,
  SensorState,
} from '../models/device.model';
import { CaptureProtocolMessage } from '../models/piezo-capture.model';
import { serializeBinaryFrame } from './binary-frame-parser';
import { parseBinaryPayload } from './binary-payload-parser';
import { parseAsciiPayload } from './ascii-payload-parser';
import {
  BinaryCommandType,
  BinaryFrame,
  BinaryGameMode,
  HANDSHAKE_FLAG_TLV_MODE,
  PROTOCOL_VERSION,
} from './binary-protocol.types';
import {
  SensorCalibration,
  UnifiedProtocolMessage,
} from './companion-protocol.types';
import { TransportEvent } from '../transport/device-transport.interface';

export type { SensorCalibration, UnifiedProtocolMessage };

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
    let targetVal = 255;
    if (typeof target === 'number' && target >= 0 && target <= 2) {
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

/**
 * Universal protocol parser converting any neutral TransportEvent (binary frame or ASCII line)
 * into a strongly typed UnifiedProtocolMessage.
 */
export function parseTransportEvent(event: TransportEvent): UnifiedProtocolMessage | null {
  if (event.type === 'binary') {
    return parseBinaryPayload(event.content);
  }
  return parseAsciiPayload(event.content);
}

/**
 * Core application state reducer that applies any UnifiedProtocolMessage to a DeviceState.
 * After Layer 2, there is zero difference between ASCII and binary message handling.
 */
export function applyUnifiedMessageToDeviceState(
  currentState: DeviceState,
  msg: UnifiedProtocolMessage,
  nowMs: number = Date.now(),
): DeviceState {
  switch (msg.type) {
    case 'GAME_STATE': {
      const newState = msg.payload.state;
      if (newState === 'UNKNOWN') return currentState;

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

    case 'GAME_MODE': {
      const { mode, parameter } = msg.payload;
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
      return new DeviceState({
        ...currentState,
        score: msg.payload.score,
      });
    }

    case 'TIMER': {
      const { elapsedMs, remainingMs } = msg.payload;
      return new DeviceState({
        ...currentState,
        elapsedMs,
        remainingMs,
        lastTimerUpdatedAt: currentState.gameState === 'RUNNING' ? nowMs : null,
      });
    }

    case 'GAME_FINISHED': {
      const { finalScore, totalTimeMs, reason } = msg.payload;
      const remainingMs = reason === 'TIME_LIMIT' ? 0 : currentState.remainingMs;

      return new DeviceState({
        ...currentState,
        gameState: 'FINISHED',
        score: finalScore,
        elapsedMs: totalTimeMs,
        remainingMs,
        endReason: reason,
        lastTimerUpdatedAt: null,
        isReady: computeIsReady(currentState.connectionState, 'FINISHED', currentState.sensorState),
      });
    }

    case 'SENSOR_STATUS': {
      const sensorState = msg.payload.state;
      if (sensorState === 'UNKNOWN') return currentState;

      return new DeviceState({
        ...currentState,
        sensorState,
        isReady: computeIsReady(currentState.connectionState, currentState.gameState, sensorState),
      });
    }

    case 'CALIBRATION_RESULT': {
      if (msg.payload.repeated) {
        return currentState;
      }
      const sensorState: SensorState = msg.payload.ignored ? 'ERROR' : 'ARMED';
      return new DeviceState({
        ...currentState,
        sensorState,
        isReady: computeIsReady(currentState.connectionState, currentState.gameState, sensorState),
      });
    }

    case 'HANDSHAKE_ACK': {
      const ack = msg.payload;
      return new DeviceState({
        ...currentState,
        hardwareGen: ack.hardwareGen,
        hardwareRev: ack.hardwareRev,
        protoMajor: ack.protoMajor,
        protoMinor: ack.protoMinor,
        fwVersion: `${ack.fwMajor}.${ack.fwMinor}.${ack.fwPatch}`,
        uptimeMs: ack.uptimeMs,
      });
    }

    default:
      return currentState;
  }
}

/**
 * Parses ASCII calibration result line:
 * `CALIB success=1 target=0 repeated=false baseline=1850 noise=12 threshold=1910 ignored=false`
 */
export function parseCalibrationMessage(rawLine: string): SensorCalibration | null {
  const msg = parseAsciiPayload(rawLine);
  return msg && msg.type === 'CALIBRATION_RESULT' ? msg.payload : null;
}

/**
 * Parses CAPTURE_START, CAPTURE_DATA, or CAPTURE_END messages from an ASCII line.
 */
export function parseCaptureMessage(rawLine: string): CaptureProtocolMessage | null {
  const msg = parseAsciiPayload(rawLine);
  if (
    msg &&
    (msg.type === 'CAPTURE_START' || msg.type === 'CAPTURE_DATA' || msg.type === 'CAPTURE_END')
  ) {
    return msg.payload;
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
  const msg = parseAsciiPayload(rawLine);
  if (!msg) return currentState;
  return applyUnifiedMessageToDeviceState(currentState, msg, nowMs);
}

/**
 * Parses binary telemetry frames into updated DeviceState.
 */
export function parseBinaryCompanionMessage(
  frame: BinaryFrame,
  currentState: DeviceState,
  nowMs: number = Date.now(),
): DeviceState {
  const msg = parseBinaryPayload(frame);
  if (!msg) return currentState;
  return applyUnifiedMessageToDeviceState(currentState, msg, nowMs);
}

/**
 * Extracts calibration result from a MSG_CALIBRATION_RESULT binary frame.
 */
export function parseBinaryCalibration(frame: BinaryFrame): SensorCalibration | null {
  const msg = parseBinaryPayload(frame);
  return msg && msg.type === 'CALIBRATION_RESULT' ? msg.payload : null;
}

/**
 * Extracts capture protocol messages (MSG_CAPTURE_START, MSG_CAPTURE_DATA, MSG_CAPTURE_END)
 * from binary frames.
 */
export function parseBinaryCaptureMessage(frame: BinaryFrame): CaptureProtocolMessage | null {
  const msg = parseBinaryPayload(frame);
  if (
    msg &&
    (msg.type === 'CAPTURE_START' || msg.type === 'CAPTURE_DATA' || msg.type === 'CAPTURE_END')
  ) {
    return msg.payload;
  }
  return null;
}

/**
 * Extracts hardware/version metadata from MSG_HANDSHAKE_ACK.
 */
export function parseBinaryMetadata(frame: BinaryFrame): Partial<DeviceMetadata> | null {
  const msg = parseBinaryPayload(frame);
  if (msg && msg.type === 'HANDSHAKE_ACK') {
    const ack = msg.payload;
    return {
      hardwareGen: ack.hardwareGen,
      hardwareRev: ack.hardwareRev,
      protoMajor: ack.protoMajor,
      protoMinor: ack.protoMinor,
      fwVersion: `${ack.fwMajor}.${ack.fwMinor}.${ack.fwPatch}`,
      uptimeMs: ack.uptimeMs,
    };
  }
  return null;
}

/**
 * Formats a binary frame into a readable string for the event log.
 */
export function formatBinaryEventForLog(frame: BinaryFrame): string {
  const msg = parseBinaryPayload(frame);
  return msg
    ? msg.rawText
    : `[BINARY 0x${frame.type.toString(16).padStart(2, '0').toUpperCase()} seq=${frame.seq}]`;
}
