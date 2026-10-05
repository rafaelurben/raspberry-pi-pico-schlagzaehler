import { Injectable } from '@angular/core';
import { DEFAULT_SERIAL_CONFIG, SerialConfig } from '../../config/serial.config';
import { DeviceTransport } from './device-transport.interface';
import { WebSerialTransport } from './web-serial-transport';

@Injectable({ providedIn: 'root' })
export class WebSerialTransportFactory {
  /**
   * Checks whether the current browser environment supports the Web Serial API.
   */
  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      'serial' in navigator &&
      navigator.serial != null
    );
  }

  /**
   * Prompts the user to select a serial port using the browser's native device picker.
   */
  async requestPort(options?: SerialPortRequestOptions): Promise<SerialPort> {
    if (!this.isSupported()) {
      throw new Error('The Web Serial API is not supported in this browser.');
    }
    return await navigator.serial.requestPort(options);
  }

  /**
   * Instantiates a WebSerialTransport wrapping the selected SerialPort.
   */
  createTransport(port: SerialPort, config: SerialConfig = DEFAULT_SERIAL_CONFIG): DeviceTransport {
    return new WebSerialTransport(port, config);
  }
}
