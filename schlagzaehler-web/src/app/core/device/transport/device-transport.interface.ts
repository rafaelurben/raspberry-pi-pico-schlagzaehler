import { Observable } from 'rxjs';
import { ConnectionState } from '../models/connection-state.type';
import { DeviceMetadata, TransportType } from '../models/device.model';
import { BinaryFrame } from '../protocol/binary/binary-protocol.types';

export interface AsciiTransportEvent {
  readonly type: 'ascii';
  readonly content: string;
}

export interface BinaryTransportEvent {
  readonly type: 'binary';
  readonly content: BinaryFrame;
}

export type TransportEvent = AsciiTransportEvent | BinaryTransportEvent;

/**
 * Generic transport abstraction representing a single physical or virtual device connection.
 * Designed to support Web Serial (both framed binary TLV and fallback ASCII),
 * and extensible to future transports like Web Bluetooth or WebSocket.
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
   * Observable stream of incoming events received from the device (binary frames or ASCII strings).
   */
  readonly events$: Observable<TransportEvent>;

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

  /**
   * Sends a raw command line or binary packet to the connected device.
   */
  send(data: string | Uint8Array): Promise<void>;
}
