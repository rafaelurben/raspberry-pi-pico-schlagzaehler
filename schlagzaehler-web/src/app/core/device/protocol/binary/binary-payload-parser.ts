import { serializeBinaryFrame } from '../parser/binary/binary-frame-parser';
import {
  BINARY_COMPONENT_MAP,
  BINARY_END_REASON_MAP,
  BINARY_GAME_MODE_MAP,
  BINARY_GAME_STATE_MAP,
  BINARY_SENSOR_STATE_MAP,
  BinaryCaptureAction,
  BinaryCommandType,
  BinaryFrame,
  BinaryMessageType,
  CALIB_FLAG_IGNORED,
  CALIB_FLAG_REPEATED,
  HANDSHAKE_FLAG_TLV_MODE,
  PROTOCOL_VERSION,
} from './binary-protocol.types';
import {
  HandshakeAckPayload,
  UnifiedProtocolCommand,
  UnifiedProtocolMessage,
} from '../companion-protocol.types';

/**
 * Parses a raw BinaryFrame into a strongly typed UnifiedProtocolMessage with encoding='binary'.
 * If the payload is truncated or invalid, logs console.error / console.warn and returns null.
 */
export function parseBinaryPayload(frame: BinaryFrame): UnifiedProtocolMessage | null {
  const { type, payload } = frame;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  switch (type) {
    case BinaryMessageType.MSG_HANDSHAKE_ACK: {
      if (payload.length < 20) {
        console.error(
          `[BinaryPayloadParser] Truncated MSG_HANDSHAKE_ACK: expected >= 20 bytes, got ${payload.length}`,
        );
        return null;
      }
      const ack: HandshakeAckPayload = {
        hardwareGen: view.getUint8(0),
        hardwareRev: view.getUint8(1),
        protoMajor: view.getUint8(2),
        protoMinor: view.getUint8(3),
        fwMajor: view.getUint8(4),
        fwMinor: view.getUint8(5),
        fwPatch: view.getUint8(6),
        statusCode: view.getUint8(7),
        reserved: view.getUint32(8, true),
        clientNonce: view.getUint32(12, true),
        uptimeMs: view.getUint32(16, true),
      };
      return {
        encoding: 'binary',
        type: 'HANDSHAKE_ACK',
        payload: ack,
        rawText: `HANDSHAKE_ACK v${ack.protoMajor}.${ack.protoMinor} fw=${ack.fwMajor}.${ack.fwMinor}.${ack.fwPatch} status=${ack.statusCode} uptime=${ack.uptimeMs}ms`,
      };
    }

    case BinaryMessageType.MSG_SENSOR_STATUS: {
      if (payload.length < 1) {
        console.error(
          `[BinaryPayloadParser] Truncated MSG_SENSOR_STATUS: expected >= 1 byte, got ${payload.length}`,
        );
        return null;
      }
      const rawState = view.getUint8(0);
      const target = payload.length >= 2 ? view.getUint8(1) : undefined;
      const state = BINARY_SENSOR_STATE_MAP[rawState] ?? 'UNKNOWN';
      return {
        encoding: 'binary',
        type: 'SENSOR_STATUS',
        payload: { state, target },
        rawText: `SENSOR status=${state}`,
      };
    }

    case BinaryMessageType.MSG_CALIBRATION_RESULT: {
      if (payload.length < 8) {
        console.error(
          `[BinaryPayloadParser] Truncated MSG_CALIBRATION_RESULT: expected >= 8 bytes, got ${payload.length}`,
        );
        return null;
      }
      const flags = view.getUint8(0);
      const sensorId = view.getUint8(1);
      const baseline = view.getUint16(2, true);
      const noise = view.getUint16(4, true);
      const threshold = view.getUint16(6, true);
      const ignored = (flags & CALIB_FLAG_IGNORED) !== 0;
      const repeated = (flags & CALIB_FLAG_REPEATED) !== 0;

      return {
        encoding: 'binary',
        type: 'CALIBRATION_RESULT',
        payload: {
          sensorId,
          baseline,
          noise,
          threshold,
          ignored,
          repeated,
        },
        rawText: `CALIB success=${ignored ? 0 : 1} target=${sensorId} repeated=${repeated ? 'true' : 'false'} baseline=${baseline} noise=${noise} threshold=${threshold} ignored=${ignored ? 'true' : 'false'}`,
      };
    }

    case BinaryMessageType.MSG_HIT_DETECTED: {
      if (payload.length < 9) {
        console.error(
          `[BinaryPayloadParser] Truncated MSG_HIT_DETECTED: expected >= 9 bytes, got ${payload.length}`,
        );
        return null;
      }
      const hitId = view.getUint32(0, true);
      const peakValue = view.getUint16(4, true);
      const intensity = view.getUint16(6, true);
      const sensorId = view.getUint8(8);
      const timestampUs = payload.length >= 16 ? view.getUint32(12, true) : undefined;

      return {
        encoding: 'binary',
        type: 'HIT_DETECTED',
        payload: {
          hitId,
          peakValue,
          intensity,
          sensorId,
          timestampUs,
        },
        rawText: `HIT id=${hitId} target=${sensorId} peak=${peakValue} intensity=${intensity}`,
      };
    }

    case BinaryMessageType.MSG_GAME_STATE: {
      if (payload.length < 1) {
        console.error(
          `[BinaryPayloadParser] Truncated MSG_GAME_STATE: expected >= 1 byte, got ${payload.length}`,
        );
        return null;
      }
      const oldState =
        payload.length >= 2 ? (BINARY_GAME_STATE_MAP[view.getUint8(0)] ?? 'UNKNOWN') : 'UNKNOWN';
      const newState =
        payload.length >= 2
          ? (BINARY_GAME_STATE_MAP[view.getUint8(1)] ?? 'UNKNOWN')
          : (BINARY_GAME_STATE_MAP[view.getUint8(0)] ?? 'UNKNOWN');
      return {
        encoding: 'binary',
        type: 'GAME_STATE',
        payload: { state: newState, oldState },
        rawText: `STATE state=${newState}`,
      };
    }

    case BinaryMessageType.MSG_GAME_MODE: {
      if (payload.length < 5) {
        console.error(
          `[BinaryPayloadParser] Truncated MSG_GAME_MODE: expected >= 5 bytes, got ${payload.length}`,
        );
        return null;
      }
      const mode = BINARY_GAME_MODE_MAP[view.getUint8(0)] ?? 'UNKNOWN';
      const parameter = payload.length >= 8 ? view.getUint32(4, true) : view.getUint32(1, true);
      return {
        encoding: 'binary',
        type: 'GAME_MODE',
        payload: { mode, parameter },
        rawText: `MODE active=${mode} param=${parameter}`,
      };
    }

    case BinaryMessageType.MSG_SCORE: {
      if (payload.length < 4) {
        console.error(
          `[BinaryPayloadParser] Truncated MSG_SCORE: expected >= 4 bytes, got ${payload.length}`,
        );
        return null;
      }
      const score = view.getUint32(0, true);
      return {
        encoding: 'binary',
        type: 'SCORE',
        payload: { score },
        rawText: `SCORE value=${score}`,
      };
    }

    case BinaryMessageType.MSG_TIMER: {
      if (payload.length < 8) {
        console.error(
          `[BinaryPayloadParser] Truncated MSG_TIMER: expected >= 8 bytes, got ${payload.length}`,
        );
        return null;
      }
      const elapsedMs = view.getUint32(0, true);
      const remainingMs = view.getUint32(4, true);
      return {
        encoding: 'binary',
        type: 'TIMER',
        payload: { elapsedMs, remainingMs },
        rawText: `TIMER elapsed=${elapsedMs} remaining=${remainingMs}`,
      };
    }

    case BinaryMessageType.MSG_GAME_FINISHED: {
      if (payload.length < 9) {
        console.error(
          `[BinaryPayloadParser] Truncated MSG_GAME_FINISHED: expected >= 9 bytes, got ${payload.length}`,
        );
        return null;
      }
      const finalScore = view.getUint32(0, true);
      const totalTimeMs = view.getUint32(4, true);
      const reason = BINARY_END_REASON_MAP[view.getUint8(8)] ?? 'NONE';
      return {
        encoding: 'binary',
        type: 'GAME_FINISHED',
        payload: { finalScore, totalTimeMs, reason },
        rawText: `RESULT score=${finalScore} time_ms=${totalTimeMs} reason=${reason}`,
      };
    }

    case BinaryMessageType.MSG_CAPTURE_START: {
      if (payload.length < 9) {
        console.error(
          `[BinaryPayloadParser] Truncated MSG_CAPTURE_START: expected >= 9 bytes, got ${payload.length}`,
        );
        return null;
      }
      const sampleRateHz = view.getUint32(0, true);
      const preSamples = view.getUint16(4, true);
      const totalSamples = view.getUint16(6, true);
      const target = view.getUint8(8);
      return {
        encoding: 'binary',
        type: 'CAPTURE_START',
        payload: {
          type: 'CAPTURE_START',
          sampleRateHz,
          preSamples,
          totalSamples,
          target,
        },
        rawText: `CAPTURE_START rate=${sampleRateHz} pre=${preSamples} count=${totalSamples} target=${target}`,
      };
    }

    case BinaryMessageType.MSG_CAPTURE_DATA: {
      if (payload.length < 4) {
        console.error(
          `[BinaryPayloadParser] Truncated MSG_CAPTURE_DATA header: expected >= 4 bytes, got ${payload.length}`,
        );
        return null;
      }
      const offset = view.getUint16(0, true);
      const count = view.getUint16(2, true);
      const expectedByteLen = 4 + count * 2;
      if (payload.length < expectedByteLen) {
        console.error(
          `[BinaryPayloadParser] Truncated MSG_CAPTURE_DATA sample bytes: expected >= ${expectedByteLen}, got ${payload.length}`,
        );
        return null;
      }

      const byteStart = payload.byteOffset + 4;
      const values =
        byteStart % 2 === 0
          ? new Uint16Array(payload.buffer, byteStart, count)
          : new Uint16Array(payload.buffer.slice(byteStart, byteStart + count * 2));

      return {
        encoding: 'binary',
        type: 'CAPTURE_DATA',
        payload: {
          type: 'CAPTURE_DATA',
          offset,
          values,
        },
        rawText: `CAPTURE_DATA offset=${offset} count=${count}`,
      };
    }

    case BinaryMessageType.MSG_CAPTURE_END: {
      if (payload.length < 2) {
        console.error(
          `[BinaryPayloadParser] Truncated MSG_CAPTURE_END: expected >= 2 bytes, got ${payload.length}`,
        );
        return null;
      }
      const totalSamples = view.getUint16(0, true);
      return {
        encoding: 'binary',
        type: 'CAPTURE_END',
        payload: {
          type: 'CAPTURE_END',
          totalSamples,
        },
        rawText: `CAPTURE_END count=${totalSamples}`,
      };
    }

    case BinaryMessageType.MSG_ERROR: {
      if (payload.length < 7) {
        console.error(
          `[BinaryPayloadParser] Truncated MSG_ERROR header: expected >= 7 bytes, got ${payload.length}`,
        );
        return null;
      }
      const errorCode = view.getUint32(0, true);
      const compId = view.getUint8(4);
      const component = BINARY_COMPONENT_MAP[compId] ?? `COMP_${compId}`;
      const msgLength = view.getUint8(6);
      const message =
        payload.length >= 7 + msgLength
          ? new TextDecoder('utf-8').decode(payload.subarray(7, 7 + msgLength))
          : '';
      return {
        encoding: 'binary',
        type: 'ERROR',
        payload: {
          errorCode,
          component,
          message,
        },
        rawText: `ERROR code=${errorCode} comp=${component} msg=${message}`,
      };
    }

    default:
      console.warn(
        `[BinaryPayloadParser] Unknown binary message type 0x${type.toString(16).padStart(2, '0')}`,
      );
      return null;
  }
}

