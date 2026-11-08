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
    expect(serializeAsciiCommand(CompanionCommands.captureStart())).toBe('CAPTURE');
    expect(serializeAsciiCommand(CompanionCommands.captureStart(1))).toBe('CAPTURE:1');
    expect(serializeAsciiCommand(CompanionCommands.captureStart('all'))).toBe('CAPTURE:all');
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
});
