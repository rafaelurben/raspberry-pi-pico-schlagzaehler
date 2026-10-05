export interface SerialConfig {
  readonly baudRate: number;
  readonly dataBits?: 7 | 8;
  readonly stopBits?: 1 | 2;
  readonly parity?: 'none' | 'even' | 'odd';
  readonly bufferSize?: number;
}

/**
 * Default serial port configuration for Raspberry Pi Pico CDC communication.
 */
export const DEFAULT_SERIAL_CONFIG: SerialConfig = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  bufferSize: 4096,
};

/**
 * Maximum number of events retained in memory for the live event list.
 */
export const MAX_RETAINED_EVENTS = 500;
