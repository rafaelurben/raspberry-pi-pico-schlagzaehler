import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ConnectionState } from '../models/connection-state.type';
import { DeviceMetadata, TransportType } from '../models/device.model';
import {
  BinaryCommandType,
  BinaryFrame,
  BinaryMessageType,
  SYNC_BYTE_0,
  SYNC_BYTE_1,
} from '../protocol/binary/binary-protocol.types';
import { DeviceTransport, TransportEvent } from '../transport/device-transport.interface';
import { WebSerialTransportFactory } from '../transport/web-serial-transport-factory.service';
import { DeviceManagerService } from './device-manager.service';

class MockDeviceTransport implements DeviceTransport {
  readonly transportType: TransportType = 'serial';
  readonly stateSubject = new BehaviorSubject<ConnectionState>('disconnected');
  readonly eventsSubject = new Subject<TransportEvent>();
  readonly errorsSubject = new Subject<Error>();

  readonly state$ = this.stateSubject.asObservable();
  readonly events$ = this.eventsSubject.asObservable();
  readonly errors$ = this.errorsSubject.asObservable();

  connectCalls = 0;
  disconnectCalls = 0;
  shouldFailConnect = false;
  sentPayloads: (string | Uint8Array)[] = [];

  constructor(
    private readonly metadata?: DeviceMetadata,
    private port?: SerialPort,
    private readonly factory?: MockWebSerialTransportFactory,
  ) {}

  getPort(): SerialPort | undefined {
    return this.port;
  }

  getMetadata(): DeviceMetadata | undefined {
    return this.metadata ?? { usbVendorId: 0x2e8a, usbProductId: 0x000a };
  }

  async reconnectWithPort(newPort: SerialPort): Promise<void> {
    this.port = newPort;
    await this.connect();
  }

  async connect(): Promise<void> {
    this.connectCalls++;
    if (this.shouldFailConnect) {
      if (this.factory) {
        const ports = await this.factory.getPorts();
        const matched = this.factory.findMatchingPort(ports, this.metadata);
        if (matched) {
          this.port = matched;
          this.shouldFailConnect = false;
          this.stateSubject.next('connected');
          return;
        }

        try {
          const picked = await this.factory.requestPort();
          this.port = picked;
          this.shouldFailConnect = false;
          this.stateSubject.next('connected');
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === 'NotFoundError') {
            this.stateSubject.next('disconnected');
            return;
          }
          this.stateSubject.next('error');
          throw err;
        }
      }
      this.stateSubject.next('error');
      throw new Error('Failed to open port');
    }
    this.stateSubject.next('connected');
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls++;
    this.stateSubject.next('disconnected');
  }

  async send(data: string | Uint8Array): Promise<void> {
    this.sentPayloads.push(data);
  }
}

function emitHandshakeAck(transport: MockDeviceTransport, statusCode = 0, protoMajor = 0): void {
  const ackPayload = new Uint8Array(20);
  const ackView = new DataView(ackPayload.buffer);
  ackView.setUint8(0, 1); // hwGen
  ackView.setUint8(1, 1); // hwRev
  ackView.setUint8(2, protoMajor); // protoMajor
  ackView.setUint8(3, 0); // protoMinor
  ackView.setUint8(4, 0); // fwMajor
  ackView.setUint8(5, 3); // fwMinor
  ackView.setUint8(6, 0); // fwPatch
  ackView.setUint8(7, statusCode); // statusCode
  ackView.setUint32(16, 9999, true); // uptimeMs

  const ackFrame: BinaryFrame = {
    type: BinaryMessageType.MSG_HANDSHAKE_ACK,
    flags: 0,
    seq: 1,
    payload: ackPayload,
  };
  transport.eventsSubject.next({
    type: 'binary',
    content: ackFrame,
  });
}

class MockWebSerialTransportFactory {
  supported = true;
  transportsToReturn: MockDeviceTransport[] = [];
  requestPortError: Error | null = null;
  portsToReturn: SerialPort[] = [];
  requestPortCalls = 0;
  getPortsCalls = 0;
  readonly connectSubject = new Subject<SerialPort>();
  readonly connect$ = this.connectSubject.asObservable();

  isSupported(): boolean {
    return this.supported;
  }

  async getPorts(): Promise<SerialPort[]> {
    this.getPortsCalls++;
    return this.portsToReturn;
  }

  async requestPort(): Promise<SerialPort> {
    this.requestPortCalls++;
    if (this.requestPortError) {
      throw this.requestPortError;
    }
    return {} as SerialPort;
  }

  findMatchingPort(ports: readonly SerialPort[], metadata?: DeviceMetadata): SerialPort | null {
    const available = ports.filter((p) => !p.readable && !p.writable);
    if (available.length === 0) return null;
    if (metadata?.usbVendorId !== undefined) {
      const match = available.find((p) => {
        try {
          const info = p.getInfo();
          return (
            info.usbVendorId === metadata.usbVendorId &&
            (metadata.usbProductId === undefined || info.usbProductId === metadata.usbProductId)
          );
        } catch {
          return false;
        }
      });
      if (match) return match;
    }
    return available[0] ?? null;
  }

