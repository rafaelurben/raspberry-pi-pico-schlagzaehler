import { describe, expect, it, vi } from 'vitest';
import {
  getNextSeq,
  parseBinaryPayload,
  resetSequenceCounter,
  serializeBinaryCommand,
} from './binary-payload-parser';
import {
  BinaryCommandType,
  BinaryComponentId,
  BinaryFrame,
  BinaryGameEndReason,
  BinaryGameMode,
  BinaryGameState,
  BinaryMessageType,
  BinarySensorState,
  CALIB_FLAG_IGNORED,
  CALIB_FLAG_REPEATED,
  HANDSHAKE_FLAG_TLV_MODE,
  PROTOCOL_VERSION,
  SYNC_BYTE_0,
  SYNC_BYTE_1,
} from './binary-protocol.types';

describe('BinaryPayloadParser', () => {
  it('should parse MSG_HANDSHAKE_ACK', () => {
    const payload = new Uint8Array(20);
    const view = new DataView(payload.buffer);
    view.setUint8(0, 1); // hardwareGen
    view.setUint8(1, 2); // hardwareRev
    view.setUint8(2, 1); // protoMajor
    view.setUint8(3, 0); // protoMinor
    view.setUint8(4, 2); // fwMajor
    view.setUint8(5, 1); // fwMinor
    view.setUint8(6, 4); // fwPatch
    view.setUint8(7, 0); // reserved
    view.setUint16(8, 0x0001, true); // flags
    view.setUint16(10, 0, true); // capabilities
    view.setUint32(12, 0x12345678, true); // clientNonceEcho
    view.setUint32(16, 50000, true); // uptimeMs

    const frame: BinaryFrame = {
      type: BinaryMessageType.MSG_HANDSHAKE_ACK,
      flags: 0,
      seq: 1,
      payload,
    };

    const result = parseBinaryPayload(frame);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('HANDSHAKE_ACK');
    expect(result?.encoding).toBe('binary');
    if (result?.type === 'HANDSHAKE_ACK') {
      expect(result.payload.hardwareGen).toBe(1);
      expect(result.payload.hardwareRev).toBe(2);
      expect(result.payload.protoMajor).toBe(1);
      expect(result.payload.protoMinor).toBe(0);
      expect(result.payload.fwMajor).toBe(2);
      expect(result.payload.fwMinor).toBe(1);
      expect(result.payload.fwPatch).toBe(4);
      expect(result.payload.uptimeMs).toBe(50000);
      expect(result.payload.clientNonce).toBe(0x12345678);
    }
  });

  it('should parse MSG_GAME_STATE', () => {
    const frame: BinaryFrame = {
      type: BinaryMessageType.MSG_GAME_STATE,
      flags: 0,
      seq: 2,
      payload: new Uint8Array([BinaryGameState.RUNNING]),
    };

    const result = parseBinaryPayload(frame);
    expect(result?.type).toBe('GAME_STATE');
    if (result?.type === 'GAME_STATE') {
      expect(result.payload.state).toBe('RUNNING');
      expect(result.rawText).toBe('STATE state=RUNNING');
    }
  });

  it('should parse MSG_GAME_MODE', () => {
    const payload = new Uint8Array(5);
    const view = new DataView(payload.buffer);
    view.setUint8(0, BinaryGameMode.TIMED);
    view.setUint32(1, 60, true);

    const frame: BinaryFrame = {
      type: BinaryMessageType.MSG_GAME_MODE,
      flags: 0,
      seq: 3,
      payload,
    };

    const result = parseBinaryPayload(frame);
    expect(result?.type).toBe('GAME_MODE');
    if (result?.type === 'GAME_MODE') {
      expect(result.payload.mode).toBe('TIMED');
      expect(result.payload.parameter).toBe(60);
      expect(result.rawText).toBe('MODE active=TIMED param=60');
    }
  });

  it('should parse MSG_SCORE', () => {
    const payload = new Uint8Array(4);
    new DataView(payload.buffer).setUint32(0, 15, true);

    const frame: BinaryFrame = {
      type: BinaryMessageType.MSG_SCORE,
      flags: 0,
      seq: 4,
      payload,
    };

    const result = parseBinaryPayload(frame);
    expect(result?.type).toBe('SCORE');
    if (result?.type === 'SCORE') {
      expect(result.payload.score).toBe(15);
      expect(result.rawText).toBe('SCORE value=15');
    }
  });

  it('should parse MSG_TIMER', () => {
    const payload = new Uint8Array(8);
    const view = new DataView(payload.buffer);
    view.setUint32(0, 5000, true);
    view.setUint32(4, 25000, true);

    const frame: BinaryFrame = {
      type: BinaryMessageType.MSG_TIMER,
      flags: 0,
      seq: 5,
      payload,
    };

    const result = parseBinaryPayload(frame);
    expect(result?.type).toBe('TIMER');
    if (result?.type === 'TIMER') {
      expect(result.payload.elapsedMs).toBe(5000);
      expect(result.payload.remainingMs).toBe(25000);
      expect(result.rawText).toBe('TIMER elapsed=5000 remaining=25000');
    }
  });

  it('should parse MSG_HIT_DETECTED', () => {
    const payload = new Uint8Array(16);
    const view = new DataView(payload.buffer);
    view.setUint32(0, 7, true); // hitId
    view.setUint16(4, 2300, true); // peak
    view.setUint16(6, 450, true); // intensity
    view.setUint8(8, 2); // sensorId

    const frame: BinaryFrame = {
      type: BinaryMessageType.MSG_HIT_DETECTED,
      flags: 0,
      seq: 6,
      payload,
    };

    const result = parseBinaryPayload(frame);
    expect(result?.type).toBe('HIT_DETECTED');
    if (result?.type === 'HIT_DETECTED') {
      expect(result.payload.hitId).toBe(7);
      expect(result.payload.sensorId).toBe(2);
      expect(result.payload.peakValue).toBe(2300);
      expect(result.payload.intensity).toBe(450);
      expect(result.rawText).toBe('HIT id=7 target=2 peak=2300 intensity=450');
    }
  });

  it('should parse MSG_GAME_FINISHED', () => {
    const payload = new Uint8Array(9);
    const view = new DataView(payload.buffer);
    view.setUint32(0, 20, true);
    view.setUint32(4, 30000, true);
    view.setUint8(8, BinaryGameEndReason.TARGET_REACHED);

    const frame: BinaryFrame = {
      type: BinaryMessageType.MSG_GAME_FINISHED,
      flags: 0,
      seq: 7,
      payload,
    };

    const result = parseBinaryPayload(frame);
    expect(result?.type).toBe('GAME_FINISHED');
    if (result?.type === 'GAME_FINISHED') {
      expect(result.payload.finalScore).toBe(20);
      expect(result.payload.totalTimeMs).toBe(30000);
      expect(result.payload.reason).toBe('TARGET_REACHED');
      expect(result.rawText).toBe('RESULT score=20 time_ms=30000 reason=TARGET_REACHED');
    }
  });

  it('should parse MSG_SENSOR_STATUS', () => {
    const frame: BinaryFrame = {
      type: BinaryMessageType.MSG_SENSOR_STATUS,
      flags: 0,
      seq: 8,
      payload: new Uint8Array([BinarySensorState.ERROR]),
    };

    const result = parseBinaryPayload(frame);
    expect(result?.type).toBe('SENSOR_STATUS');
    if (result?.type === 'SENSOR_STATUS') {
      expect(result.payload.state).toBe('ERROR');
      expect(result.rawText).toBe('SENSOR status=ERROR');
    }
  });

  it('should parse MSG_CALIBRATION_RESULT with repeated and ignored flags', () => {
    const payload = new Uint8Array(8);
    const view = new DataView(payload.buffer);
    view.setUint8(0, CALIB_FLAG_REPEATED | CALIB_FLAG_IGNORED);
    view.setUint8(1, 1); // sensorId
    view.setUint16(2, 1920, true); // baseline
    view.setUint16(4, 15, true); // noise
    view.setUint16(6, 1980, true); // threshold

    const frame: BinaryFrame = {
      type: BinaryMessageType.MSG_CALIBRATION_RESULT,
      flags: 0,
      seq: 9,
      payload,
    };

    const result = parseBinaryPayload(frame);
    expect(result?.type).toBe('CALIBRATION_RESULT');
    if (result?.type === 'CALIBRATION_RESULT') {
      expect(result.payload.sensorId).toBe(1);
      expect(result.payload.baseline).toBe(1920);
      expect(result.payload.noise).toBe(15);
      expect(result.payload.threshold).toBe(1980);
      expect(result.payload.repeated).toBe(true);
      expect(result.payload.ignored).toBe(true);
      expect(result.rawText).toBe(
        'CALIB success=0 target=1 repeated=true baseline=1920 noise=15 threshold=1980 ignored=true',
      );
    }
  });

  it('should parse MSG_CAPTURE_START, MSG_CAPTURE_DATA, and MSG_CAPTURE_END', () => {
    // Start
    const startPayload = new Uint8Array(9);
    const startView = new DataView(startPayload.buffer);
    startView.setUint32(0, 10000, true);
    startView.setUint16(4, 2, true);
    startView.setUint16(6, 6, true);
    startView.setUint8(8, 0);

    const startMsg = parseBinaryPayload({
      type: BinaryMessageType.MSG_CAPTURE_START,
      flags: 0,
      seq: 10,
      payload: startPayload,
    });
    expect(startMsg?.type).toBe('CAPTURE_START');
    if (startMsg?.type === 'CAPTURE_START') {
      expect(startMsg.payload.sampleRateHz).toBe(10000);
      expect(startMsg.payload.preSamples).toBe(2);
      expect(startMsg.payload.totalSamples).toBe(6);
      expect(startMsg.payload.target).toBe(0);
    }

    // Data
    const dataBuf = new ArrayBuffer(4 + 4);
    const dataView = new DataView(dataBuf);
    dataView.setUint16(0, 0, true); // offset
    dataView.setUint16(2, 2, true); // count
    dataView.setUint16(4, 1900, true);
    dataView.setUint16(6, 2100, true);

    const dataMsg = parseBinaryPayload({
      type: BinaryMessageType.MSG_CAPTURE_DATA,
      flags: 0,
      seq: 11,
      payload: new Uint8Array(dataBuf),
    });
    expect(dataMsg?.type).toBe('CAPTURE_DATA');
    if (dataMsg?.type === 'CAPTURE_DATA') {
      expect(dataMsg.payload.offset).toBe(0);
      expect(Array.from(dataMsg.payload.values)).toEqual([1900, 2100]);
    }

    // End
    const endPayload = new Uint8Array(4);
    new DataView(endPayload.buffer).setUint16(0, 6, true);

    const endMsg = parseBinaryPayload({
      type: BinaryMessageType.MSG_CAPTURE_END,
      flags: 0,
      seq: 12,
      payload: endPayload,
    });
    expect(endMsg?.type).toBe('CAPTURE_END');
    if (endMsg?.type === 'CAPTURE_END') {
      expect(endMsg.payload.totalSamples).toBe(6);
    }
  });

  it('should parse MSG_ERROR', () => {
    const errorText = 'Sensor disconnected';
    const textBytes = new TextEncoder().encode(errorText);
    const payload = new Uint8Array(7 + textBytes.length);
    const view = new DataView(payload.buffer);
    view.setUint32(0, 0x1001, true); // errorCode
    view.setUint8(4, BinaryComponentId.ADC); // component
    view.setUint8(5, 0); // flags
    view.setUint8(6, textBytes.length);
    payload.set(textBytes, 7);

    const frame: BinaryFrame = {
      type: BinaryMessageType.MSG_ERROR,
      flags: 0,
      seq: 13,
      payload,
    };

    const result = parseBinaryPayload(frame);
    expect(result?.type).toBe('ERROR');
    if (result?.type === 'ERROR') {
      expect(result.payload.errorCode).toBe(0x1001);
      expect(result.payload.component).toBe('ADC');
      expect(result.payload.message).toBe(errorText);
    }
  });

  it('should reject truncated payloads and log console.error', () => {
    const spy = vi.spyOn(console, 'error').mockReturnValue();

    // MSG_SCORE requires 4 bytes, pass only 2
    const frame: BinaryFrame = {
      type: BinaryMessageType.MSG_SCORE,
      flags: 0,
      seq: 14,
      payload: new Uint8Array([1, 2]),
    };

    const result = parseBinaryPayload(frame);
    expect(result).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('should reject unknown message types and log console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockReturnValue();

    const frame: BinaryFrame = {
      type: 0xfe,
      flags: 0,
      seq: 15,
      payload: new Uint8Array(0),
    };

    const result = parseBinaryPayload(frame);
    expect(result).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  describe('sequence counter', () => {
    it('should increment sequence numbers and allow reset', () => {
      resetSequenceCounter();
      expect(getNextSeq()).toBe(1);
      expect(getNextSeq()).toBe(2);
      resetSequenceCounter();
      expect(getNextSeq()).toBe(1);
    });
  });

  describe('serializeBinaryCommand', () => {
    it('should serialize CMD_HANDSHAKE packet', () => {
      const packet = serializeBinaryCommand(
        {
          type: 'HANDSHAKE',
          payload: {
            clientNonce: 0xaabbccdd,
            clientProtoMajor: 1,
            clientProtoMinor: 0,
            tlvMode: true,
          },
        },
        7,
      );

      expect(packet[0]).toBe(SYNC_BYTE_0);
      expect(packet[1]).toBe(SYNC_BYTE_1);
      expect(packet[2] & 0x0f).toBe(PROTOCOL_VERSION);
      expect(packet[3]).toBe(BinaryCommandType.CMD_HANDSHAKE);
      expect(packet[4]).toBe(8); // payload length
      expect(packet[5]).toBe(0);

      const view = new DataView(packet.buffer, packet.byteOffset + 8, 8);
      expect(view.getUint8(0)).toBe(1); // major
      expect(view.getUint8(1)).toBe(0); // minor
      expect(view.getUint16(2, true)).toBe(HANDSHAKE_FLAG_TLV_MODE);
      expect(view.getUint32(4, true)).toBe(0xaabbccdd);
    });

    it('should serialize empty commands (START, RESET, CALIBRATE, STATUS)', () => {
      const start = serializeBinaryCommand({ type: 'START' }, 1);
      expect(start[3]).toBe(BinaryCommandType.CMD_START);
      expect(start[4]).toBe(0);

      const reset = serializeBinaryCommand({ type: 'RESET' }, 2);
      expect(reset[3]).toBe(BinaryCommandType.CMD_RESET);
      expect(reset[4]).toBe(0);

      const calib = serializeBinaryCommand({ type: 'CALIBRATE' }, 3);
      expect(calib[3]).toBe(BinaryCommandType.CMD_CALIBRATE);
      expect(calib[4]).toBe(0);

      const status = serializeBinaryCommand({ type: 'STATUS' }, 4);
      expect(status[3]).toBe(BinaryCommandType.CMD_STATUS);
      expect(status[4]).toBe(0);
    });

    it('should serialize CMD_SET_MODE', () => {
      const countPacket = serializeBinaryCommand(
        { type: 'SET_MODE', payload: { mode: 'COUNT' } },
        10,
      );
      expect(countPacket[3]).toBe(BinaryCommandType.CMD_SET_MODE);
      expect(countPacket[8]).toBe(0);

      const timedPacket = serializeBinaryCommand(
        { type: 'SET_MODE', payload: { mode: 'TIMED' } },
        11,
      );
      expect(timedPacket[8]).toBe(1);

      const racePacket = serializeBinaryCommand(
        { type: 'SET_MODE', payload: { mode: 'RACE' } },
        12,
      );
      expect(racePacket[8]).toBe(2);
    });

    it('should serialize CMD_SET_PARAMETER', () => {
      const packet = serializeBinaryCommand(
        { type: 'SET_PARAMETER', payload: { parameter: 120 } },
        15,
      );
      expect(packet[3]).toBe(BinaryCommandType.CMD_SET_PARAMETER);
      const view = new DataView(packet.buffer, packet.byteOffset + 8, 4);
      expect(view.getUint32(0, true)).toBe(120);
    });

    it('should serialize CMD_SET_SENSITIVITY', () => {
      const packet = serializeBinaryCommand(
        { type: 'SET_SENSITIVITY', payload: { noiseFactor: 3.5 } },
        20,
      );
      expect(packet[3]).toBe(BinaryCommandType.CMD_SET_SENSITIVITY);
      const view = new DataView(packet.buffer, packet.byteOffset + 8, 4);
      expect(view.getFloat32(0, true)).toBeCloseTo(3.5, 5);
    });

    it('should serialize CMD_CAPTURE', () => {
      const startAll = serializeBinaryCommand(
        { type: 'CAPTURE', payload: { action: 'start', target: 'all' } },
        25,
      );
      expect(startAll[3]).toBe(BinaryCommandType.CMD_CAPTURE);
      expect(startAll[8]).toBe(1); // action=start
      expect(startAll[9]).toBe(255); // target=all

      const startSensor1 = serializeBinaryCommand(
        { type: 'CAPTURE', payload: { action: 'start', target: 1 } },
        26,
      );
      expect(startSensor1[8]).toBe(1);
      expect(startSensor1[9]).toBe(1);

      const stop = serializeBinaryCommand({ type: 'CAPTURE', payload: { action: 'stop' } }, 27);
      expect(stop[8]).toBe(0);
    });
  });
});
