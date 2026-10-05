import { Observable } from 'rxjs';
import { ConnectionState } from '../models/connection-state.type';
import { DeviceMetadata, TransportType } from '../models/device.model';

/**
 * Generic transport abstraction representing a single physical or virtual device connection.
 * Designed to support Web Serial, and extensible to future transports like Web Bluetooth or WebSocket.
 */
export interface DeviceTransport {
  /**
   * Identifies the underlying transport technology (e.g. 'serial', 'bluetooth', 'websocket').
   */
  readonly transportType: TransportType;

  /**
   * Observable stream of the connection state lifecycle (disconnected, connecting, connected, error).
   */
  readonly state$: Observable<ConnectionState>;

  /**
   * Observable stream of incoming newline-delimited event strings received from the device.
   */
  readonly events$: Observable<string>;

  /**
   * Observable stream of transport-level errors that occur during connection or reading.
   */
  readonly errors$: Observable<Error>;

  /**
   * Retrieves transport-specific metadata if available (e.g. USB vendor/product IDs).
   */
  getMetadata(): DeviceMetadata | undefined;

  /**
   * Connects to or opens the device.
   */
  connect(): Promise<void>;

  /**
   * Gracefully disconnects, stops reading, and frees all underlying resources.
   */
  disconnect(): Promise<void>;
}
