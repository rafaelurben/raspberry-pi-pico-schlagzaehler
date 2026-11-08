import { describe, expect, it, vi } from 'vitest';
import { parseAsciiPayload, serializeAsciiCommand } from './ascii-payload-parser';

describe('AsciiPayloadParser', () => {
  it('should parse STATE event', () => {
    const result = parseAsciiPayload('STATE old=READY new=RUNNING');
    expect(result).not.toBeNull();
    expect(result?.type).toBe('GAME_STATE');
    expect(result?.encoding).toBe('ascii');
    if (result?.type === 'GAME_STATE') {
      expect(result.payload.state).toBe('RUNNING');
      expect(result.payload.oldState).toBe('READY');
      expect(result.rawText).toBe('STATE old=READY new=RUNNING');
    }
  });

  it('should parse MODE event', () => {
    const result = parseAsciiPayload('MODE active=TIMED param=60');
    expect(result?.type).toBe('GAME_MODE');
    if (result?.type === 'GAME_MODE') {
      expect(result.payload.mode).toBe('TIMED');
      expect(result.payload.parameter).toBe(60);
      expect(result.rawText).toBe('MODE active=TIMED param=60');
    }
  });

  it('should parse SCORE event', () => {
    const result = parseAsciiPayload('SCORE value=42');
    expect(result?.type).toBe('SCORE');
    if (result?.type === 'SCORE') {
      expect(result.payload.score).toBe(42);
      expect(result.rawText).toBe('SCORE value=42');
    }
  });

  it('should parse TIMER event', () => {
    const result = parseAsciiPayload('TIMER elapsed=5000 remaining=25000');
    expect(result?.type).toBe('TIMER');
    if (result?.type === 'TIMER') {
      expect(result.payload.elapsedMs).toBe(5000);
      expect(result.payload.remainingMs).toBe(25000);
      expect(result.rawText).toBe('TIMER elapsed=5000 remaining=25000');
    }
  });

  it('should parse RESULT / GAME_FINISHED event', () => {
    const result = parseAsciiPayload('RESULT score=20 time_ms=30000 reason=TIME_LIMIT');
    expect(result?.type).toBe('GAME_FINISHED');
    if (result?.type === 'GAME_FINISHED') {
      expect(result.payload.finalScore).toBe(20);
      expect(result.payload.totalTimeMs).toBe(30000);
      expect(result.payload.reason).toBe('TIME_LIMIT');
      expect(result.rawText).toBe('RESULT score=20 time_ms=30000 reason=TIME_LIMIT');
    }
  });

  it('should parse SENSOR event', () => {
    const result = parseAsciiPayload('SENSOR status=ARMED target=0');
    expect(result?.type).toBe('SENSOR_STATUS');
    if (result?.type === 'SENSOR_STATUS') {
      expect(result.payload.state).toBe('ARMED');
      expect(result.payload.target).toBe(0);
      expect(result.rawText).toBe('SENSOR status=ARMED target=0');
    }
  });

  it('should parse CALIB event with repeated and ignored flags', () => {
    const result = parseAsciiPayload(
      'CALIB success=1 target=0 repeated=true baseline=1850 noise=12 threshold=1910 ignored=false',
    );
    expect(result?.type).toBe('CALIBRATION_RESULT');
    if (result?.type === 'CALIBRATION_RESULT') {
      expect(result.payload.sensorId).toBe(0);
      expect(result.payload.baseline).toBe(1850);
      expect(result.payload.noise).toBe(12);
      expect(result.payload.threshold).toBe(1910);
      expect(result.payload.repeated).toBe(true);
      expect(result.payload.ignored).toBe(false);
    }
  });

  it('should parse HIT event', () => {
    const result = parseAsciiPayload('HIT id=1 target=0 peak=2150 intensity=300 ts=123456');
    expect(result?.type).toBe('HIT_DETECTED');
    if (result?.type === 'HIT_DETECTED') {
      expect(result.payload.hitId).toBe(1);
      expect(result.payload.sensorId).toBe(0);
      expect(result.payload.peakValue).toBe(2150);
      expect(result.payload.intensity).toBe(300);
      expect(result.payload.timestampUs).toBe(123456);
    }
  });

  it('should parse CAPTURE_START, CAPTURE_DATA, and CAPTURE_END events', () => {
    const start = parseAsciiPayload('CAPTURE_START rate=10000 pre=2 count=6 target=0');
    expect(start?.type).toBe('CAPTURE_START');
    if (start?.type === 'CAPTURE_START') {
      expect(start.payload.sampleRateHz).toBe(10000);
      expect(start.payload.preSamples).toBe(2);
      expect(start.payload.totalSamples).toBe(6);
      expect(start.payload.target).toBe(0);
    }

    const data = parseAsciiPayload('CAPTURE_DATA offset=0 values=1979,1981,2450');
    expect(data?.type).toBe('CAPTURE_DATA');
    if (data?.type === 'CAPTURE_DATA') {
      expect(data.payload.offset).toBe(0);
      expect(data.payload.values).toEqual([1979, 1981, 2450]);
    }

    const end = parseAsciiPayload('CAPTURE_END count=6');
    expect(end?.type).toBe('CAPTURE_END');
    if (end?.type === 'CAPTURE_END') {
      expect(end.payload.totalSamples).toBe(6);
    }
  });

  it('should parse ERROR event', () => {
    const result = parseAsciiPayload('ERROR code=4097 comp=ADC msg=Sensor error');
    expect(result?.type).toBe('ERROR');
    if (result?.type === 'ERROR') {
      expect(result.payload.errorCode).toBe(4097);
      expect(result.payload.component).toBe('ADC');
      expect(result.payload.message).toBe('Sensor error');
    }
  });

  it('should return null for empty string or whitespace', () => {
    expect(parseAsciiPayload('')).toBeNull();
    expect(parseAsciiPayload('   ')).toBeNull();
  });

  it('should warn and return null for unrecognized event', () => {
    const spy = vi.spyOn(console, 'warn').mockReturnValue();
    const result = parseAsciiPayload('FOOBAR param=1');
    expect(result).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  describe('serializeAsciiCommand', () => {
    it('should serialize simple commands without payloads', () => {
      expect(serializeAsciiCommand({ type: 'START' })).toBe('START');
      expect(serializeAsciiCommand({ type: 'RESET' })).toBe('RESET');
      expect(serializeAsciiCommand({ type: 'CALIBRATE' })).toBe('CALIB');
      expect(serializeAsciiCommand({ type: 'STATUS' })).toBe('STATUS');
      expect(serializeAsciiCommand({ type: 'HANDSHAKE' })).toBe('');
    });

    it('should serialize SET_MODE with string and numeric modes', () => {
      expect(serializeAsciiCommand({ type: 'SET_MODE', payload: { mode: 'COUNT' } })).toBe(
        'MODE:COUNT',
      );
      expect(serializeAsciiCommand({ type: 'SET_MODE', payload: { mode: 'TIMED' } })).toBe(
        'MODE:TIMED',
      );
      expect(serializeAsciiCommand({ type: 'SET_MODE', payload: { mode: 'RACE' } })).toBe(
        'MODE:RACE',
      );
      expect(serializeAsciiCommand({ type: 'SET_MODE', payload: { mode: 0 } })).toBe('MODE:COUNT');
      expect(serializeAsciiCommand({ type: 'SET_MODE', payload: { mode: 1 } })).toBe('MODE:TIMED');
      expect(serializeAsciiCommand({ type: 'SET_MODE', payload: { mode: 2 } })).toBe('MODE:RACE');
    });

    it('should serialize SET_PARAMETER and enforce positive integers', () => {
      expect(serializeAsciiCommand({ type: 'SET_PARAMETER', payload: { parameter: 45 } })).toBe(
        'PARAM:45',
      );
      expect(serializeAsciiCommand({ type: 'SET_PARAMETER', payload: { parameter: 0 } })).toBe(
        'PARAM:1',
      );
      expect(serializeAsciiCommand({ type: 'SET_PARAMETER', payload: { parameter: -10 } })).toBe(
        'PARAM:1',
      );
    });

    it('should serialize SET_SENSITIVITY', () => {
      expect(
        serializeAsciiCommand({ type: 'SET_SENSITIVITY', payload: { noiseFactor: 2.25 } }),
      ).toBe('SENS:2.25');
    });

    it('should serialize CAPTURE commands', () => {
      expect(serializeAsciiCommand({ type: 'CAPTURE', payload: { action: 'start' } })).toBe(
        'CAPTURE',
      );
      expect(
        serializeAsciiCommand({ type: 'CAPTURE', payload: { action: 'start', target: 1 } }),
      ).toBe('CAPTURE:1');
      expect(
        serializeAsciiCommand({ type: 'CAPTURE', payload: { action: 'start', target: 'all' } }),
      ).toBe('CAPTURE:all');
      expect(serializeAsciiCommand({ type: 'CAPTURE', payload: { action: 'stop' } })).toBe(
        'CAPTURE:STOP',
      );
    });
  });
});
