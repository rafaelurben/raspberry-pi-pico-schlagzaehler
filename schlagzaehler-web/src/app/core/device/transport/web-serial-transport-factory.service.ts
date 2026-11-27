import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DEFAULT_SERIAL_CONFIG, SerialConfig } from '../../config/serial.config';
import { DeviceMetadata } from '../models/device.model';
import { DeviceTransport } from './device-transport.interface';
import { WebSerialTransport } from './web-serial-transport';

@Injectable({ providedIn: 'root' })
export class WebSerialTransportFactory {
  /**
   * Observable stream that emits newly connected SerialPort instances when physical serial devices
   * are plugged in.
   */
  readonly connect$: Observable<SerialPort> = new Observable<SerialPort>((subscriber) => {
    if (!this.isSupported()) {
      return;
    }

    const handler = (event: Event): void => {
      const port = (event as { port?: SerialPort }).port ?? (event.target as SerialPort);
      if (port) {
        subscriber.next(port);
      }
    };

    navigator.serial.addEventListener('connect', handler);
    return () => {
      navigator.serial.removeEventListener('connect', handler);
    };
  });

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
   * Retrieves all previously authorized serial ports available in the current browser session.
   */
  async getPorts(): Promise<SerialPort[]> {
    if (!this.isSupported()) {
      return [];
    }
    return await navigator.serial.getPorts();
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
   * Finds an unopened, available SerialPort that matches the target device metadata
   * (matching usbVendorId and usbProductId), or the sole available port if only one exists.
   */
  findMatchingPort(ports: readonly SerialPort[], metadata?: DeviceMetadata): SerialPort | null {
    const availablePorts = ports.filter((port) => !port.readable && !port.writable);
    if (availablePorts.length === 0) {
      return null;
    }

    const targetVendor = metadata?.usbVendorId;
    const targetProduct = metadata?.usbProductId;

    if (targetVendor !== undefined) {
      const match = availablePorts.find((port) => {
        try {
          const info = port.getInfo();
          const vendorMatch = info.usbVendorId === targetVendor;
          const productMatch = targetProduct === undefined || info.usbProductId === targetProduct;
          return vendorMatch && productMatch;
        } catch {
          return false;
        }
      });
      if (match) {
        return match;
      }
    }

    if (availablePorts.length === 1) {
      return availablePorts[0];
    }

    return null;
  }

  /**
   * Finds a candidate device that matches the given connecting SerialPort.
   */
  findMatchingDevice<T extends { metadata?: DeviceMetadata }>(
    port: SerialPort,
    candidates: readonly T[],
  ): T | null {
    if (candidates.length === 0 || port.readable || port.writable) {
      return null;
    }

    let portInfo: SerialPortInfo | undefined;
    try {
      portInfo = port.getInfo();
    } catch {
      portInfo = undefined;
    }

    if (portInfo?.usbVendorId !== undefined) {
      const match = candidates.find(
        (c) =>
          c.metadata?.usbVendorId === portInfo?.usbVendorId &&
          (c.metadata?.usbProductId === undefined ||
            c.metadata?.usbProductId === portInfo?.usbProductId),
      );
      if (match) {
        return match;
      }
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    return null;
  }

  /**
   * Instantiates a WebSerialTransport wrapping the selected SerialPort.
   */
  createTransport(port: SerialPort, config: SerialConfig = DEFAULT_SERIAL_CONFIG): DeviceTransport {
    return new WebSerialTransport(port, config, this);
  }
}