let outgoingSeqCounter = 0;

/**
 * Returns the next 16-bit outgoing sequence number.
 */
export function getNextSeq(): number {
  outgoingSeqCounter = (outgoingSeqCounter + 1) & 0xffff;
  return outgoingSeqCounter;
}

/**
 * Resets the outgoing sequence counter back to 0.
 */
export function resetSequenceCounter(): void {
  outgoingSeqCounter = 0;
}

/**
 * Generates a non-zero 32-bit random client nonce.
 */
export function generateRandomNonce(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] || 0x12345678;
  }
  return (Math.floor(Math.random() * 0xffffffff) + 1) >>> 0;
}

/**
 * Serializes a UnifiedProtocolCommand into a raw binary frame Uint8Array (ICD Section 5).
 */
export function serializeBinaryCommand(command: UnifiedProtocolCommand, seq?: number): Uint8Array {
  const sequenceNumber = seq ?? getNextSeq();
  switch (command.type) {
    case 'HANDSHAKE': {
      const payload = new Uint8Array(8);
      const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      const major = command.payload?.clientProtoMajor ?? PROTOCOL_VERSION;
      const minor = command.payload?.clientProtoMinor ?? 0;
      const tlv = command.payload?.tlvMode ?? true;
      const flags = tlv ? HANDSHAKE_FLAG_TLV_MODE : 0;
      const nonce = command.payload?.clientNonce ?? generateRandomNonce();
      view.setUint8(0, major);
      view.setUint8(1, minor);
      view.setUint16(2, flags, true);
      view.setUint32(4, nonce, true);
      return serializeBinaryFrame(BinaryCommandType.CMD_HANDSHAKE, payload, 0, sequenceNumber);
    }
    case 'START':
      return serializeBinaryFrame(
        BinaryCommandType.CMD_START,
        new Uint8Array(0),
        0,
        sequenceNumber,
      );
    case 'RESET':
      return serializeBinaryFrame(
        BinaryCommandType.CMD_RESET,
        new Uint8Array(0),
        0,
        sequenceNumber,
      );
    case 'CALIBRATE':
      return serializeBinaryFrame(
        BinaryCommandType.CMD_CALIBRATE,
        new Uint8Array(0),
        0,
        sequenceNumber,
      );
    case 'STATUS':
      return serializeBinaryFrame(
        BinaryCommandType.CMD_STATUS,
        new Uint8Array(0),
        0,
        sequenceNumber,
      );
    case 'SET_MODE': {
      let modeVal: number;
      if (typeof command.payload.mode === 'string') {
        modeVal = command.payload.mode === 'COUNT' ? 0 : command.payload.mode === 'TIMED' ? 1 : 2;
      } else {
        modeVal = command.payload.mode;
      }
      const payload = new Uint8Array([modeVal & 0xff]);
      return serializeBinaryFrame(BinaryCommandType.CMD_SET_MODE, payload, 0, sequenceNumber);
    }
    case 'SET_PARAMETER': {
      const sanitized = Math.max(1, Math.floor(command.payload.parameter));
      const payload = new Uint8Array(4);
      const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      view.setUint32(0, sanitized, true);
      return serializeBinaryFrame(BinaryCommandType.CMD_SET_PARAMETER, payload, 0, sequenceNumber);
    }
    case 'SET_SENSITIVITY': {
      const payload = new Uint8Array(4);
      const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      view.setFloat32(0, command.payload.noiseFactor, true);
      return serializeBinaryFrame(
        BinaryCommandType.CMD_SET_SENSITIVITY,
        payload,
        0,
        sequenceNumber,
      );
    }
    case 'CAPTURE': {
      const actionVal =
        command.payload.action === 'start' || command.payload.action === BinaryCaptureAction.START
          ? 1
          : 0;
      let targetVal = 255;
      const target = command.payload.target;
      if (typeof target === 'number' && target >= 0 && target <= 2) {
        targetVal = target;
      }
      const payload = new Uint8Array([actionVal, targetVal, 0, 0]);
      return serializeBinaryFrame(BinaryCommandType.CMD_CAPTURE, payload, 0, sequenceNumber);
    }
  }
  throw new Error('Invalid command received: ' + command.type);
}
