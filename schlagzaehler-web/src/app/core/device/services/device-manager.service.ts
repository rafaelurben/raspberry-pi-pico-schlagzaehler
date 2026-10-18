import { inject, Injectable, OnDestroy, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { MAX_RETAINED_EVENTS, SerialConfig } from '../../config/serial.config';
import { ConnectionState } from '../models/connection-state.type';
import { DeviceEvent, EventDirection } from '../models/device-event.model';
import { Device, DeviceState, SelectableGameMode } from '../models/device.model';
import { CompanionCommands, parseCompanionMessage } from '../protocol/companion-protocol';
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
   * List of all known devices and their current connection and game state.
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
  async connectSerialDevice(
    preferredName?: string,
    customConfig?: SerialConfig,
  ): Promise<Device | null> {
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
      const trimmedName = preferredName?.trim();
      return await this.attachDevice(transport, trimmedName || undefined);
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
    const trimmedPreferred = preferredName?.trim();
    const name = trimmedPreferred || `Device ${this.deviceCounter}`;
    const metadata = transport.getMetadata();

    const device = new Device({
      id,
      name,
      state: new DeviceState({ connectionState: 'connecting' }),
      transportType: transport.transportType,
      metadata,
    });

    this.devices.update((current) => [...current, device]);

    const subscriptions = new Subscription();

    subscriptions.add(
      transport.state$.subscribe((connectionState) => {
        this.updateDeviceConnectionState(id, connectionState);
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
   * Reconnects a previously registered device that disconnected or entered an error state.
   */
  async reconnectDevice(deviceId: string): Promise<void> {
    const entry = this.activeDevices.get(deviceId);
    if (!entry) {
      const error = new Error('Device transport is no longer available for reconnection.');
      this.handleDeviceError(deviceId, error);
      throw error;
    }

    this.lastError.set(null);
    this.devices.update((devices) =>
      devices.map((d) =>
        d.id === deviceId
          ? new Device({
              ...d,
              errorMessage: undefined,
              state: new DeviceState({ ...d.state, connectionState: 'connecting' }),
            })
          : d,
      ),
    );

    try {
      await entry.transport.connect();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.handleDeviceError(deviceId, error);
      throw error;
    }
  }

  /**
   * Disconnects an active device, releasing its serial port while keeping it available for reconnection.
   */
  async disconnectDevice(deviceId: string): Promise<void> {
    const entry = this.activeDevices.get(deviceId);
    if (!entry) {
      this.updateDeviceConnectionState(deviceId, 'disconnected');
      return;
    }

    try {
      await entry.transport.disconnect();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.handleDeviceError(deviceId, error);
    } finally {
      this.updateDeviceConnectionState(deviceId, 'disconnected');
    }
  }

  /**
   * Disconnects and removes a device entirely from the managed device list.
   */
  async removeDevice(deviceId: string): Promise<void> {
    await this.disconnectDevice(deviceId);
    const entry = this.activeDevices.get(deviceId);
    if (entry) {
      entry.subscriptions.unsubscribe();
      this.activeDevices.delete(deviceId);
    }
    this.devices.update((devices) => devices.filter((d) => d.id !== deviceId));
  }

  /**
   * Updates the display name of an existing device.
   */
  updateDeviceName(deviceId: string, newName: string): void {
    const trimmed = newName.trim();
    if (!trimmed) {
      return;
    }
    this.devices.update((devices) =>
      devices.map((d) => (d.id === deviceId ? new Device({ ...d, name: trimmed }) : d)),
    );
  }

  /**
   * Sends a raw string command/event to a single connected device and logs it in the event stream.
   */
  async sendCommand(deviceId: string, command: string): Promise<void> {
    const trimmed = command.trim();
    if (!trimmed) {
      return;
    }

    const entry = this.activeDevices.get(deviceId);
    if (!entry) {
      const error = new Error(`Device ${deviceId} is not found.`);
      this.handleDeviceError(deviceId, error);
      throw error;
    }

    try {
      await entry.transport.send(trimmed);
      this.appendEvent(deviceId, trimmed, 'sent');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.handleDeviceError(deviceId, error);
      throw error;
    }
  }

  /**
   * Sends a raw string command/event to one or multiple devices concurrently.
   */
  async sendCommandToDevices(deviceIds: readonly string[], command: string): Promise<void> {
    const trimmed = command.trim();
    if (!trimmed || deviceIds.length === 0) {
      return;
    }

    await Promise.all(deviceIds.map((id) => this.sendCommand(id, trimmed)));
  }

  /**
   * Changes the active game mode on a device.
   */
  async setGameMode(deviceId: string, mode: SelectableGameMode): Promise<void> {
    this.devices.update((devices) =>
      devices.map((d) => {
        if (d.id !== deviceId) {
          return d;
        }
        const defaultParam =
          mode === 'TIMED'
            ? d.state.parameter > 0
              ? d.state.parameter
              : 30
            : mode === 'RACE'
              ? d.state.parameter > 0
                ? d.state.parameter
                : 20
              : 0;
        const remainingMs =
          d.state.gameState === 'RUNNING'
            ? d.state.remainingMs
            : mode === 'TIMED'
              ? defaultParam * 1000
              : 0;
        return new Device({
          ...d,
          state: new DeviceState({
            ...d.state,
            mode,
            parameter: defaultParam,
            remainingMs,
          }),
        });
      }),
    );
    await this.sendCommand(deviceId, CompanionCommands.setMode(mode));
  }

  /**
   * Sets the game mode parameter (duration seconds for TIMED, target hits for RACE) on a device.
   */
  async setGameParameter(deviceId: string, parameter: number): Promise<void> {
    const sanitized = Math.max(1, Math.floor(parameter));
    this.devices.update((devices) =>
      devices.map((d) => {
        if (d.id !== deviceId) {
          return d;
        }
        const remainingMs =
          d.state.gameState !== 'RUNNING' && d.state.mode === 'TIMED'
            ? sanitized * 1000
            : d.state.remainingMs;
        return new Device({
          ...d,
          state: new DeviceState({
            ...d.state,
            parameter: sanitized,
            remainingMs,
          }),
        });
      }),
    );
    await this.sendCommand(deviceId, CompanionCommands.setParameter(sanitized));
  }

  /**
   * Resets the current game on a device.
   */
  async resetGame(deviceId: string): Promise<void> {
    await this.sendCommand(deviceId, CompanionCommands.reset());
  }

  /**
   * Starts the game on a device.
   */
  async startGame(deviceId: string): Promise<void> {
    await this.sendCommand(deviceId, CompanionCommands.start());
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

  private updateDeviceConnectionState(deviceId: string, connectionState: ConnectionState): void {
    this.devices.update((devices) =>
      devices.map((d) => {
        if (d.id !== deviceId) {
          return d;
        }
        const isConnected = connectionState === 'connected';
        const isReady =
          isConnected &&
          d.state.sensorState !== 'ERROR' &&
          (d.state.gameState === 'READY' ||
            d.state.gameState === 'RUNNING' ||
            d.state.sensorState === 'ARMED');
        return new Device({
          ...d,
          errorMessage: isConnected ? undefined : d.errorMessage,
          state: new DeviceState({
            ...d.state,
            connectionState,
            isReady,
            lastTimerUpdatedAt: isConnected ? d.state.lastTimerUpdatedAt : null,
          }),
        });
      }),
    );
  }

  private handleIncomingEvent(deviceId: string, payload: string): void {
    const now = Date.now();
    this.devices.update((devices) =>
      devices.map((d) =>
        d.id === deviceId
          ? new Device({
              ...d,
              state: parseCompanionMessage(payload, d.state, now),
            })
          : d,
      ),
    );

    this.appendEvent(deviceId, payload, 'received', now);
  }

  private appendEvent(
    deviceId: string,
    payload: string,
    direction: EventDirection,
    now: number = Date.now(),
  ): void {
    const event: DeviceEvent = {
      id: this.generateId(),
      deviceId,
      timestamp: new Date(now),
      payload,
      direction,
    };

    // Prepend new event (reverse chronological order) and cap at maximum retained events
    this.events.update((current) => [event, ...current].slice(0, MAX_RETAINED_EVENTS));
  }

  private handleDeviceError(deviceId: string, error: Error): void {
    this.devices.update((devices) =>
      devices.map((device) =>
        device.id === deviceId
          ? new Device({
              ...device,
              errorMessage: error.message,
              state: new DeviceState({
                ...device.state,
                connectionState: 'error',
                isReady: false,
                lastTimerUpdatedAt: null,
              }),
            })
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
    const ids = Array.from(this.activeDevices.keys());
    const disconnects = ids.map(async (id) => {
      await this.disconnectDevice(id);
      const entry = this.activeDevices.get(id);
      if (entry) {
        entry.subscriptions.unsubscribe();
        this.activeDevices.delete(id);
      }
    });
    await Promise.allSettled(disconnects);
  }
}
