import { describe, expect, it } from 'vitest';
import { DeviceState } from '../models/device.model';
import { serializeAsciiCommand } from './ascii/ascii-payload-parser';
import { applyUnifiedMessageToDeviceState, CompanionCommands } from './companion-protocol';

describe('companion-protocol', () => {
  it('should generate UnifiedProtocolCommand objects via CompanionCommands', () => {
    expect(CompanionCommands.start()).toEqual({ type: 'START' });
    expect(CompanionCommands.reset()).toEqual({ type: 'RESET' });
    expect(CompanionCommands.calibrate()).toEqual({ type: 'CALIBRATE' });
    expect(CompanionCommands.status()).toEqual({ type: 'STATUS' });
    expect(CompanionCommands.setMode('COUNT')).toEqual({
      type: 'SET_MODE',
      payload: { mode: 'COUNT' },
    });
    expect(CompanionCommands.setMode('TIMED')).toEqual({
      type: 'SET_MODE',
      payload: { mode: 'TIMED' },
    });
    expect(CompanionCommands.setMode('RACE')).toEqual({
      type: 'SET_MODE',
      payload: { mode: 'RACE' },
    });
    expect(CompanionCommands.setParameter(30)).toEqual({
      type: 'SET_PARAMETER',
      payload: { parameter: 30 },
    });
    expect(CompanionCommands.setSensitivity(1.5)).toEqual({
      type: 'SET_SENSITIVITY',
      payload: { noiseFactor: 1.5 },
    });
    expect(CompanionCommands.captureStart()).toEqual({
      type: 'CAPTURE',
      payload: { action: 'start', target: undefined },
    });
    expect(CompanionCommands.captureStart(1)).toEqual({
      type: 'CAPTURE',
      payload: { action: 'start', target: 1 },
    });
    expect(CompanionCommands.captureStart('all')).toEqual({
      type: 'CAPTURE',
      payload: { action: 'start', target: 'all' },
    });
    expect(CompanionCommands.captureStop()).toEqual({
      type: 'CAPTURE',
      payload: { action: 'stop' },
    });
    expect(CompanionCommands.handshake({ tlvMode: true })).toEqual({
      type: 'HANDSHAKE',
      payload: { tlvMode: true },
    });
  });

  it('should serialize UnifiedProtocolCommand to ASCII via serializeAsciiCommand', () => {
    expect(serializeAsciiCommand(CompanionCommands.start())).toBe('START');
    expect(serializeAsciiCommand(CompanionCommands.reset())).toBe('RESET');
    expect(serializeAsciiCommand(CompanionCommands.calibrate())).toBe('CALIB');
    expect(serializeAsciiCommand(CompanionCommands.status())).toBe('STATUS');
    expect(serializeAsciiCommand(CompanionCommands.setMode('COUNT'))).toBe('MODE:COUNT');
    expect(serializeAsciiCommand(CompanionCommands.setMode('TIMED'))).toBe('MODE:TIMED');
    expect(serializeAsciiCommand(CompanionCommands.setMode('RACE'))).toBe('MODE:RACE');
    expect(serializeAsciiCommand(CompanionCommands.setParameter(30))).toBe('PARAM:30');
    expect(serializeAsciiCommand(CompanionCommands.setSensitivity(1.5))).toBe('SENS:1.5');
    expect(serializeAsciiCommand(CompanionCommands.captureStart())).toBe('CAPTURE:START');
    expect(serializeAsciiCommand(CompanionCommands.captureStart(1))).toBe('CAPTURE:START:1');
    expect(serializeAsciiCommand(CompanionCommands.captureStart('all'))).toBe('CAPTURE:START');
    expect(serializeAsciiCommand(CompanionCommands.captureTrigger())).toBe('CAPTURE:TRIGGER');
    expect(serializeAsciiCommand(CompanionCommands.captureTrigger(2))).toBe('CAPTURE:TRIGGER:2');
    expect(serializeAsciiCommand(CompanionCommands.captureStop())).toBe('CAPTURE:STOP');
  });

  it('should update DeviceState on BOOT message', () => {
    const initialState = new DeviceState({
      connectionState: 'connected',
      gameState: 'RUNNING',
      score: 5,
      protoMajor: 1,
      protoMinor: 0,
      isReady: true,
    });

    const bootSuccess = applyUnifiedMessageToDeviceState(initialState, {
      encoding: 'ascii',
      type: 'BOOT',
      payload: { success: true, message: 'Ready' },
      rawText: 'BOOT success=1 msg=Ready',
    });

    expect(bootSuccess.gameState).toBe('BOOT');
    expect(bootSuccess.sensorState).toBe('INIT');
    expect(bootSuccess.score).toBe(0);
    expect(bootSuccess.isReady).toBe(false);
    expect(bootSuccess.protoMajor).toBeUndefined();

    const bootFail = applyUnifiedMessageToDeviceState(initialState, {
      encoding: 'ascii',
      type: 'BOOT',
      payload: { success: false, message: 'Failed' },
      rawText: 'BOOT success=0 msg=Failed',
    });

    expect(bootFail.gameState).toBe('BOOT');
    expect(bootFail.sensorState).toBe('ERROR');
  });

  it('should update sensorState on SENSOR_STATUS with or without target', () => {
    const initialState = new DeviceState({
      connectionState: 'connected',
      gameState: 'READY',
      sensorState: 'INIT',
    });

    const withoutTarget = applyUnifiedMessageToDeviceState(initialState, {
      encoding: 'ascii',
      type: 'SENSOR_STATUS',
      payload: { state: 'ARMED', target: undefined },
      rawText: 'SENSOR status=ARMED',
    });
    expect(withoutTarget.sensorState).toBe('ARMED');
    expect(withoutTarget.isReady).toBe(true);

    const withTarget = applyUnifiedMessageToDeviceState(initialState, {
      encoding: 'binary',
      type: 'SENSOR_STATUS',
      payload: { state: 'CAPTURE_ARMED', target: 255 },
      rawText: 'SENSOR status=CAPTURE_ARMED',
    });
    expect(withTarget.sensorState).toBe('CAPTURE_ARMED');
  });

  it('should not set sensorState to ERROR when a sensor is ignored in CALIBRATION_RESULT', () => {
    const initialState = new DeviceState({
      connectionState: 'connected',
      gameState: 'READY',
      sensorState: 'ARMED',
      isReady: true,
    });

    // Sensor 1 ignored (e.g. disconnected)
    const ignoredResult = applyUnifiedMessageToDeviceState(initialState, {
      encoding: 'ascii',
      type: 'CALIBRATION_RESULT',
      payload: {
        sensorId: 1,
        baseline: 0,
        noise: 0,
        threshold: 0,
        ignored: true,
        repeated: false,
      },
      rawText:
        'CALIB success=1 target=1 repeated=false baseline=0 noise=0 threshold=0 ignored=true',
    });

    // Should remain ARMED and NOT become ERROR
    expect(ignoredResult.sensorState).toBe('ARMED');
    expect(ignoredResult.isReady).toBe(true);
  });

  it('should transition connectionState on HANDSHAKE_ACK (connected on success, error on failure)', () => {
    const connectingState = new DeviceState({
      connectionState: 'connecting',
      gameState: 'UNKNOWN',
      sensorState: 'UNKNOWN',
    });

    const successAck = applyUnifiedMessageToDeviceState(connectingState, {
      encoding: 'binary',
      type: 'HANDSHAKE_ACK',
      payload: {
        hardwareGen: 1,
        hardwareRev: 2,
        protoMajor: 1,
        protoMinor: 0,
        fwMajor: 1,
        fwMinor: 2,
        fwPatch: 3,
        statusCode: 0,
        reserved: 0,
        clientNonce: 0,
        uptimeMs: 12345,
      },
      rawText: 'HANDSHAKE_ACK v1.0 fw=1.2.3 status=0 uptime=12345ms',
    });

    expect(successAck.connectionState).toBe('connected');
    expect(successAck.hardwareGen).toBe(1);
    expect(successAck.hardwareRev).toBe(2);
    expect(successAck.protoMajor).toBe(1);
    expect(successAck.fwVersion).toBe('1.2.3');
    expect(successAck.uptimeMs).toBe(12345);

    const errorAck = applyUnifiedMessageToDeviceState(connectingState, {
      encoding: 'binary',
      type: 'HANDSHAKE_ACK',
      payload: {
        hardwareGen: 1,
        hardwareRev: 1,
        protoMajor: 1,
        protoMinor: 0,
        fwMajor: 1,
        fwMinor: 0,
        fwPatch: 0,
        statusCode: 1, // ERR_VERSION_MISMATCH
        reserved: 0,
        clientNonce: 0,
        uptimeMs: 100,
      },
      rawText: 'HANDSHAKE_ACK status=1',
    });

    expect(errorAck.connectionState).toBe('error');
    expect(errorAck.isReady).toBe(false);
  });
});
