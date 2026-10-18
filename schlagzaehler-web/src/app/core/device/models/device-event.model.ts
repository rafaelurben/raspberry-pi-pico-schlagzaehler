export type EventDirection = 'received' | 'sent';

export interface DeviceEvent {
  readonly id: string;
  readonly deviceId: string;
  readonly timestamp: Date;
  readonly payload: string;
  readonly direction?: EventDirection;
}
