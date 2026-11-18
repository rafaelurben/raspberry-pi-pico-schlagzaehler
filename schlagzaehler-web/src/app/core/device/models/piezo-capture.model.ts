export interface SensorCalibrationData {
  readonly sensorId: number;
  readonly baseline: number;
  readonly noise: number;
  readonly threshold: number;
}

export function isAllSensorsTarget(target: unknown): boolean {
  return target === 255 || target === 'all';
}

export function getCaptureSensorCalibrations(
  cap: PiezoCaptureResult,
): readonly SensorCalibrationData[] {
  if (cap.sensors && cap.sensors.length > 0) {
    return cap.sensors;
  }
  if (isAllSensorsTarget(cap.target)) {
    return [0, 1, 2].map((sensorId) => ({
      sensorId,
      baseline: cap.baseline,
      noise: cap.noise,
      threshold: cap.threshold,
    }));
  }
  return [
    {
      sensorId: typeof cap.target === 'number' ? cap.target : 0,
      baseline: cap.baseline,
      noise: cap.noise,
      threshold: cap.threshold,
    },
  ];
}

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
  readonly target?: number;
  readonly sensors?: readonly SensorCalibrationData[];
  readonly peak: number;
  readonly samples: readonly number[] | Uint16Array;
}

export interface CaptureStartMessage {
  readonly type: 'CAPTURE_START';
  readonly sampleRateHz: number;
  readonly preSamples: number;
  readonly totalSamples: number;
  readonly target?: number;
}

export interface CaptureDataMessage {
  readonly type: 'CAPTURE_DATA';
  readonly offset: number;
  readonly values: readonly number[] | Uint16Array;
}

export interface CaptureEndMessage {
  readonly type: 'CAPTURE_END';
  readonly totalSamples: number;
}

export type CaptureProtocolMessage = CaptureStartMessage | CaptureDataMessage | CaptureEndMessage;
