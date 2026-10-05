import { ConnectionState } from './connection-state.type';

export type TransportType = 'serial' | 'bluetooth' | 'websocket';

export interface DeviceMetadata {
  readonly usbVendorId?: number;
  readonly usbProductId?: number;
  readonly [key: string]: unknown;
}

export interface Device {
  readonly id: string;
  readonly name: string;
  readonly state: ConnectionState;
  readonly transportType: TransportType;
  readonly metadata?: DeviceMetadata;
  readonly errorMessage?: string;
}