  findMatchingDevice<T extends { metadata?: DeviceMetadata }>(
    port: SerialPort,
    candidates: readonly T[],
  ): T | null {
    if (candidates.length === 0 || port.readable || port.writable) return null;
    try {
      const info = port.getInfo();
      if (info.usbVendorId !== undefined) {
        const match = candidates.find(
          (c) =>
            c.metadata?.usbVendorId === info.usbVendorId &&
            (c.metadata?.usbProductId === undefined ||
              c.metadata?.usbProductId === info.usbProductId),
        );
        if (match) return match;
      }
    } catch {
      // Ignore
    }
    return candidates[0] ?? null;
  }

  createTransport(port?: SerialPort): DeviceTransport {
    return this.transportsToReturn.shift() ?? new MockDeviceTransport(undefined, port, this);
  }
}

describe('DeviceManagerService', () => {
  let service: DeviceManagerService;
  let mockFactory: MockWebSerialTransportFactory;

  const setupService = (factoryOverride?: MockWebSerialTransportFactory) => {
    mockFactory = factoryOverride ?? new MockWebSerialTransportFactory();
    TestBed.configureTestingModule({
      providers: [
        DeviceManagerService,
        { provide: WebSerialTransportFactory, useValue: mockFactory },
      ],
    });
    service = TestBed.inject(DeviceManagerService);
  };

  it('should initialize with empty devices and events', () => {
    setupService();
    expect(service.devices()).toEqual([]);
    expect(service.events()).toEqual([]);
    expect(service.isConnecting()).toBe(false);
    expect(service.isSupported()).toBe(true);
  });

  it('should connect a serial device with state.connectionState "connecting" and UNKNOWN gameState until HANDSHAKE_ACK', async () => {
    setupService();
    const transport = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport];

    const device = await service.connectSerialDevice();

    expect(device).toBeDefined();
    expect(device?.name).toBe('Device 1');
    expect(device?.state.connectionState).toBe('connecting');
    expect(device?.state.gameState).toBe('UNKNOWN');
    expect(device?.state.isReady).toBe(false);
    expect(device?.transportType).toBe('serial');
    expect(service.devices()).toHaveLength(1);
    expect(service.isConnecting()).toBe(false);
    expect(transport.connectCalls).toBe(1);
    expect(transport.sentPayloads).toHaveLength(1);
    const sent = transport.sentPayloads[0] as Uint8Array;
    expect(sent[0]).toBe(SYNC_BYTE_0);
    expect(sent[1]).toBe(SYNC_BYTE_1);
    expect(sent[3]).toBe(BinaryCommandType.CMD_HANDSHAKE);

    // Verify commands cannot be sent while in connecting state
    await expect(service.setGameMode(device!.id, 'TIMED')).rejects.toThrow('handshake pending');

    // Acknowledge handshake
    emitHandshakeAck(transport);

    expect(service.getDevice(device!.id)?.state.connectionState).toBe('connected');
    await service.setGameMode(device!.id, 'TIMED');
    expect(service.getDevice(device!.id)?.state.mode).toBe('TIMED');
  });

  it('should set device connectionState to error if HANDSHAKE_ACK reports non-zero status', async () => {
    setupService();
    const transport = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport];

    const dev = await service.connectSerialDevice('Pico Fail');
    expect(dev?.state.connectionState).toBe('connecting');

    emitHandshakeAck(transport, 1); // ERR_VERSION_MISMATCH
    const updated = service.getDevice(dev!.id);
    expect(updated?.state.connectionState).toBe('error');
    expect(updated?.errorMessage).toContain('Handshake rejected: status code 1');
  });

  it('should allow specifying a custom device name on connect and modifying it later', async () => {
    setupService();
    const transport = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport];

    const device = await service.connectSerialDevice('Pico Alpha');
    expect(device?.name).toBe('Pico Alpha');

    service.updateDeviceName(device!.id, 'Pico Prime');
    expect(service.getDevice(device!.id)?.name).toBe('Pico Prime');
  });

  it('should handle user cancelling the device picker without crashing or creating a device', async () => {
    setupService();
    const cancelError = new DOMException('The user cancelled the prompt.', 'NotFoundError');
    mockFactory.requestPortError = cancelError;

    const result = await service.connectSerialDevice();

    expect(result).toBeNull();
    expect(service.devices()).toHaveLength(0);
    expect(service.isConnecting()).toBe(false);
    expect(service.lastError()).toBeNull();
  });

  it('should support multiple simultaneous devices independently', async () => {
    setupService();
    const transport1 = new MockDeviceTransport();
    const transport2 = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport1, transport2];

    const device1 = await service.connectSerialDevice();
    const device2 = await service.connectSerialDevice();

    expect(device1?.name).toBe('Device 1');
    expect(device2?.name).toBe('Device 2');
    expect(service.devices()).toHaveLength(2);
    expect(service.devices()[0].id).toBe(device1?.id);
    expect(service.devices()[1].id).toBe(device2?.id);
  });

  it('should associate received events with the correct device and update device.state from protocol messages', async () => {
    setupService();
    const transport1 = new MockDeviceTransport();
    const transport2 = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport1, transport2];

    const device1 = await service.connectSerialDevice();
    const device2 = await service.connectSerialDevice();

    transport1.eventsSubject.next({ type: 'ascii', content: 'MODE active=TIMED param=45' });
    transport2.eventsSubject.next({ type: 'ascii', content: 'SCORE value=10' });
    transport1.eventsSubject.next({ type: 'ascii', content: 'SCORE value=7' });

    const receivedEvents = service.events().filter((e) => e.direction === 'received');
    expect(receivedEvents).toHaveLength(3);

    expect(receivedEvents[0].deviceId).toBe(device1?.id);
    expect(receivedEvents[0].payload).toBe('SCORE value=7');

    expect(receivedEvents[1].deviceId).toBe(device2?.id);
    expect(receivedEvents[1].payload).toBe('SCORE value=10');

    expect(receivedEvents[2].deviceId).toBe(device1?.id);
    expect(receivedEvents[2].payload).toBe('MODE active=TIMED param=45');

    const d1 = service.getDevice(device1!.id);
    const d2 = service.getDevice(device2!.id);
    expect(d1?.state.mode).toBe('TIMED');
    expect(d1?.state.parameter).toBe(45);
    expect(d1?.state.score).toBe(7);
    expect(d2?.state.score).toBe(10);
  });

  it('should isolate errors to the affected device without impacting other devices', async () => {
    setupService();
    const transport1 = new MockDeviceTransport();
    const transport2 = new MockDeviceTransport();
    const transport3 = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport1, transport2, transport3];

    const dev1 = await service.connectSerialDevice();
    const dev2 = await service.connectSerialDevice();
    const dev3 = await service.connectSerialDevice();

    emitHandshakeAck(transport1);
    emitHandshakeAck(transport2);
    emitHandshakeAck(transport3);

    transport2.errorsSubject.next(new Error('Device 2 serial lost'));

    const devices = service.devices();
    const d1 = devices.find((d) => d.id === dev1?.id);
    const d2 = devices.find((d) => d.id === dev2?.id);
    const d3 = devices.find((d) => d.id === dev3?.id);

    expect(d1?.state.connectionState).toBe('connected');
    expect(d2?.state.connectionState).toBe('error');
    expect(d2?.errorMessage).toBe('Device 2 serial lost');
    expect(d3?.state.connectionState).toBe('connected');
  });

  it('should disconnect an individual device and allow reconnecting it', async () => {
    setupService();
    const transport1 = new MockDeviceTransport();
    const transport2 = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport1, transport2];

    const dev1 = await service.connectSerialDevice();
    const dev2 = await service.connectSerialDevice();
    emitHandshakeAck(transport1);
    emitHandshakeAck(transport2);

    await service.disconnectDevice(dev1!.id);

    expect(transport1.disconnectCalls).toBe(1);
    expect(transport2.disconnectCalls).toBe(0);
    expect(service.getDevice(dev1!.id)?.state.connectionState).toBe('disconnected');
    expect(service.getDevice(dev2!.id)?.state.connectionState).toBe('connected');

    await service.reconnectDevice(dev1!.id);
    expect(transport1.connectCalls).toBe(2);
    expect(service.getDevice(dev1!.id)?.state.connectionState).toBe('connecting');
    emitHandshakeAck(transport1);
    expect(service.getDevice(dev1!.id)?.state.connectionState).toBe('connected');
  });

  it('should set error state if entry.transport.connect() fails on reconnect', async () => {
    setupService();
    const transport1 = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport1];

    const dev = await service.connectSerialDevice();
    const devId = dev!.id;

    await service.disconnectDevice(devId);
    transport1.shouldFailConnect = true;

    await expect(service.reconnectDevice(devId)).rejects.toThrow('Failed to open port');
    expect(service.getDevice(devId)?.state.connectionState).toBe('error');
    expect(service.getDevice(devId)?.errorMessage).toBe('Failed to open port');
  });

  it('should throw error when reconnecting a non-existent device ID', async () => {
    setupService();
    await expect(service.reconnectDevice('unknown-id')).rejects.toThrow(
      'Device unknown-id is not found.',
    );
  });

  it('should throw error if device has no active transport entry', async () => {
    setupService();
    const transport1 = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport1];

    const dev = await service.connectSerialDevice('Device X');
    const devId = dev!.id;
    emitHandshakeAck(transport1);

    // Manually delete active transport entry to simulate orphaned/lost transport
    (service as unknown as { activeDevices: Map<string, unknown> }).activeDevices.delete(devId);

    await expect(service.reconnectDevice(devId)).rejects.toThrow(
      `Device ${devId} has no active transport.`,
    );
    expect(service.getDevice(devId)?.state.connectionState).toBe('error');
  });

  it('should automatically reconnect unintentionally disconnected device when serial connect event fires', async () => {
    setupService();
    const transport1 = new MockDeviceTransport({ usbVendorId: 0x2e8a, usbProductId: 0x000a });
    mockFactory.transportsToReturn = [transport1];

    const dev = await service.connectSerialDevice('Pico Unit');
    const devId = dev!.id;
    emitHandshakeAck(transport1);
    expect(service.getDevice(devId)?.state.connectionState).toBe('connected');

    // Simulate unexpected disconnect (e.g. cable pulled, state emits 'disconnected' without calling disconnectDevice)
    transport1.stateSubject.next('disconnected');
    expect(service.getDevice(devId)?.state.connectionState).toBe('disconnected');

    // User plugs USB cable back in: connect event fires on navigator.serial
    const reconnectedPort = {
      getInfo: () => ({ usbVendorId: 0x2e8a, usbProductId: 0x000a }),
      readable: null,
      writable: null,
    } as unknown as SerialPort;

    mockFactory.connectSubject.next(reconnectedPort);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Automatically reconnected via transport's reconnectWithPort
    expect(transport1.connectCalls).toBe(2);
    expect(transport1.getPort()).toBe(reconnectedPort);
    expect(service.getDevice(devId)?.state.connectionState).toBe('connecting');
    emitHandshakeAck(transport1);
    expect(service.getDevice(devId)?.state.connectionState).toBe('connected');
  });

  it('should NOT automatically reconnect a device that was manually disconnected via disconnectDevice()', async () => {
    setupService();
    const transport1 = new MockDeviceTransport({ usbVendorId: 0x2e8a, usbProductId: 0x000a });
    mockFactory.transportsToReturn = [transport1];

    const dev = await service.connectSerialDevice();
    const devId = dev!.id;
    emitHandshakeAck(transport1);

    // Explicit manual disconnect
    await service.disconnectDevice(devId);
    expect(service.getDevice(devId)?.state.connectionState).toBe('disconnected');

    // Serial connect event fires for the port
    const port = {
      getInfo: () => ({ usbVendorId: 0x2e8a, usbProductId: 0x000a }),
      readable: null,
      writable: null,
    } as unknown as SerialPort;

    mockFactory.connectSubject.next(port);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Should NOT have attempted reconnection
    expect(transport1.connectCalls).toBe(1);
    expect(service.getDevice(devId)?.state.connectionState).toBe('disconnected');
  });

  it('should clear manual disconnect status when manually reconnecting so future unexpected disconnects auto-reconnect', async () => {
    setupService();
    const transport1 = new MockDeviceTransport({ usbVendorId: 0x2e8a, usbProductId: 0x000a });
    mockFactory.transportsToReturn = [transport1];

    const dev = await service.connectSerialDevice();
    const devId = dev!.id;
    emitHandshakeAck(transport1);

    // 1. Manually disconnect
    await service.disconnectDevice(devId);
    expect(service.getDevice(devId)?.state.connectionState).toBe('disconnected');

    // 2. User manually reconnects
    await service.reconnectDevice(devId);
    expect(transport1.connectCalls).toBe(2);
    expect(service.getDevice(devId)?.state.connectionState).toBe('connecting');
    emitHandshakeAck(transport1);
    expect(service.getDevice(devId)?.state.connectionState).toBe('connected');

    // 3. Now an unexpected disconnect occurs
    transport1.stateSubject.next('disconnected');
    expect(service.getDevice(devId)?.state.connectionState).toBe('disconnected');

    // 4. Re-plug USB -> should auto-reconnect!
    const port = {
      getInfo: () => ({ usbVendorId: 0x2e8a, usbProductId: 0x000a }),
      readable: null,
      writable: null,
    } as unknown as SerialPort;

    mockFactory.connectSubject.next(port);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(transport1.connectCalls).toBe(3);
    expect(transport1.getPort()).toBe(port);
    expect(service.getDevice(devId)?.state.connectionState).toBe('connecting');
    emitHandshakeAck(transport1);
    expect(service.getDevice(devId)?.state.connectionState).toBe('connected');
  });

  it('should match the correct device by USB vendor and product ID during auto-reconnect with multiple candidates', async () => {
    setupService();
    const transportA = new MockDeviceTransport({ usbVendorId: 0x2e8a, usbProductId: 0x000a });
    const transportB = new MockDeviceTransport({ usbVendorId: 0x1234, usbProductId: 0x5678 });
    mockFactory.transportsToReturn = [transportA, transportB];

    const devA = await service.connectSerialDevice('Target A');
    const devB = await service.connectSerialDevice('Target B');
    emitHandshakeAck(transportA);
    emitHandshakeAck(transportB);

    // Both disconnect unexpectedly
    transportA.stateSubject.next('disconnected');
    transportB.stateSubject.next('disconnected');

    // Only device B is re-plugged
    const portB = {
      getInfo: () => ({ usbVendorId: 0x1234, usbProductId: 0x5678 }),
      readable: null,
      writable: null,
    } as unknown as SerialPort;

    mockFactory.connectSubject.next(portB);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Only Device B should be reconnected
    expect(transportB.connectCalls).toBe(2);
    expect(transportB.getPort()).toBe(portB);
    expect(transportA.connectCalls).toBe(1);
    expect(service.getDevice(devB!.id)?.state.connectionState).toBe('connecting');
    emitHandshakeAck(transportB);
    expect(service.getDevice(devB!.id)?.state.connectionState).toBe('connected');
    expect(service.getDevice(devA!.id)?.state.connectionState).toBe('disconnected');
  });

  it('should send commands to one or multiple devices and log sent events', async () => {
    setupService();
    const transport1 = new MockDeviceTransport();
    const transport2 = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport1, transport2];

    const dev1 = await service.connectSerialDevice();
    const dev2 = await service.connectSerialDevice();
    emitHandshakeAck(transport1);
    emitHandshakeAck(transport2);

    transport1.sentPayloads = [];
    transport2.sentPayloads = [];
    service.clearEvents();

    await service.setGameMode(dev1!.id, 'RACE');
    expect(transport1.sentPayloads).toEqual(['MODE:RACE']);
    expect(service.getDevice(dev1!.id)?.state.mode).toBe('RACE');

    await service.setGameParameter(dev1!.id, 40);
    expect(transport1.sentPayloads).toEqual(['MODE:RACE', 'PARAM:40']);
    expect(service.getDevice(dev1!.id)?.state.parameter).toBe(40);

    await service.resetGame(dev2!.id);
    expect(transport2.sentPayloads).toEqual(['RESET']);

    await service.calibrateDevice(dev1!.id);
    expect(transport1.sentPayloads).toContain('CALIB');

    await service.sendCommandToDevices([dev1!.id, dev2!.id], { type: 'CALIBRATE' });
    expect(transport1.sentPayloads.filter((p) => p === 'CALIB')).toHaveLength(2);
    expect(transport2.sentPayloads).toContain('CALIB');

    const sentEvents = service.events().filter((e) => e.direction === 'sent');
    expect(sentEvents).toHaveLength(6);
    expect(sentEvents.map((e) => e.payload)).toContain('PARAM:40');
    expect(sentEvents.map((e) => e.payload)).toContain('MODE:RACE');
    expect(sentEvents.map((e) => e.payload)).toContain('RESET');
    expect(sentEvents.map((e) => e.payload)).toContain('CALIB');
  });

  it('should remove a device completely from the list', async () => {
    setupService();
    const transport = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport];

    const dev = await service.connectSerialDevice();
    expect(service.devices()).toHaveLength(1);

    await service.removeDevice(dev!.id);
    expect(service.devices()).toHaveLength(0);
    expect(transport.disconnectCalls).toBe(1);
  });

  it('should clear events', async () => {
    setupService();
    const transport = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport];

    await service.connectSerialDevice();
    service.clearEvents();
    transport.eventsSubject.next({ type: 'ascii', content: 'SCORE value=1' });
    expect(service.events()).toHaveLength(1);

    service.clearEvents();
    expect(service.events()).toHaveLength(0);
  });

  it('should automatically send CMD_HANDSHAKE upon device connection and reconnection', async () => {
    setupService();
    const transport = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport];

    const device = await service.connectSerialDevice();
    expect(transport.sentPayloads).toHaveLength(1);
    const sent1 = transport.sentPayloads[0] as Uint8Array;
    expect(sent1[0]).toBe(SYNC_BYTE_0);
    expect(sent1[1]).toBe(SYNC_BYTE_1);
    expect(sent1[3]).toBe(BinaryCommandType.CMD_HANDSHAKE);

    transport.sentPayloads = [];
    await service.disconnectDevice(device!.id);
    await service.reconnectDevice(device!.id);
    expect(transport.sentPayloads).toHaveLength(1);
    const sent2 = transport.sentPayloads[0] as Uint8Array;
    expect(sent2[3]).toBe(BinaryCommandType.CMD_HANDSHAKE);
  });

  it('should reject connection when Web Serial is not supported', async () => {
    const unsupportedFactory = new MockWebSerialTransportFactory();
    unsupportedFactory.supported = false;
    setupService(unsupportedFactory);

    expect(service.isSupported()).toBe(false);
    await expect(service.connectSerialDevice()).rejects.toThrow(
      'The Web Serial API is not supported in this browser.',
    );
  });

  it('should arm capture, assemble CAPTURE_START/DATA/END chunks, track progress, and support auto-rearm', async () => {
    setupService();
    const transport = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport];

    const dev = await service.connectSerialDevice('Pico Target');
    const deviceId = dev!.id;
    emitHandshakeAck(transport);

    service.setAutoRearm(deviceId, true);
    await service.startCapture(deviceId);
    expect(transport.sentPayloads).toContain('CAPTURE:START');

    transport.eventsSubject.next({ type: 'ascii', content: 'SENSOR status=CAPTURE_ARMED' });
    expect(service.getDevice(deviceId)?.state.sensorState).toBe('CAPTURE_ARMED');

    transport.eventsSubject.next({ type: 'ascii', content: 'SENSOR status=CAPTURING' });
    expect(service.getDevice(deviceId)?.state.sensorState).toBe('CAPTURING');

    transport.eventsSubject.next({
      type: 'ascii',
      content: 'CALIB success=1 target=0 repeated=1 baseline=1980 noise=3 threshold=2010',
    });
    transport.eventsSubject.next({
      type: 'ascii',
      content: 'CAPTURE_START rate=10000 pre=2 count=6 target=0',
    });
    expect(service.captureProgress()[deviceId]).toBe(0);

    transport.eventsSubject.next({
      type: 'ascii',
      content: 'CAPTURE_DATA offset=0 values=1979,1981,2450',
    });
    expect(service.captureProgress()[deviceId]).toBe(50);

    transport.eventsSubject.next({
      type: 'ascii',
      content: 'CAPTURE_DATA offset=3 values=2200,2050,1982',
    });
    expect(service.captureProgress()[deviceId]).toBe(100);

    transport.eventsSubject.next({
      type: 'ascii',
      content: 'CAPTURE_END count=6',
    });
    expect(service.captureProgress()[deviceId]).toBeUndefined();

    const captures = service.captures();
    expect(captures).toHaveLength(1);
    expect(captures[0].deviceId).toBe(deviceId);
    expect(captures[0].sampleRateHz).toBe(10000);
    expect(captures[0].preSamples).toBe(2);
    expect(captures[0].totalSamples).toBe(6);
    expect(captures[0].sensors).toHaveLength(1);
    expect(captures[0].sensors[0].baseline).toBe(1980);
    expect(captures[0].sensors[0].noise).toBe(3);
    expect(captures[0].sensors[0].threshold).toBe(2010);
    expect(captures[0].peak).toBe(2450);
    expect(captures[0].samples).toEqual([1979, 1981, 2450, 2200, 2050, 1982]);

    // Verify CAPTURE_DATA lines are excluded from the live events log
    const receivedPayloads = service
      .events()
      .filter((e) => e.direction === 'received')
      .map((e) => e.payload);
    expect(receivedPayloads).toContain('CAPTURE_START rate=10000 pre=2 count=6 target=0');
    expect(receivedPayloads).toContain('CAPTURE_END count=6');
    expect(receivedPayloads.some((p) => p.startsWith('CAPTURE_DATA'))).toBe(false);

    // Auto-rearm should have sent another CAPTURE:START command
    expect(transport.sentPayloads.filter((p) => p === 'CAPTURE:START')).toHaveLength(2);

    // Stop capture should disable auto-rearm and send CAPTURE:STOP
    await service.stopCapture(deviceId);
    expect(service.autoRearmDevices()[deviceId]).toBe(false);
    expect(transport.sentPayloads).toContain('CAPTURE:STOP');
  });

  it('should support target-selected capture (e.g. sensor 1 or all) and retain target across auto-rearm', async () => {
    setupService();
    const transport = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport];

    const dev = await service.connectSerialDevice('Pico Target');
    const deviceId = dev!.id;
    emitHandshakeAck(transport);

    service.setAutoRearm(deviceId, true);
    await service.startCapture(deviceId, 1);
    expect(transport.sentPayloads).toContain('CAPTURE:START:1');

    transport.eventsSubject.next({
      type: 'ascii',
      content: 'CALIB success=1 target=1 repeated=false baseline=1980 noise=3 threshold=2010',
    });
    transport.eventsSubject.next({
      type: 'ascii',
      content: 'CAPTURE_START rate=10000 pre=2 count=6 target=1',
    });
    transport.eventsSubject.next({
      type: 'ascii',
      content: 'CAPTURE_DATA offset=0 values=1979,1981,2450,2200,2050,1982',
    });
    transport.eventsSubject.next({
      type: 'ascii',
      content: 'CAPTURE_END count=6',
    });

    // Auto-rearm should re-issue CAPTURE:START:1
    expect(transport.sentPayloads.filter((p) => p === 'CAPTURE:START:1')).toHaveLength(2);
    expect(service.captures()[0].target).toBe(1);
  });

  it('should handle incoming binary frames and update device state, metadata, and event log', async () => {
    setupService();
    const transport = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport];

    const dev = await service.connectSerialDevice('Pico Binary');
    const deviceId = dev!.id;

    // 1. MSG_HANDSHAKE_ACK
    const ackPayload = new Uint8Array(20);
    const ackView = new DataView(ackPayload.buffer);
    ackView.setUint8(0, 1); // hwGen
    ackView.setUint8(1, 1); // hwRev
    ackView.setUint8(2, 1); // protoMajor
    ackView.setUint8(3, 0); // protoMinor
    ackView.setUint8(4, 0); // fwMajor
    ackView.setUint8(5, 3); // fwMinor
    ackView.setUint8(6, 0); // fwPatch
    ackView.setUint32(16, 9999, true); // uptimeMs

    const ackFrame: BinaryFrame = {
      type: BinaryMessageType.MSG_HANDSHAKE_ACK,
      flags: 0,
      seq: 1,
      payload: ackPayload,
    };
    transport.eventsSubject.next({
      type: 'binary',
      content: ackFrame,
    });

    const updatedDev = service.getDevice(deviceId);
    expect(updatedDev?.state.fwVersion).toBe('0.3.0');
    expect(updatedDev?.state.uptimeMs).toBe(9999);
    expect(updatedDev?.metadata?.fwVersion).toBe('0.3.0');

    // 2. MSG_SCORE
    const scorePayload = new Uint8Array(4);
    new DataView(scorePayload.buffer).setUint32(0, 42, true);
    transport.eventsSubject.next({
      type: 'binary',
      content: {
        type: BinaryMessageType.MSG_SCORE,
        flags: 0,
        seq: 2,
        payload: scorePayload,
      },
    });
    expect(service.getDevice(deviceId)?.state.score).toBe(42);

    // 3. MSG_HIT_DETECTED
    const hitPayload = new Uint8Array(16);
    const hitView = new DataView(hitPayload.buffer);
    hitView.setUint32(0, 1, true); // hitId
    hitView.setUint16(4, 2150, true); // peak
    hitView.setUint16(6, 300, true); // intensity
    hitView.setUint8(8, 0); // sensorId
    transport.eventsSubject.next({
      type: 'binary',
      content: {
        type: BinaryMessageType.MSG_HIT_DETECTED,
        flags: 0,
        seq: 3,
        payload: hitPayload,
      },
    });
    const latestEvent = service.events()[0];
    expect(latestEvent.payload).toBe('HIT id=1 target=0 peak=2150 intensity=300');
  });

  it('should maintain cached per-sensor calibrations and apply them to binary waveform captures', async () => {
    setupService();
    const transport = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport];

    const dev = await service.connectSerialDevice('Pico Calib');
    const deviceId = dev!.id;

    // Receive MSG_CALIBRATION_RESULT for sensor 0
    const calibPayload = new Uint8Array(8);
    const calibView = new DataView(calibPayload.buffer);
    calibView.setUint8(0, 0); // flags: repeated = false, ignored = false
    calibView.setUint8(1, 0); // sensorId = 0
    calibView.setUint16(2, 1850, true); // baseline
    calibView.setUint16(4, 12, true); // noise
    calibView.setUint16(6, 1910, true); // threshold

    transport.eventsSubject.next({
      type: 'binary',
      content: {
        type: BinaryMessageType.MSG_CALIBRATION_RESULT,
        flags: 0,
        seq: 1,
        payload: calibPayload,
      },
    });

    const cached = service.getSensorCalibration(deviceId, 0);
    expect(cached).toBeDefined();
    expect(cached?.baseline).toBe(1850);
    expect(cached?.noise).toBe(12);
    expect(cached?.threshold).toBe(1910);

    // Stream binary capture (MSG_CAPTURE_START without baseline/noise/threshold)
    const capStartPayload = new Uint8Array(9);
    const capStartView = new DataView(capStartPayload.buffer);
    capStartView.setUint32(0, 10000, true);
    capStartView.setUint16(4, 2, true);
    capStartView.setUint16(6, 4, true);
    capStartView.setUint8(8, 0); // target 0

    transport.eventsSubject.next({
      type: 'binary',
      content: {
        type: BinaryMessageType.MSG_CAPTURE_START,
        flags: 0,
        seq: 2,
        payload: capStartPayload,
      },
    });

    // MSG_CAPTURE_DATA with 4 uint16 samples: [1850, 1852, 2200, 1860]
    const dataBuf = new ArrayBuffer(4 + 8);
    const dataView = new DataView(dataBuf);
    dataView.setUint16(0, 0, true); // offset
    dataView.setUint16(2, 4, true); // count
    dataView.setUint16(4, 1850, true);
    dataView.setUint16(6, 1852, true);
    dataView.setUint16(8, 2200, true);
    dataView.setUint16(10, 1860, true);

    transport.eventsSubject.next({
      type: 'binary',
      content: {
        type: BinaryMessageType.MSG_CAPTURE_DATA,
        flags: 0,
        seq: 3,
        payload: new Uint8Array(dataBuf),
      },
    });

    // MSG_CAPTURE_END
    const endPayload = new Uint8Array(4);
    new DataView(endPayload.buffer).setUint16(0, 4, true);
    transport.eventsSubject.next({
      type: 'binary',
      content: {
        type: BinaryMessageType.MSG_CAPTURE_END,
        flags: 0,
        seq: 4,
        payload: endPayload,
      },
    });

    const captures = service.captures();
    expect(captures).toHaveLength(1);
    const cap = captures[0];
    expect(cap.sensors).toHaveLength(1);
    expect(cap.sensors[0].baseline).toBe(1850); // Resolved from cached calibration!
    expect(cap.sensors[0].noise).toBe(12);
    expect(cap.sensors[0].threshold).toBe(1910);
    expect(cap.peak).toBe(2200);
    expect(cap.samples).toEqual([1850, 1852, 2200, 1860]);
  });

  it('should maintain distinct calibrations for all three sensors in ALL mode capture', async () => {
    setupService();
    const transport = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport];

    const dev = await service.connectSerialDevice('Pico 3-Sensor');
    const deviceId = dev!.id;

    // Send 3 distinct calibration results for Sensor 0, 1, 2
    transport.eventsSubject.next({
      type: 'ascii',
      content: 'CALIB success=1 target=0 repeated=false baseline=1800 noise=10 threshold=1850',
    });
    transport.eventsSubject.next({
      type: 'ascii',
      content: 'CALIB success=1 target=1 repeated=false baseline=1900 noise=15 threshold=1960',
    });
    transport.eventsSubject.next({
      type: 'ascii',
      content: 'CALIB success=1 target=2 repeated=false baseline=2000 noise=20 threshold=2070',
    });

    expect(service.getSensorCalibration(deviceId, 0)?.baseline).toBe(1800);
    expect(service.getSensorCalibration(deviceId, 1)?.baseline).toBe(1900);
    expect(service.getSensorCalibration(deviceId, 2)?.baseline).toBe(2000);

    // Start ALL mode capture (target=255)
    transport.eventsSubject.next({
      type: 'ascii',
      content: 'CAPTURE_START rate=10000 pre=3 count=6 target=255',
    });
    transport.eventsSubject.next({
      type: 'ascii',
      content: 'CAPTURE_DATA offset=0 values=1801,1902,2003,2100,1905,2002',
    });
    transport.eventsSubject.next({
      type: 'ascii',
      content: 'CAPTURE_END count=6',
    });

    const captures = service.captures();
    expect(captures).toHaveLength(1);
    const cap = captures[0];
    expect(cap.target).toBe(255);
    expect(cap.sensors).toBeDefined();
    expect(cap.sensors).toHaveLength(3);

    expect(cap.sensors![0]).toEqual({
      sensorId: 0,
      baseline: 1800,
      noise: 10,
      threshold: 1850,
    });
    expect(cap.sensors![1]).toEqual({
      sensorId: 1,
      baseline: 1900,
      noise: 15,
      threshold: 1960,
    });
    expect(cap.sensors![2]).toEqual({
      sensorId: 2,
      baseline: 2000,
      noise: 20,
      threshold: 2070,
    });
  });

  it('should respond to ASCII BOOT message with a Handshake command and update state', async () => {
    setupService();
    const transport = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport];

    const dev = await service.connectSerialDevice('Pico Test');
    const deviceId = dev!.id;

    // Clear initial handshake sent upon connect
    transport.sentPayloads.length = 0;

    // Simulate device emitting ASCII BOOT message
    transport.eventsSubject.next({
      type: 'ascii',
      content: 'BOOT success=1 msg=OK',
    });

    // Device state should be updated to BOOT
    const updatedDev = service.getDevice(deviceId);
    expect(updatedDev?.state.gameState).toBe('BOOT');
    expect(updatedDev?.state.sensorState).toBe('INIT');

    // A Handshake packet should have been sent to the transport
    expect(transport.sentPayloads).toHaveLength(1);
    const sent = transport.sentPayloads[0];
    expect(sent).toBeInstanceOf(Uint8Array);
    if (sent instanceof Uint8Array) {
      expect(sent[3]).toBe(BinaryCommandType.CMD_HANDSHAKE);
    }

    // Event log should contain the received BOOT message and sent CMD_HANDSHAKE
    const events = service.events();
    expect(
      events.some((e) => e.payload === 'BOOT success=1 msg=OK' && e.direction === 'received'),
    ).toBe(true);
    expect(events.some((e) => e.payload === '[CMD_HANDSHAKE]' && e.direction === 'sent')).toBe(
      true,
    );
  });
});
