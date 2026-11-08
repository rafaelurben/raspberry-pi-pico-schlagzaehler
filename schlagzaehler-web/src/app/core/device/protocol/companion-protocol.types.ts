import type {
  GameEndReason,
  GameMode,
  GameState,
  SelectableGameMode,
  SensorState,
} from '../models/device.model';
import type {
  CaptureDataMessage,
  CaptureEndMessage,
  CaptureStartMessage,
} from '../models/piezo-capture.model';
import {
  BinaryCaptureAction,
  BinaryGameMode,
  HandshakeStatusCode,
} from './binary/binary-protocol.types';

/**
 * Normalized sensor calibration data common to binary and ASCII protocols.
 */
export interface SensorCalibration {
  readonly sensorId: number;
  readonly baseline: number;
  readonly noise: number;
  readonly threshold: number;
  readonly ignored: boolean;
  readonly repeated: boolean;
}

/**
 * Protocol message transport encoding indicating how the message arrived.
 */
export type ProtocolMessageEncoding = 'binary' | 'ascii';

export interface BootPayload {
  readonly success: boolean;
  readonly message: string;
}

export interface HandshakeAckPayload {
  readonly hardwareGen: number;
  readonly hardwareRev: number;
  readonly protoMajor: number;
  readonly protoMinor: number;
  readonly fwMajor: number;
  readonly fwMinor: number;
  readonly fwPatch: number;
  readonly statusCode: HandshakeStatusCode;
  readonly reserved: number;
  readonly clientNonce: number;
  readonly uptimeMs: number;
}

/**
 * Discriminated union of Unified Protocol Messages.
 * After Layer 2, there is no more difference between ASCII and binary messages,
 * except for the `encoding` attribute showing how the message arrived.
 */
export type UnifiedProtocolMessage =
  | {
      readonly encoding: ProtocolMessageEncoding;
      readonly type: 'BOOT';
      readonly payload: BootPayload;
      readonly rawText: string;
    }
  | {
      readonly encoding: ProtocolMessageEncoding;
      readonly type: 'HANDSHAKE_ACK';
      readonly payload: HandshakeAckPayload;
      readonly rawText: string;
    }
  | {
      readonly encoding: ProtocolMessageEncoding;
      readonly type: 'SENSOR_STATUS';
      readonly payload: { readonly state: SensorState; readonly target?: number };
      readonly rawText: string;
    }
  | {
      readonly encoding: ProtocolMessageEncoding;
      readonly type: 'CALIBRATION_RESULT';
      readonly payload: SensorCalibration;
      readonly rawText: string;
    }
  | {
      readonly encoding: ProtocolMessageEncoding;
      readonly type: 'HIT_DETECTED';
      readonly payload: {
        readonly sensorId: number;
        readonly peakValue: number;
        readonly intensity: number;
        readonly hitId?: number;
        readonly timestampUs?: number;
      };
      readonly rawText: string;
    }
  | {
      readonly encoding: ProtocolMessageEncoding;
      readonly type: 'GAME_STATE';
      readonly payload: { readonly state: GameState; readonly oldState?: GameState };
      readonly rawText: string;
    }
  | {
      readonly encoding: ProtocolMessageEncoding;
      readonly type: 'GAME_MODE';
      readonly payload: { readonly mode: GameMode; readonly parameter: number };
      readonly rawText: string;
    }
  | {
      readonly encoding: ProtocolMessageEncoding;
      readonly type: 'SCORE';
      readonly payload: { readonly score: number };
      readonly rawText: string;
    }
  | {
      readonly encoding: ProtocolMessageEncoding;
      readonly type: 'TIMER';
      readonly payload: { readonly elapsedMs: number; readonly remainingMs: number };
      readonly rawText: string;
    }
  | {
      readonly encoding: ProtocolMessageEncoding;
      readonly type: 'GAME_FINISHED';
      readonly payload: {
        readonly finalScore: number;
        readonly totalTimeMs: number;
        readonly reason: GameEndReason;
      };
      readonly rawText: string;
    }
  | {
      readonly encoding: ProtocolMessageEncoding;
      readonly type: 'CAPTURE_START';
      readonly payload: CaptureStartMessage;
      readonly rawText: string;
    }
  | {
      readonly encoding: ProtocolMessageEncoding;
      readonly type: 'CAPTURE_DATA';
      readonly payload: CaptureDataMessage;
      readonly rawText: string;
    }
  | {
      readonly encoding: ProtocolMessageEncoding;
      readonly type: 'CAPTURE_END';
      readonly payload: CaptureEndMessage;
      readonly rawText: string;
    }
  | {
      readonly encoding: ProtocolMessageEncoding;
      readonly type: 'ERROR';
      readonly payload: {
        readonly errorCode?: number;
        readonly component?: string;
        readonly message: string;
      };
      readonly rawText: string;
    };

// Command Payloads
export interface HandshakeCommandPayload {
  readonly clientNonce?: number;
  readonly clientProtoMajor?: number;
  readonly clientProtoMinor?: number;
  readonly tlvMode?: boolean;
}

export interface SetModeCommandPayload {
  readonly mode: SelectableGameMode | BinaryGameMode;
}

export interface SetParameterCommandPayload {
  readonly parameter: number;
}

export interface SetSensitivityCommandPayload {
  readonly noiseFactor: number;
}

export interface CaptureCommandPayload {
  readonly action: 'start' | 'stop' | BinaryCaptureAction;
  readonly target?: number | 'all';
}

/**
 * Discriminated union of Unified Protocol Commands.
 * Defines high-level commands independently of transport encoding (ASCII vs binary).
 */
export type UnifiedProtocolCommand =
  | { readonly type: 'HANDSHAKE'; readonly payload?: HandshakeCommandPayload }
  | { readonly type: 'START'; readonly payload?: undefined }
  | { readonly type: 'RESET'; readonly payload?: undefined }
  | { readonly type: 'CALIBRATE'; readonly payload?: undefined }
  | { readonly type: 'STATUS'; readonly payload?: undefined }
  | { readonly type: 'SET_MODE'; readonly payload: SetModeCommandPayload }
  | { readonly type: 'SET_PARAMETER'; readonly payload: SetParameterCommandPayload }
  | { readonly type: 'SET_SENSITIVITY'; readonly payload: SetSensitivityCommandPayload }
  | { readonly type: 'CAPTURE'; readonly payload: CaptureCommandPayload }
  | { readonly type: '_RAW'; readonly payload: string };
