export interface DeviceEvent {
  readonly id: string;
  readonly deviceId: string;
  readonly timestamp: Date;
  readonly payload: string;
}
