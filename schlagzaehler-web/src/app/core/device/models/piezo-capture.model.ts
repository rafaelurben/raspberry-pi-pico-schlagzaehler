export interface PiezoCaptureResult {
  readonly id: string;
  readonly deviceId: string;
  readonly deviceName: string;
  readonly timestamp: Date;
  readonly sampleRateHz: number;
  readonly preSamples: number;
  readonly totalSamples: number;
  readonly baseline: number;
  readonly noise: number;
  readonly threshold: number;
  readonly peak: number;
  readonly samples: readonly number[];
}

export interface CaptureStartMessage {
  readonly type: 'CAPTURE_START';
  readonly sampleRateHz: number;
  readonly preSamples: number;
  readonly totalSamples: number;
  readonly baseline: number;
  readonly noise: number;
  readonly threshold: number;
}

export interface CaptureDataMessage {
  readonly type: 'CAPTURE_DATA';
  readonly offset: number;
  readonly values: readonly number[];
}

export interface CaptureEndMessage {
  readonly type: 'CAPTURE_END';
  readonly totalSamples: number;
}

export type CaptureProtocolMessage = CaptureStartMessage | CaptureDataMessage | CaptureEndMessage;
