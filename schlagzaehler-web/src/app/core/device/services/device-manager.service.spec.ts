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
} from '../protocol/binary-protocol.types';
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

  constructor(private readonly metadata?: DeviceMetadata) {}

  getMetadata(): DeviceMetadata | undefined {
    return this.metadata ?? { usbVendorId: 0x2e8a, usbProductId: 0x000a };
  }

  async connect(): Promise<void> {
    this.connectCalls++;
    if (this.shouldFailConnect) {
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

class MockWebSerialTransportFactory {
  supported = true;
  transportsToReturn: MockDeviceTransport[] = [];
  requestPortError: Error | null = null;

  isSupported(): boolean {
    return this.supported;
  }

  async requestPort(): Promise<SerialPort> {
    if (this.requestPortError) {
      throw this.requestPortError;
    }
    return {} as SerialPort;
  }

  createTransport(): DeviceTransport {
    return this.transportsToReturn.shift() ?? new MockDeviceTransport();
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

  it('should connect a serial device and register it with state.connectionState "connected"', async () => {
    setupService();
    const transport = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport];

    const device = await service.connectSerialDevice();

    expect(device).toBeDefined();
    expect(device?.name).toBe('Device 1');
    expect(device?.state.connectionState).toBe('connected');
    expect(device?.transportType).toBe('serial');
    expect(service.devices()).toHaveLength(1);
    expect(service.isConnecting()).toBe(false);
    expect(transport.connectCalls).toBe(1);
    expect(transport.sentPayloads).toHaveLength(1);
    const sent = transport.sentPayloads[0] as Uint8Array;
    expect(sent[0]).toBe(SYNC_BYTE_0);
    expect(sent[1]).toBe(SYNC_BYTE_1);
    expect(sent[3]).toBe(BinaryCommandType.CMD_HANDSHAKE);
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

    await service.disconnectDevice(dev1!.id);

    expect(transport1.disconnectCalls).toBe(1);
    expect(transport2.disconnectCalls).toBe(0);
    expect(service.getDevice(dev1!.id)?.state.connectionState).toBe('disconnected');
    expect(service.getDevice(dev2!.id)?.state.connectionState).toBe('connected');

    await service.reconnectDevice(dev1!.id);
    expect(transport1.connectCalls).toBe(2);
    expect(service.getDevice(dev1!.id)?.state.connectionState).toBe('connected');
  });

  it('should send commands to one or multiple devices and log sent events', async () => {
    setupService();
    const transport1 = new MockDeviceTransport();
    const transport2 = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport1, transport2];

    const dev1 = await service.connectSerialDevice();
    const dev2 = await service.connectSerialDevice();

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

    await service.sendCommandToDevices([dev1!.id, dev2!.id], 'CALIB');
    expect(transport1.sentPayloads).toContain('CALIB');
    expect(transport2.sentPayloads).toContain('CALIB');

    const sentEvents = service.events().filter((e) => e.direction === 'sent');
    expect(sentEvents).toHaveLength(5);
    expect(sentEvents.map((e) => e.payload)).toContain('PARAM:40');
    expect(sentEvents.map((e) => e.payload)).toContain('MODE:RACE');
    expect(sentEvents.map((e) => e.payload)).toContain('RESET');
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

    service.setAutoRearm(deviceId, true);
    await service.startCapture(deviceId);
    expect(transport.sentPayloads).toContain('CAPTURE');

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
    expect(captures[0].baseline).toBe(1980);
    expect(captures[0].noise).toBe(3);
    expect(captures[0].threshold).toBe(2010);
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

    // Auto-rearm should have sent another CAPTURE command
    expect(transport.sentPayloads.filter((p) => p === 'CAPTURE')).toHaveLength(2);

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

    service.setAutoRearm(deviceId, true);
    await service.startCapture(deviceId, 1);
    expect(transport.sentPayloads).toContain('CAPTURE:1');

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

    // Auto-rearm should re-issue CAPTURE:1
    expect(transport.sentPayloads.filter((p) => p === 'CAPTURE:1')).toHaveLength(2);
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
    ackView.setUint8(4, 1); // fwMajor
    ackView.setUint8(5, 2); // fwMinor
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
    expect(updatedDev?.state.fwVersion).toBe('1.2.0');
    expect(updatedDev?.state.uptimeMs).toBe(9999);
    expect(updatedDev?.metadata?.fwVersion).toBe('1.2.0');

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
    expect(cap.baseline).toBe(1850); // Resolved from cached calibration!
    expect(cap.noise).toBe(12);
    expect(cap.threshold).toBe(1910);
    expect(cap.peak).toBe(2200);
    expect(cap.samples).toEqual([1850, 1852, 2200, 1860]);
  });
});
