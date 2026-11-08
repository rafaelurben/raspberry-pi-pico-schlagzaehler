import { describe, expect, it } from 'vitest';
import { DeviceState } from '../models/device.model';
import {
  BinaryCommandType,
  BinaryFrame,
  BinaryMessageType,
  CALIB_FLAG_REPEATED,
  HANDSHAKE_FLAG_TLV_MODE,
  PROTOCOL_VERSION,
  SYNC_BYTE_0,
  SYNC_BYTE_1,
} from './binary-protocol.types';
import {
  BinaryCompanionCommands,
  CompanionCommands,
  formatBinaryEventForLog,
  parseBinaryCalibration,
  parseBinaryCaptureMessage,
  parseBinaryCompanionMessage,
  parseBinaryMetadata,
  parseCalibrationMessage,
  parseCaptureMessage,
  parseCompanionMessage,
} from './companion-protocol';

describe('companion-protocol', () => {
  it('should format ASCII companion commands properly', () => {
    expect(CompanionCommands.start()).toBe('START');
    expect(CompanionCommands.reset()).toBe('RESET');
    expect(CompanionCommands.calibrate()).toBe('CALIB');
    expect(CompanionCommands.status()).toBe('STATUS');
    expect(CompanionCommands.setMode('COUNT')).toBe('MODE:COUNT');
    expect(CompanionCommands.setMode('TIMED')).toBe('MODE:TIMED');
    expect(CompanionCommands.setMode('RACE')).toBe('MODE:RACE');
    expect(CompanionCommands.setParameter(30)).toBe('PARAM:30');
    expect(CompanionCommands.setSensitivity(1.5)).toBe('SENS:1.5');
    expect(CompanionCommands.captureStart()).toBe('CAPTURE');
    expect(CompanionCommands.captureStart(1)).toBe('CAPTURE:1');
    expect(CompanionCommands.captureStart('all')).toBe('CAPTURE:all');
    expect(CompanionCommands.captureStop()).toBe('CAPTURE:STOP');
  });

  describe('BinaryCompanionCommands', () => {
    it('should build CMD_HANDSHAKE packet with TLV_MODE flag and client nonce', () => {
      const packet = BinaryCompanionCommands.handshake({
        clientNonce: 0x12345678,
        clientProtoMajor: 1,
        clientProtoMinor: 0,
        tlvMode: true,
        seq: 5,
      });

      expect(packet[0]).toBe(SYNC_BYTE_0);
      expect(packet[1]).toBe(SYNC_BYTE_1);
      expect(packet[2] & 0x0f).toBe(PROTOCOL_VERSION);
      expect(packet[3]).toBe(BinaryCommandType.CMD_HANDSHAKE);

      // Payload length = 8
      expect(packet[4]).toBe(8);
      expect(packet[5]).toBe(0);

      // Sequence ID = 5
      expect(packet[6]).toBe(5);
      expect(packet[7]).toBe(0);

      // Payload: major=1, minor=0, flags=TLV_MODE (1), nonce=0x12345678
      const payloadView = new DataView(packet.buffer, packet.byteOffset + 8, 8);
      expect(payloadView.getUint8(0)).toBe(1);
      expect(payloadView.getUint8(1)).toBe(0);
      expect(payloadView.getUint16(2, true) & HANDSHAKE_FLAG_TLV_MODE).toBe(1);
      expect(payloadView.getUint32(4, true)).toBe(0x12345678);
    });

    it('should build CMD_START, CMD_RESET, CMD_CALIBRATE, and CMD_STATUS packets', () => {
      const start = BinaryCompanionCommands.start(1);
      expect(start[3]).toBe(BinaryCommandType.CMD_START);
      expect(start[4]).toBe(0); // 0-byte payload

      const reset = BinaryCompanionCommands.reset(2);
      expect(reset[3]).toBe(BinaryCommandType.CMD_RESET);
      expect(reset[4]).toBe(0);

      const calib = BinaryCompanionCommands.calibrate(3);
      expect(calib[3]).toBe(BinaryCommandType.CMD_CALIBRATE);
      expect(calib[4]).toBe(0);

      const status = BinaryCompanionCommands.status(4);
      expect(status[3]).toBe(BinaryCommandType.CMD_STATUS);
      expect(status[4]).toBe(0);
    });

    it('should build CMD_SET_MODE packet', () => {
      const modeTimed = BinaryCompanionCommands.setMode('TIMED', 10);
      expect(modeTimed[3]).toBe(BinaryCommandType.CMD_SET_MODE);
      expect(modeTimed[4]).toBe(1); // 1-byte payload
      expect(modeTimed[8]).toBe(1); // 1 = TIMED

      const modeRace = BinaryCompanionCommands.setMode('RACE', 11);
      expect(modeRace[8]).toBe(2); // 2 = RACE
    });

    it('should build CMD_SET_PARAMETER packet', () => {
      const paramPacket = BinaryCompanionCommands.setParameter(45, 12);
      expect(paramPacket[3]).toBe(BinaryCommandType.CMD_SET_PARAMETER);
      expect(paramPacket[4]).toBe(4);
      const view = new DataView(paramPacket.buffer, paramPacket.byteOffset + 8, 4);
      expect(view.getUint32(0, true)).toBe(45);
    });

    it('should build CMD_SET_SENSITIVITY packet with IEEE float', () => {
      const sensPacket = BinaryCompanionCommands.setSensitivity(2.75, 13);
      expect(sensPacket[3]).toBe(BinaryCommandType.CMD_SET_SENSITIVITY);
      expect(sensPacket[4]).toBe(4);
      const view = new DataView(sensPacket.buffer, sensPacket.byteOffset + 8, 4);
      expect(view.getFloat32(0, true)).toBeCloseTo(2.75);
    });

    it('should build CMD_CAPTURE packets for start and stop with target channel', () => {
      const capStart = BinaryCompanionCommands.captureStart(1, 14);
      expect(capStart[3]).toBe(BinaryCommandType.CMD_CAPTURE);
      expect(capStart[8]).toBe(1); // action = start (1)
      expect(capStart[9]).toBe(1); // target = 1

      const capStop = BinaryCompanionCommands.captureStop(15);
      expect(capStop[3]).toBe(BinaryCommandType.CMD_CAPTURE);
      expect(capStop[8]).toBe(0); // action = stop (0)
    });
  });

  describe('Binary Telemetry Deserialization', () => {
    it('should parse MSG_HANDSHAKE_ACK and update hardware/version metadata in device state', () => {
      const payload = new Uint8Array(20);
      const view = new DataView(payload.buffer);
      view.setUint8(0, 1); // hardwareGen
      view.setUint8(1, 2); // hardwareRev
      view.setUint8(2, 1); // protoMajor
      view.setUint8(3, 0); // protoMinor
      view.setUint8(4, 2); // fwMajor
      view.setUint8(5, 3); // fwMinor
      view.setUint8(6, 4); // fwPatch
      view.setUint8(7, 0); // status OK
      view.setUint32(8, 0, true); // reserved
      view.setUint32(12, 0x12345678, true); // client_nonce
      view.setUint32(16, 54321, true); // uptime_ms

      const frame: BinaryFrame = {
        type: BinaryMessageType.MSG_HANDSHAKE_ACK,
        flags: 0,
        seq: 1,
        payload,
      };

      const initial = new DeviceState({ connectionState: 'connected' });
      const state = parseBinaryCompanionMessage(frame, initial);

      expect(state.hardwareGen).toBe(1);
      expect(state.hardwareRev).toBe(2);
      expect(state.protoMajor).toBe(1);
      expect(state.protoMinor).toBe(0);
      expect(state.fwVersion).toBe('2.3.4');
      expect(state.uptimeMs).toBe(54321);

      const metadata = parseBinaryMetadata(frame);
      expect(metadata?.fwVersion).toBe('2.3.4');
      expect(metadata?.uptimeMs).toBe(54321);
    });

    it('should parse MSG_SENSOR_STATUS and update sensorState and isReady', () => {
      const payload = new Uint8Array([2, 3]); // 2 = ARMED, target = 3 (ALL)
      const frame: BinaryFrame = {
        type: BinaryMessageType.MSG_SENSOR_STATUS,
        flags: 0,
        seq: 2,
        payload,
      };

      const initial = new DeviceState({ connectionState: 'connected', gameState: 'READY' });
      const state = parseBinaryCompanionMessage(frame, initial);
      expect(state.sensorState).toBe('ARMED');
      expect(state.isReady).toBe(true);
    });

    it('should parse MSG_CALIBRATION_RESULT inspecting repeated flag', () => {
      const payload = new Uint8Array(8);
      const view = new DataView(payload.buffer);
      // flags: repeated = false, ignored = false
      view.setUint8(0, 0);
      view.setUint8(1, 1); // sensorId 1
      view.setUint16(2, 1950, true); // baseline
      view.setUint16(4, 15, true); // noise
      view.setUint16(6, 2020, true); // threshold

      const frameFresh: BinaryFrame = {
        type: BinaryMessageType.MSG_CALIBRATION_RESULT,
        flags: 0,
        seq: 3,
        payload,
      };

      const initial = new DeviceState({ connectionState: 'connected', sensorState: 'CALIBRATING' });
      const stateFresh = parseBinaryCompanionMessage(frameFresh, initial);
      expect(stateFresh.sensorState).toBe('ARMED');

      const calib = parseBinaryCalibration(frameFresh);
      expect(calib?.sensorId).toBe(1);
      expect(calib?.baseline).toBe(1950);
      expect(calib?.noise).toBe(15);
      expect(calib?.threshold).toBe(2020);
      expect(calib?.repeated).toBe(false);

      // Now set repeated = true (re-emitted before capture streaming)
      view.setUint8(0, CALIB_FLAG_REPEATED);
      const frameRepeated: BinaryFrame = {
        type: BinaryMessageType.MSG_CALIBRATION_RESULT,
        flags: 0,
        seq: 4,
        payload,
      };

      const capturingState = new DeviceState({
        connectionState: 'connected',
        sensorState: 'CAPTURING',
      });
      const statePreserved = parseBinaryCompanionMessage(frameRepeated, capturingState);
      // sensorState must NOT be overwritten to ARMED
      expect(statePreserved.sensorState).toBe('CAPTURING');
    });

    it('should parse MSG_GAME_STATE, MSG_GAME_MODE, MSG_SCORE, MSG_TIMER, MSG_GAME_FINISHED', () => {
      let state = new DeviceState({ connectionState: 'connected', gameState: 'READY' });

      // MSG_GAME_STATE: READY -> RUNNING
      state = parseBinaryCompanionMessage(
        {
          type: BinaryMessageType.MSG_GAME_STATE,
          flags: 0,
          seq: 1,
          payload: new Uint8Array([2, 3]), // old=READY(2), new=RUNNING(3)
        },
        state,
        5000,
      );
      expect(state.gameState).toBe('RUNNING');
      expect(state.lastTimerUpdatedAt).toBe(5000);

      // MSG_GAME_MODE: TIMED(1), param=30
      const modePayload = new Uint8Array(8);
      const modeView = new DataView(modePayload.buffer);
      modeView.setUint8(0, 1);
      modeView.setUint32(4, 30, true);
      state = parseBinaryCompanionMessage(
        {
          type: BinaryMessageType.MSG_GAME_MODE,
          flags: 0,
          seq: 2,
          payload: modePayload,
        },
        state,
      );
      expect(state.mode).toBe('TIMED');
      expect(state.parameter).toBe(30);

      // MSG_SCORE: 18
      const scorePayload = new Uint8Array(4);
      new DataView(scorePayload.buffer).setUint32(0, 18, true);
      state = parseBinaryCompanionMessage(
        {
          type: BinaryMessageType.MSG_SCORE,
          flags: 0,
          seq: 3,
          payload: scorePayload,
        },
        state,
      );
      expect(state.score).toBe(18);

      // MSG_TIMER: elapsed=10000, remaining=20000
      const timerPayload = new Uint8Array(8);
      const timerView = new DataView(timerPayload.buffer);
      timerView.setUint32(0, 10000, true);
      timerView.setUint32(4, 20000, true);
      state = parseBinaryCompanionMessage(
        {
          type: BinaryMessageType.MSG_TIMER,
          flags: 0,
          seq: 4,
          payload: timerPayload,
        },
        state,
        15000,
      );
      expect(state.elapsedMs).toBe(10000);
      expect(state.remainingMs).toBe(20000);
      expect(state.lastTimerUpdatedAt).toBe(15000);

      // MSG_GAME_FINISHED: score=25, time_ms=30000, reason=TIME_LIMIT(1)
      const finPayload = new Uint8Array(12);
      const finView = new DataView(finPayload.buffer);
      finView.setUint32(0, 25, true);
      finView.setUint32(4, 30000, true);
      finView.setUint8(8, 1);
      state = parseBinaryCompanionMessage(
        {
          type: BinaryMessageType.MSG_GAME_FINISHED,
          flags: 0,
          seq: 5,
          payload: finPayload,
        },
        state,
      );
      expect(state.gameState).toBe('FINISHED');
      expect(state.score).toBe(25);
      expect(state.elapsedMs).toBe(30000);
      expect(state.endReason).toBe('TIME_LIMIT');
      expect(state.remainingMs).toBe(0);
    });

    it('should parse MSG_CAPTURE_START without baseline/noise/threshold and resolve from cache', () => {
      const payload = new Uint8Array(9);
      const view = new DataView(payload.buffer);
      view.setUint32(0, 10000, true); // sampleRateHz
      view.setUint16(4, 1000, true); // preSamples
      view.setUint16(6, 21000, true); // totalSamples
      view.setUint8(8, 2); // targetChannel 2

      const frame: BinaryFrame = {
        type: BinaryMessageType.MSG_CAPTURE_START,
        flags: 0,
        seq: 1,
        payload,
      };

      const msg = parseBinaryCaptureMessage(frame);

      expect(msg?.type).toBe('CAPTURE_START');
      if (msg?.type === 'CAPTURE_START') {
        expect(msg.sampleRateHz).toBe(10000);
        expect(msg.preSamples).toBe(1000);
        expect(msg.totalSamples).toBe(21000);
        expect(msg.target).toBe(2);
      }
    });

    it('should parse MSG_CAPTURE_DATA wrapping raw uint16 samples directly via zero-copy Uint16Array', () => {
      // 4 header bytes (offset=100, count=4) + 4 uint16 samples (8 bytes)
      const count = 4;
      const buffer = new ArrayBuffer(4 + count * 2);
      const u8 = new Uint8Array(buffer);
      const view = new DataView(buffer);
      view.setUint16(0, 100, true); // offset
      view.setUint16(2, count, true); // count
      view.setUint16(4, 1850, true); // sample 0
      view.setUint16(6, 1855, true); // sample 1
      view.setUint16(8, 2400, true); // sample 2
      view.setUint16(10, 1920, true); // sample 3

      const frame: BinaryFrame = {
        type: BinaryMessageType.MSG_CAPTURE_DATA,
        flags: 0,
        seq: 2,
        payload: u8,
      };

      const msg = parseBinaryCaptureMessage(frame);
      expect(msg?.type).toBe('CAPTURE_DATA');
      if (msg?.type === 'CAPTURE_DATA') {
        expect(msg.offset).toBe(100);
        expect(msg.values).toBeInstanceOf(Uint16Array);
        expect(Array.from(msg.values)).toEqual([1850, 1855, 2400, 1920]);
      }
    });

    it('should parse MSG_CAPTURE_END', () => {
      const payload = new Uint8Array(4);
      new DataView(payload.buffer).setUint16(0, 21000, true);

      const frame: BinaryFrame = {
        type: BinaryMessageType.MSG_CAPTURE_END,
        flags: 0,
        seq: 3,
        payload,
      };

      const msg = parseBinaryCaptureMessage(frame);
      expect(msg?.type).toBe('CAPTURE_END');
      if (msg?.type === 'CAPTURE_END') {
        expect(msg.totalSamples).toBe(21000);
      }
    });
  });

  describe('ASCII parsing updates', () => {
    it('should parse ASCII CALIB with repeated=<true|false>', () => {
      const parsedFresh = parseCalibrationMessage(
        'CALIB success=1 target=0 repeated=false baseline=1850 noise=12 threshold=1910 ignored=false',
      );
      expect(parsedFresh).toEqual({
        sensorId: 0,
        baseline: 1850,
        noise: 12,
        threshold: 1910,
        ignored: false,
        repeated: false,
      });

      const parsedRepeated = parseCalibrationMessage(
        'CALIB success=1 target=1 repeated=true baseline=1920 noise=8 threshold=1980 ignored=false',
      );
      expect(parsedRepeated?.repeated).toBe(true);
      expect(parsedRepeated?.sensorId).toBe(1);

      // In parseCompanionMessage, repeated CALIB preserves sensorState
      const initial = new DeviceState({ connectionState: 'connected', sensorState: 'CAPTURING' });
      const next = parseCompanionMessage(
        'CALIB success=1 target=1 repeated=true baseline=1920 noise=8 threshold=1980 ignored=false',
        initial,
      );
      expect(next.sensorState).toBe('CAPTURING');
    });

    it('should parse ASCII CAPTURE_START without baseline/noise/threshold', () => {
      const start = parseCaptureMessage('CAPTURE_START rate=10000 pre=1000 count=21000 target=3');
      expect(start).not.toBeNull();
      expect(start?.type).toBe('CAPTURE_START');
      if (start?.type === 'CAPTURE_START') {
        expect(start.sampleRateHz).toBe(10000);
        expect(start.preSamples).toBe(1000);
        expect(start.totalSamples).toBe(21000);
        expect(start.target).toBe(3);
      }
    });

    it('should format binary events into human-readable strings for the event log', () => {
      const scorePayload = new Uint8Array(4);
      new DataView(scorePayload.buffer).setUint32(0, 99, true);
      const scoreFrame: BinaryFrame = {
        type: BinaryMessageType.MSG_SCORE,
        flags: 0,
        seq: 1,
        payload: scorePayload,
      };
      expect(formatBinaryEventForLog(scoreFrame)).toBe('SCORE value=99');

      const statusFrame: BinaryFrame = {
        type: BinaryMessageType.MSG_SENSOR_STATUS,
        flags: 0,
        seq: 2,
        payload: new Uint8Array([2, 0]),
      };
      expect(formatBinaryEventForLog(statusFrame)).toBe('SENSOR status=ARMED');
    });
  });
});
