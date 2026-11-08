import type { GameEndReason, GameMode, GameState, SensorState } from '../../models/device.model';
import { UnifiedProtocolCommand, UnifiedProtocolMessage } from '../companion-protocol.types';
import {
  VALID_END_REASONS,
  VALID_GAME_MODES,
  VALID_GAME_STATES,
  VALID_SENSOR_STATES,
} from './ascii-protocol.types';

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
 * Parses a single ASCII line into a strongly typed UnifiedProtocolMessage with encoding='ascii'.
 * Returns null if the line is not a recognized protocol event.
 */
export function parseAsciiPayload(rawLine: string): UnifiedProtocolMessage | null {
  const trimmed = rawLine.trim();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split(/\s+/);
  const type = parts[0];
  const kv = parseKeyValuePairs(parts.slice(1));

  switch (type) {
    case 'BOOT': {
      const successVal = kv['success'];
      const success = successVal === '1' || successVal === 'true';
      const msgMatch = trimmed.match(/(?:msg|message)=(.*)$/);
      const message = msgMatch ? msgMatch[1] : (kv['msg'] ?? kv['message'] ?? '');
      return {
        encoding: 'ascii',
        type: 'BOOT',
        payload: {
          success,
          message,
        },
        rawText: trimmed,
      };
    }

    case 'STATE': {
      const rawNew = (kv['new'] ?? kv['state']) as GameState | undefined;
      const rawOld = (kv['old'] ?? kv['previous']) as GameState | undefined;
      const state = rawNew && VALID_GAME_STATES.has(rawNew) ? rawNew : 'UNKNOWN';
      const oldState = rawOld && VALID_GAME_STATES.has(rawOld) ? rawOld : undefined;
      return {
        encoding: 'ascii',
        type: 'GAME_STATE',
        payload: { state, oldState },
        rawText: trimmed,
      };
    }

    case 'MODE': {
      const rawMode = (kv['active'] ?? kv['mode']) as GameMode | undefined;
      const mode = rawMode && VALID_GAME_MODES.has(rawMode) ? rawMode : 'COUNT';
      const paramParsed = Number.parseInt(kv['param'] ?? kv['parameter'] ?? '0', 10);
      const parameter = Number.isNaN(paramParsed) ? 0 : paramParsed;
      return {
        encoding: 'ascii',
        type: 'GAME_MODE',
        payload: { mode, parameter },
        rawText: trimmed,
      };
    }

    case 'SCORE': {
      const scoreParsed = Number.parseInt(kv['value'] ?? kv['score'] ?? '0', 10);
      return {
        encoding: 'ascii',
        type: 'SCORE',
        payload: { score: Number.isNaN(scoreParsed) ? 0 : scoreParsed },
        rawText: trimmed,
      };
    }

    case 'TIMER': {
      const elapsedParsed = Number.parseInt(kv['elapsed'] ?? '0', 10);
      const remainingParsed = Number.parseInt(kv['remaining'] ?? '0', 10);
      return {
        encoding: 'ascii',
        type: 'TIMER',
        payload: {
          elapsedMs: Number.isNaN(elapsedParsed) ? 0 : elapsedParsed,
          remainingMs: Number.isNaN(remainingParsed) ? 0 : remainingParsed,
        },
        rawText: trimmed,
      };
    }

    case 'RESULT':
    case 'GAME_FINISHED': {
      const scoreParsed = Number.parseInt(kv['score'] ?? '0', 10);
      const timeParsed = Number.parseInt(kv['time_ms'] ?? kv['time'] ?? '0', 10);
      const rawReason = (kv['reason'] ?? 'NONE') as GameEndReason;
      const reason = VALID_END_REASONS.has(rawReason) ? rawReason : 'NONE';
      return {
        encoding: 'ascii',
        type: 'GAME_FINISHED',
        payload: {
          finalScore: Number.isNaN(scoreParsed) ? 0 : scoreParsed,
          totalTimeMs: Number.isNaN(timeParsed) ? 0 : timeParsed,
          reason,
        },
        rawText: trimmed,
      };
    }

    case 'SENSOR': {
      const rawStatus = (kv['status'] ?? kv['state']) as SensorState | undefined;
      const state = rawStatus && VALID_SENSOR_STATES.has(rawStatus) ? rawStatus : 'UNKNOWN';
      const targetParsed = Number.parseInt(kv['target'] ?? '', 10);
      const target = Number.isNaN(targetParsed) ? undefined : targetParsed;
      return {
        encoding: 'ascii',
        type: 'SENSOR_STATUS',
        payload: { state, target },
        rawText: trimmed,
      };
    }

    case 'CALIB':
    case 'CALIBRATION_RESULT': {
      const targetParsed = Number.parseInt(kv['target'] ?? kv['sensor'] ?? '0', 10);
      const baselineParsed = Number.parseInt(kv['baseline'] ?? '0', 10);
      const noiseParsed = Number.parseInt(kv['noise'] ?? '0', 10);
      const thresholdParsed = Number.parseInt(kv['threshold'] ?? '0', 10);
      return {
        encoding: 'ascii',
        type: 'CALIBRATION_RESULT',
        payload: {
          sensorId: Number.isNaN(targetParsed) ? 0 : targetParsed,
          baseline: Number.isNaN(baselineParsed) ? 0 : baselineParsed,
          noise: Number.isNaN(noiseParsed) ? 0 : noiseParsed,
          threshold: Number.isNaN(thresholdParsed) ? 0 : thresholdParsed,
          ignored: kv['ignored'] === 'true' || kv['ignored'] === '1',
          repeated: kv['repeated'] === 'true' || kv['repeated'] === '1',
        },
        rawText: trimmed,
      };
    }

    case 'HIT': {
      const idParsed = Number.parseInt(kv['id'] ?? '0', 10);
      const targetParsed = Number.parseInt(kv['target'] ?? kv['sensor'] ?? '0', 10);
      const peakParsed = Number.parseInt(kv['peak'] ?? '0', 10);
      const intensityParsed = Number.parseInt(kv['intensity'] ?? '0', 10);
      const tsParsed = Number.parseInt(kv['ts'] ?? kv['timestamp'] ?? '0', 10);
      return {
        encoding: 'ascii',
        type: 'HIT_DETECTED',
        payload: {
          hitId: Number.isNaN(idParsed) ? undefined : idParsed,
          sensorId: Number.isNaN(targetParsed) ? 0 : targetParsed,
          peakValue: Number.isNaN(peakParsed) ? 0 : peakParsed,
          intensity: Number.isNaN(intensityParsed) ? 0 : intensityParsed,
          timestampUs: Number.isNaN(tsParsed) ? undefined : tsParsed,
        },
        rawText: trimmed,
      };
    }

    case 'CAPTURE_START': {
      const sampleRateHz = Number.parseInt(kv['rate'] ?? '10000', 10);
      const preSamples = Number.parseInt(kv['pre'] ?? '1000', 10);
      const totalSamples = Number.parseInt(kv['count'] ?? '21000', 10);
      const targetParsed = Number.parseInt(kv['target'] ?? '', 10);
      const target = Number.isNaN(targetParsed) ? undefined : targetParsed;
      if (Number.isNaN(totalSamples) || totalSamples <= 0) {
        console.warn(`[AsciiPayloadParser] Invalid totalSamples in CAPTURE_START: ${rawLine}`);
        return null;
      }
      return {
        encoding: 'ascii',
        type: 'CAPTURE_START',
        payload: {
          type: 'CAPTURE_START',
          sampleRateHz: Number.isNaN(sampleRateHz) ? 10000 : sampleRateHz,
          preSamples: Number.isNaN(preSamples) ? 0 : preSamples,
          totalSamples,
          target,
        },
        rawText: trimmed,
      };
    }

    case 'CAPTURE_DATA': {
      const offset = Number.parseInt(kv['offset'] ?? '0', 10);
      const rawValues = kv['values'] ?? '';
      if (Number.isNaN(offset) || offset < 0 || !rawValues) {
        console.warn(`[AsciiPayloadParser] Invalid CAPTURE_DATA payload: ${rawLine}`);
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
        encoding: 'ascii',
        type: 'CAPTURE_DATA',
        payload: {
          type: 'CAPTURE_DATA',
          offset,
          values,
        },
        rawText: trimmed,
      };
    }

    case 'CAPTURE_END': {
      const totalSamples = Number.parseInt(kv['count'] ?? '0', 10);
      return {
        encoding: 'ascii',
        type: 'CAPTURE_END',
        payload: {
          type: 'CAPTURE_END',
          totalSamples: Number.isNaN(totalSamples) ? 0 : totalSamples,
        },
        rawText: trimmed,
      };
    }

    case 'ERROR': {
      const codeParsed = Number.parseInt(kv['code'] ?? '', 10);
      const msgMatch = trimmed.match(/(?:msg|message)=(.*)$/);
      const message = msgMatch
        ? msgMatch[1]
        : (kv['msg'] ?? kv['message'] ?? parts.slice(1).join(' '));
      return {
        encoding: 'ascii',
        type: 'ERROR',
        payload: {
          errorCode: Number.isNaN(codeParsed) ? undefined : codeParsed,
          component: kv['comp'] ?? kv['component'],
          message,
        },
        rawText: trimmed,
      };
    }

    default:
      console.warn(`[AsciiPayloadParser] Unrecognized ASCII message: ${trimmed}`);
      return null;
  }
}

