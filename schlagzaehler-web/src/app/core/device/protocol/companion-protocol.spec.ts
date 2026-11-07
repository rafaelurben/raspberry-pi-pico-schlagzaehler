import { describe, expect, it } from 'vitest';
import { DeviceState } from '../models/device.model';
import {
  CompanionCommands,
  parseCaptureMessage,
  parseCompanionMessage,
} from './companion-protocol';

describe('companion-protocol', () => {
  it('should format companion commands properly', () => {
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

  it('should parse STATE messages and update readiness and timer start timestamp', () => {
    const initial = new DeviceState({
      connectionState: 'connected',
      mode: 'TIMED',
      parameter: 30,
    });

    const ready = parseCompanionMessage('STATE old=BOOT new=READY', initial, 1000);
    expect(ready.gameState).toBe('READY');
    expect(ready.isReady).toBe(true);
    expect(ready.remainingMs).toBe(30000);
    expect(ready.lastTimerUpdatedAt).toBeNull();

    const running = parseCompanionMessage('STATE old=READY new=RUNNING', ready, 2500);
    expect(running.gameState).toBe('RUNNING');
    expect(running.isReady).toBe(true);
    expect(running.elapsedMs).toBe(0);
    expect(running.remainingMs).toBe(30000);
    expect(running.lastTimerUpdatedAt).toBe(2500);
  });

  it('should parse MODE, SCORE, TIMER, and RESULT messages', () => {
    let state = new DeviceState({
      connectionState: 'connected',
      gameState: 'RUNNING',
    });

    state = parseCompanionMessage('MODE active=RACE param=50', state, 1000);
    expect(state.mode).toBe('RACE');
    expect(state.parameter).toBe(50);

    state = parseCompanionMessage('SCORE value=12', state, 1100);
    expect(state.score).toBe(12);

    state = parseCompanionMessage('TIMER elapsed=4250 remaining=0', state, 1250);
    expect(state.elapsedMs).toBe(4250);
    expect(state.remainingMs).toBe(0);
    expect(state.lastTimerUpdatedAt).toBe(1250);

    state = parseCompanionMessage(
      'RESULT score=50 time_ms=15230 reason=TARGET_REACHED',
      state,
      2000,
    );
    expect(state.gameState).toBe('FINISHED');
    expect(state.score).toBe(50);
    expect(state.elapsedMs).toBe(15230);
    expect(state.endReason).toBe('TARGET_REACHED');
    expect(state.lastTimerUpdatedAt).toBeNull();
  });

  it('should parse SENSOR and CALIB messages', () => {
    let state = new DeviceState({ connectionState: 'connected' });

    state = parseCompanionMessage('SENSOR status=CALIBRATING', state);
    expect(state.sensorState).toBe('CALIBRATING');
    expect(state.isReady).toBe(false);

    state = parseCompanionMessage('CALIB success=1 target=1 baseline=2000 noise=12 threshold=2050', state);
    expect(state.sensorState).toBe('ARMED');
    expect(state.isReady).toBe(true);
  });

  it('should parse CAPTURE messages with target', () => {
    const start = parseCaptureMessage(
      'CAPTURE_START rate=10000 pre=999 count=21000 target=3 baseline=2000 noise=12 threshold=2050',
    );
    expect(start).not.toBeNull();
    expect(start?.type).toBe('CAPTURE_START');
    if (start?.type === 'CAPTURE_START') {
      expect(start.target).toBe(3);
      expect(start.preSamples).toBe(999);
      expect(start.totalSamples).toBe(21000);
    }
  });
});
