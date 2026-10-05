import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { DEFAULT_SERIAL_CONFIG, SerialConfig } from '../../config/serial.config';
import { ConnectionState } from '../models/connection-state.type';
import { DeviceMetadata, TransportType } from '../models/device.model';
import { DeviceTransport } from './device-transport.interface';
import { NewlineEventParser } from './newline-event-parser';

/**
 * Web Serial implementation of DeviceTransport.
 * Connects to a W3C Web Serial SerialPort and continuously streams newline-delimited lines.
 */
export class WebSerialTransport implements DeviceTransport {
  readonly transportType: TransportType = 'serial';

  private readonly stateSubject = new BehaviorSubject<ConnectionState>('disconnected');
  private readonly eventsSubject = new Subject<string>();
  private readonly errorsSubject = new Subject<Error>();

  readonly state$: Observable<ConnectionState> = this.stateSubject.asObservable();
  readonly events$: Observable<string> = this.eventsSubject.asObservable();
  readonly errors$: Observable<Error> = this.errorsSubject.asObservable();

  private readonly parser = new NewlineEventParser();
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private readableClosed: Promise<void> | null = null;
  private isDisconnecting = false;
  private isReading = false;

  constructor(
    private readonly port: SerialPort,
    private readonly config: SerialConfig = DEFAULT_SERIAL_CONFIG,
  ) {}

  /**
   * Retrieves USB vendor and product ID from port metadata if available.
   */
  getMetadata(): DeviceMetadata | undefined {
    try {
      const info = this.port.getInfo();
      return {
        usbVendorId: info.usbVendorId,
        usbProductId: info.usbProductId,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Opens the serial port and initiates the read loop.
   */
  async connect(): Promise<void> {
    if (this.stateSubject.value === 'connected' || this.stateSubject.value === 'connecting') {
      return;
    }

    this.stateSubject.next('connecting');
    this.isDisconnecting = false;

    try {
      await this.port.open({
        baudRate: this.config.baudRate,
        dataBits: this.config.dataBits,
        stopBits: this.config.stopBits,
        parity: this.config.parity,
        bufferSize: this.config.bufferSize,
      });

      this.stateSubject.next('connected');
      this.startReading();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.stateSubject.next('error');
      this.errorsSubject.next(error);
      throw error;
    }
  }

  private startReading(): void {
    if (!this.port.readable) {
      const error = new Error('Serial port readable stream is not available');
      this.stateSubject.next('error');
      this.errorsSubject.next(error);
      return;
    }

    this.isReading = true;
    const textDecoder = new TextDecoderStream();
    this.readableClosed = (this.port.readable as ReadableStream<BufferSource>).pipeTo(
      textDecoder.writable,
    );
    this.reader = textDecoder.readable.getReader();

    void this.readLoop();
  }

  private async readLoop(): Promise<void> {
    try {
      while (this.isReading && this.reader) {
        const { value, done } = await this.reader.read();
        if (done) {
          break;
        }
        if (value) {
          const lines = this.parser.push(value);
          for (const line of lines) {
            this.eventsSubject.next(line);
          }
        }
      }
    } catch (err) {
      // If we are disconnecting intentionally, do not report an error
      if (!this.isDisconnecting) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.stateSubject.next('error');
        this.errorsSubject.next(error);
      }
    } finally {
      this.isReading = false;
      this.cleanupReader();

      // If disconnected unexpectedly (not via disconnect()), transition out of connected state
      if (!this.isDisconnecting && this.stateSubject.value === 'connected') {
        this.stateSubject.next('disconnected');
      }
    }
  }

  private cleanupReader(): void {
    if (this.reader) {
      try {
        this.reader.releaseLock();
      } catch {
        // Lock might already be released
      }
      this.reader = null;
    }
  }

  /**
   * Gracefully cancels reading, closes the serial port, and resets state.
   */
  async disconnect(): Promise<void> {
    if (this.stateSubject.value === 'disconnected') {
      return;
    }

    this.isDisconnecting = true;
    this.isReading = false;

    try {
      if (this.reader) {
        try {
          await this.reader.cancel();
        } catch {
          // Ignore cancellation errors
        }
        this.cleanupReader();
      }

      if (this.readableClosed) {
        try {
          await this.readableClosed;
        } catch {
          // Ignore pipe closure rejection
        }
        this.readableClosed = null;
      }

      try {
        await this.port.close();
      } catch {
        // If already closed or detached, ignore
      }

      this.parser.reset();
      this.stateSubject.next('disconnected');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.stateSubject.next('error');
      this.errorsSubject.next(error);
      throw error;
    } finally {
      this.isDisconnecting = false;
    }
  }
}
