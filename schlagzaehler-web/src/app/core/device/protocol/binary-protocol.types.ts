/**
 * Binary protocol definitions and frame structures for the Schlagzähler companion protocol.
 * Conforms to ICD Section 4, 5, and 6 in docs/protocol.md.
 */

// Header Constants
export const SYNC_WORD = 0xaa55;
export const SYNC_BYTE_0 = 0x55;
export const SYNC_BYTE_1 = 0xaa;
export const PROTOCOL_VERSION = 1;
export const HEADER_SIZE = 8;
export const CRC_SIZE = 2;
export const MIN_FRAME_SIZE = 10; // HEADER_SIZE + 0-byte payload + CRC_SIZE

// Frame Header Flags
export const FRAME_FLAG_IS_ERROR = 0x01;

// Command Types (0x01..0x7F)
export enum BinaryCommandType {
  CMD_HANDSHAKE = 0x01,
  CMD_START = 0x02,
  CMD_RESET = 0x03,
  CMD_CALIBRATE = 0x04,
  CMD_STATUS = 0x05,
  CMD_SET_MODE = 0x06,
  CMD_SET_PARAMETER = 0x07,
  CMD_SET_SENSITIVITY = 0x08,
  CMD_CAPTURE = 0x09,
}

// Telemetry Message Types (0x80..0xFF)
export enum BinaryMessageType {
  MSG_HANDSHAKE_ACK = 0x81,
  MSG_SENSOR_STATUS = 0x82,
  MSG_CALIBRATION_RESULT = 0x83,
  MSG_HIT_DETECTED = 0x84,
  MSG_GAME_STATE = 0x85,
  MSG_GAME_MODE = 0x86,
  MSG_SCORE = 0x87,
  MSG_TIMER = 0x88,
  MSG_GAME_FINISHED = 0x89,
  MSG_CAPTURE_START = 0x8a,
  MSG_CAPTURE_DATA = 0x8b,
  MSG_CAPTURE_END = 0x8c,
  MSG_ERROR = 0x8d,
}

// Handshake Command Flags
export const HANDSHAKE_FLAG_TLV_MODE = 0x0001;

// Calibration Result Flags
export const CALIB_FLAG_IGNORED = 0x01;
export const CALIB_FLAG_REPEATED = 0x02;

// Telemetry & Command Enums
export enum HandshakeStatusCode {
  OK = 0,
  ERR_VERSION_MISMATCH = 1,
  ERR_BUSY = 2,
}

export enum BinarySensorState {
  INIT = 0,
  CALIBRATING = 1,
  ARMED = 2,
  LOCKOUT = 3,
  CAPTURE_ARMED = 4,
  CAPTURING = 5,
  CAPTURE_TX_WAIT = 6,
  ERROR = 7,
}

export enum BinaryGameState {
  BOOT = 0,
  MENU = 1,
  READY = 2,
  RUNNING = 3,
  FINISHED = 4,
  CAPTURING = 5,
}

export enum BinaryGameMode {
  COUNT = 0,
  TIMED = 1,
  RACE = 2,
}

export enum BinaryGameEndReason {
  NONE = 0,
  TIME_LIMIT = 1,
  TARGET_REACHED = 2,
  ABORTED = 3,
}

export enum BinaryComponentId {
  SYSTEM = 0,
  ADC = 1,
  DMA = 2,
  USB = 3,
  DISPLAY = 4,
}

export enum BinaryCaptureAction {
  STOP = 0,
  START = 1,
}

/**
 * Validated binary protocol frame.
 */
export interface BinaryFrame {
  readonly type: number;
  readonly flags: number;
  readonly seq: number;
  readonly payload: Uint8Array;
}

// Command Payloads
export interface HandshakeCommandPayload {
  readonly clientProtoMajor: number;
  readonly clientProtoMinor: number;
  readonly flags: number;
  readonly clientNonce: number;
}

export interface SetModeCommandPayload {
  readonly mode: BinaryGameMode;
}

export interface SetParameterCommandPayload {
  readonly parameter: number;
}

export interface SetSensitivityCommandPayload {
  readonly noiseFactor: number;
}

export interface CaptureCommandPayload {
  readonly action: BinaryCaptureAction;
  readonly targetSensor: number;
}

// Telemetry Payloads
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

export interface SensorStatusPayload {
  readonly state: BinarySensorState;
  readonly target: number;
}

export interface CalibrationResultPayload {
  readonly flags: number;
  readonly ignored: boolean;
  readonly repeated: boolean;
  readonly sensorId: number;
  readonly baseline: number;
  readonly noiseSpan: number;
  readonly threshold: number;
}

export interface HitDetectedPayload {
  readonly hitId: number;
  readonly peakValue: number;
  readonly intensity: number;
  readonly sensorId: number;
  readonly timestampUs: number;
}

export interface GameStatePayload {
  readonly oldState: BinaryGameState;
  readonly newState: BinaryGameState;
}

export interface GameModePayload {
  readonly mode: BinaryGameMode;
  readonly parameter: number;
}

export interface ScorePayload {
  readonly score: number;
}

export interface TimerPayload {
  readonly elapsedMs: number;
  readonly remainingMs: number;
}

export interface GameFinishedPayload {
  readonly finalScore: number;
  readonly totalTimeMs: number;
  readonly reason: BinaryGameEndReason;
}

export interface CaptureStartPayload {
  readonly sampleRateHz: number;
  readonly preSamples: number;
  readonly totalSamples: number;
  readonly targetChannel: number;
}

export interface CaptureDataPayload {
  readonly offset: number;
  readonly count: number;
  readonly samples: Uint16Array;
}

export interface CaptureEndPayload {
  readonly totalSamples: number;
}

export interface ErrorPayload {
  readonly errorCode: number;
  readonly componentId: BinaryComponentId;
  readonly flags: number;
  readonly msgLength: number;
  readonly message: string;
}
