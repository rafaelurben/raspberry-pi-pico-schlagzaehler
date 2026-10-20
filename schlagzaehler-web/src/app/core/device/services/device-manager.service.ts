import { inject, Injectable, OnDestroy, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { MAX_RETAINED_EVENTS, SerialConfig } from '../../config/serial.config';
import { ConnectionState } from '../models/connection-state.type';
import { DeviceEvent, EventDirection } from '../models/device-event.model';
import { Device, DeviceState, SelectableGameMode } from '../models/device.model';
import { PiezoCaptureResult } from '../models/piezo-capture.model';
import {
  CompanionCommands,
  parseCaptureMessage,
  parseCompanionMessage,
} from '../protocol/companion-protocol';
import { DeviceTransport } from '../transport/device-transport.interface';
import { WebSerialTransportFactory } from '../transport/web-serial-transport-factory.service';

interface ActiveDeviceEntry {
  readonly transport: DeviceTransport;
  readonly subscriptions: Subscription;
}

interface InProgressCapture {
  readonly sampleRateHz: number;
  readonly preSamples: number;
  readonly totalSamples: number;
  readonly baseline: number;
  readonly noise: number;
  readonly threshold: number;
  readonly samples: number[];
  receivedCount: number;
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
   * Completed raw piezo waveform captures in reverse chronological order.
   */
  readonly captures = signal<readonly PiezoCaptureResult[]>([]);

  /**
   * Transfer progress (0..100) for devices currently streaming a raw capture.
   */
  readonly captureProgress = signal<Readonly<Record<string, number>>>({});

  /**
   * Per-device flag indicating whether capture mode should automatically re-arm after each capture completes.
   */
  readonly autoRearmDevices = signal<Readonly<Record<string, boolean>>>({});

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
  private readonly inProgressCaptures = new Map<string, InProgressCapture>();
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
   * Arms raw piezo waveform capture on a device.
   */
  async startCapture(deviceId: string): Promise<void> {
    this.inProgressCaptures.delete(deviceId);
    this.setDeviceCaptureProgress(deviceId, null);
    await this.sendCommand(deviceId, CompanionCommands.captureStart());
  }

  /**
   * Stops/cancels raw piezo waveform capture on a device and disables auto-rearm.
   */
  async stopCapture(deviceId: string): Promise<void> {
    this.setAutoRearm(deviceId, false);
    this.inProgressCaptures.delete(deviceId);
    this.setDeviceCaptureProgress(deviceId, null);
    await this.sendCommand(deviceId, CompanionCommands.captureStop());
  }

  /**
   * Enables or disables automatic re-arming after a capture completes for a device.
   */
  setAutoRearm(deviceId: string, enabled: boolean): void {
    this.autoRearmDevices.update((current) => ({
      ...current,
      [deviceId]: enabled,
    }));
  }

  /**
   * Removes a single capture from the session history.
   */
  removeCapture(captureId: string): void {
    this.captures.update((current) => current.filter((c) => c.id !== captureId));
  }

  /**
   * Clears all recorded captures from the session history.
   */
  clearCaptures(): void {
    this.captures.set([]);
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
    const prevConnectionState = this.getDevice(deviceId)?.state.connectionState;

    if (connectionState !== 'connected') {
      this.inProgressCaptures.delete(deviceId);
      this.setDeviceCaptureProgress(deviceId, null);
    }

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

    if (connectionState === 'connected' && prevConnectionState !== 'connected') {
      void this.sendCommand(deviceId, CompanionCommands.status()).catch((e) =>
        console.error(`Failed to request status from device ${deviceId}:`, e),
      );
    }
  }

  private handleIncomingEvent(deviceId: string, payload: string): void {
    const now = Date.now();
    const captureMsg = parseCaptureMessage(payload);

    if (captureMsg) {
      this.handleCaptureProtocolMessage(deviceId, captureMsg, payload, now);
      return;
    }

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

  private handleCaptureProtocolMessage(
    deviceId: string,
    msg: NonNullable<ReturnType<typeof parseCaptureMessage>>,
    rawPayload: string,
    now: number,
  ): void {
    if (msg.type === 'CAPTURE_START') {
      this.inProgressCaptures.set(deviceId, {
        sampleRateHz: msg.sampleRateHz,
        preSamples: msg.preSamples,
        totalSamples: msg.totalSamples,
        baseline: msg.baseline,
        noise: msg.noise,
        threshold: msg.threshold,
        samples: new Array<number>(msg.totalSamples).fill(msg.baseline),
        receivedCount: 0,
      });
      this.setDeviceCaptureProgress(deviceId, 0);
      this.appendEvent(deviceId, rawPayload, 'received', now);
      return;
    }

    if (msg.type === 'CAPTURE_DATA') {
      const active = this.inProgressCaptures.get(deviceId);
      if (!active) {
        return;
      }
      for (let i = 0; i < msg.values.length; i++) {
        const idx = msg.offset + i;
        if (idx >= 0 && idx < active.totalSamples) {
          active.samples[idx] = msg.values[i];
        }
      }
      active.receivedCount = Math.min(
        active.totalSamples,
        Math.max(active.receivedCount, msg.offset + msg.values.length),
      );
      const pct = Math.min(100, Math.round((active.receivedCount * 100) / active.totalSamples));
      this.setDeviceCaptureProgress(deviceId, pct);
      return;
    }

    if (msg.type === 'CAPTURE_END') {
      const active = this.inProgressCaptures.get(deviceId);
      this.inProgressCaptures.delete(deviceId);
      this.setDeviceCaptureProgress(deviceId, null);
      this.appendEvent(deviceId, rawPayload, 'received', now);

      if (active) {
        let peak = 0;
        for (const v of active.samples) {
          if (v > peak) {
            peak = v;
          }
        }

        const result: PiezoCaptureResult = {
          id: `capture-${this.generateId()}`,
          deviceId,
          deviceName: this.getDeviceName(deviceId),
          timestamp: new Date(now),
          sampleRateHz: active.sampleRateHz,
          preSamples: active.preSamples,
          totalSamples: active.totalSamples,
          baseline: active.baseline,
          noise: active.noise,
          threshold: active.threshold,
          peak,
          samples: active.samples,
        };

        this.captures.update((current) => [result, ...current]);
      }

      if (this.autoRearmDevices()[deviceId]) {
        void this.startCapture(deviceId).catch(() => {
          // Ignore rearm errors if device disconnected
        });
      }
    }
  }

  private setDeviceCaptureProgress(deviceId: string, progress: number | null): void {
    this.captureProgress.update((current) => {
      const next = { ...current };
      if (progress === null) {
        delete next[deviceId];
      } else {
        next[deviceId] = progress;
      }
      return next;
    });
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
