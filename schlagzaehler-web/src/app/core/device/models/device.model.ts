import { ConnectionState } from './connection-state.type';

export type TransportType = 'serial' | 'bluetooth' | 'websocket';

export type GameMode = 'COUNT' | 'TIMED' | 'RACE' | 'UNKNOWN';
export type SelectableGameMode = 'COUNT' | 'TIMED' | 'RACE';

export type GameState =
  'BOOT' | 'MENU' | 'READY' | 'RUNNING' | 'FINISHED' | 'CAPTURING' | 'UNKNOWN';

export type SensorState =
  | 'INIT'
  | 'CALIBRATING'
  | 'ARMED'
  | 'LOCKOUT'
  | 'CAPTURE_ARMED'
  | 'CAPTURING'
  | 'CAPTURE_TX_WAIT'
  | 'ERROR'
  | 'UNKNOWN';

export type GameEndReason = 'NONE' | 'TIME_LIMIT' | 'TARGET_REACHED' | 'ABORTED';

export interface DeviceMetadata {
  readonly usbVendorId?: number;
  readonly usbProductId?: number;
  readonly [key: string]: unknown;
}

/**
 * Tracks the connection, readiness, and game state of a device.
 */
export class DeviceState {
  readonly connectionState: ConnectionState = 'disconnected';
  readonly gameState: GameState = 'UNKNOWN';
  readonly sensorState: SensorState = 'UNKNOWN';
  readonly isReady: boolean = false;
  readonly mode: GameMode = 'COUNT';
  readonly parameter: number = 0;
  readonly score: number = 0;
  readonly elapsedMs: number = 0;
  readonly remainingMs: number = 0;
  readonly endReason: GameEndReason = 'NONE';
  readonly lastTimerUpdatedAt: number | null = null;

  constructor(init?: Partial<DeviceState>) {
    if (init) {
      Object.assign(this, init);
    }
  }
}

export class Device {
  readonly id: string;
  readonly name: string;
  readonly state: DeviceState;
  readonly transportType: TransportType;
  readonly metadata?: DeviceMetadata;
  readonly errorMessage?: string;

  constructor(init: {
    id: string;
    name: string;
    state?: Partial<DeviceState> | DeviceState;
    transportType: TransportType;
    metadata?: DeviceMetadata;
    errorMessage?: string;
  }) {
    this.id = init.id;
    this.name = init.name;
    this.state = init.state instanceof DeviceState ? init.state : new DeviceState(init.state);
    this.transportType = init.transportType;
    this.metadata = init.metadata;
    this.errorMessage = init.errorMessage;
  }
}