/**
 * Serializes a UnifiedProtocolCommand into an ASCII command line (ICD Section 7.1).
 */
export function serializeAsciiCommand(command: UnifiedProtocolCommand): string {
  switch (command.type) {
    case 'START':
      return 'START';
    case 'RESET':
      return 'RESET';
    case 'CALIBRATE':
      return 'CALIB';
    case 'STATUS':
      return 'STATUS';
    case 'SET_MODE': {
      let modeStr: string;
      if (typeof command.payload.mode === 'number') {
        modeStr =
          command.payload.mode === 0 ? 'COUNT' : command.payload.mode === 1 ? 'TIMED' : 'RACE';
      } else {
        modeStr = command.payload.mode;
      }
      return `MODE:${modeStr}`;
    }
    case 'SET_PARAMETER':
      return `PARAM:${Math.max(1, Math.floor(command.payload.parameter))}`;
    case 'SET_SENSITIVITY':
      return `SENS:${command.payload.noiseFactor}`;
    case 'CAPTURE': {
      const isStop = command.payload.action === 'stop' || command.payload.action === 0;
      if (isStop) {
        return 'CAPTURE:STOP';
      }
      const target = command.payload.target;
      if (target === 'all') {
        return 'CAPTURE:all';
      }
      if (typeof target === 'number' && target >= 0 && target <= 2) {
        return `CAPTURE:${target}`;
      }
      return 'CAPTURE';
    }
    case 'HANDSHAKE':
      // ASCII protocol has no handshake command
      return '';
    case '_RAW':
      return command.payload;
  }
}
