import { inject, Injectable, OnDestroy, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { MAX_RETAINED_EVENTS, SerialConfig } from '../../config/serial.config';
import { ConnectionState } from '../models/connection-state.type';
import { DeviceEvent } from '../models/device-event.model';
import { Device } from '../models/device.model';
import { DeviceTransport } from '../transport/device-transport.interface';
import { WebSerialTransportFactory } from '../transport/web-serial-transport-factory.service';

interface ActiveDeviceEntry {
  readonly transport: DeviceTransport;
  readonly subscriptions: Subscription;
}

@Injectable({ providedIn: 'root' })
export class DeviceManagerService implements OnDestroy {
  private readonly serialFactory = inject(WebSerialTransportFactory);

  /**
   * List of all known devices and their current connection status.
   */
  readonly devices = signal<readonly Device[]>([]);

  /**
   * Log of recent newline-delimited events in reverse chronological order.
   */
  readonly events = signal<readonly DeviceEvent[]>([]);

  /**
   * True while a connection attempt (e.g. device picker or serial port open) is in progress.
   */
  readonly isConnecting = signal<boolean>(false);

  /**
   * Whether the Web Serial API is supported in the current environment.
   */
  readonly isSupported = signal<boolean>(this.serialFactory.isSupported());

  /**
   * Most recent global error message, if any.
   */
  readonly lastError = signal<string | null>(null);

  private readonly activeDevices = new Map<string, ActiveDeviceEntry>();
  private deviceCounter = 0;

  /**
   * Prompts the user to select a Web Serial port, opens it, and registers the device.
   */
  async connectSerialDevice(customConfig?: SerialConfig): Promise<Device | null> {
    if (!this.isSupported()) {
      const errorMsg = 'The Web Serial API is not supported in this browser.';
      this.lastError.set(errorMsg);
      throw new Error(errorMsg);
    }

    this.isConnecting.set(true);
    this.lastError.set(null);

    try {
      const port = await this.serialFactory.requestPort();
      const transport = this.serialFactory.createTransport(port, customConfig);
      return await this.attachDevice(transport);
    } catch (err) {
      this.isConnecting.set(false);

      // Handle user cancellation gracefully without logging an application error
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        return null;
      }

      const message = err instanceof Error ? err.message : String(err);
      this.lastError.set(message);
      throw err;
    }
  }

  /**
   * Attaches any generic DeviceTransport to the manager.
   * Can be used for serial devices as well as future Bluetooth/WebSocket transports.
   */
  async attachDevice(transport: DeviceTransport, preferredName?: string): Promise<Device> {
    this.deviceCounter++;
    const id = `device-${this.generateId()}`;
    const name = preferredName ?? `Device ${this.deviceCounter}`;
    const metadata = transport.getMetadata();

    const device: Device = {
      id,
      name,
      state: 'connecting',
      transportType: transport.transportType,
      metadata,
    };

    this.devices.update((current) => [...current, device]);

    const subscriptions = new Subscription();

    subscriptions.add(
      transport.state$.subscribe((state) => {
        this.updateDeviceState(id, state);
      }),
    );

    subscriptions.add(
      transport.events$.subscribe((payload) => {
        this.handleIncomingEvent(id, payload);
      }),
    );

    subscriptions.add(
      transport.errors$.subscribe((error) => {
        this.handleDeviceError(id, error);
      }),
    );

    this.activeDevices.set(id, { transport, subscriptions });

    try {
      await transport.connect();
      this.isConnecting.set(false);
      return this.getDevice(id) ?? device;
    } catch (err) {
      this.isConnecting.set(false);
      const error = err instanceof Error ? err : new Error(String(err));
      this.handleDeviceError(id, error);
      throw error;
    }
  }

  /**
   * Disconnects an active device, releasing its serial port and resources.
   */
  async disconnectDevice(deviceId: string): Promise<void> {
    const entry = this.activeDevices.get(deviceId);
    if (!entry) {
      this.updateDeviceState(deviceId, 'disconnected');
      return;
    }

    try {
      await entry.transport.disconnect();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.handleDeviceError(deviceId, error);
    } finally {
      entry.subscriptions.unsubscribe();
      this.activeDevices.delete(deviceId);
      this.updateDeviceState(deviceId, 'disconnected');
    }
  }

  /**
   * Disconnects and removes a device entirely from the managed device list.
   */
  async removeDevice(deviceId: string): Promise<void> {
    await this.disconnectDevice(deviceId);
    this.devices.update((devices) => devices.filter((d) => d.id !== deviceId));
  }

  /**
   * Clears all accumulated events from the live event stream.
   */
  clearEvents(): void {
    this.events.set([]);
  }

  /**
   * Retrieves a device by its ID.
   */
  getDevice(deviceId: string): Device | undefined {
    return this.devices().find((d) => d.id === deviceId);
  }

  /**
   * Resolves the human-readable display name for a device ID.
   */
  getDeviceName(deviceId: string): string {
    const device = this.getDevice(deviceId);
    return device ? device.name : deviceId;
  }

  private updateDeviceState(deviceId: string, state: ConnectionState): void {
    this.devices.update((devices) => devices.map((d) => (d.id === deviceId ? { ...d, state } : d)));
  }

  private handleIncomingEvent(deviceId: string, payload: string): void {
    const event: DeviceEvent = {
      id: this.generateId(),
      deviceId,
      timestamp: new Date(),
      payload,
    };

    // Prepend new event (reverse chronological order) and cap at maximum retained events
    this.events.update((current) => [event, ...current].slice(0, MAX_RETAINED_EVENTS));
  }

  private handleDeviceError(deviceId: string, error: Error): void {
    this.devices.update((devices) =>
      devices.map((device) =>
        device.id === deviceId
          ? { ...device, state: 'error', errorMessage: error.message }
          : device,
      ),
    );
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  async ngOnDestroy(): Promise<void> {
    const disconnects = Array.from(this.activeDevices.keys()).map((id) =>
      this.disconnectDevice(id),
    );
    await Promise.allSettled(disconnects);
  }
}
