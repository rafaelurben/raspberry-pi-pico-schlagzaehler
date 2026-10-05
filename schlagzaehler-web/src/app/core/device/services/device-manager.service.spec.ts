import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ConnectionState } from '../models/connection-state.type';
import { DeviceMetadata, TransportType } from '../models/device.model';
import { DeviceTransport } from '../transport/device-transport.interface';
import { WebSerialTransportFactory } from '../transport/web-serial-transport-factory.service';
import { DeviceManagerService } from './device-manager.service';

class MockDeviceTransport implements DeviceTransport {
  readonly transportType: TransportType = 'serial';
  readonly stateSubject = new BehaviorSubject<ConnectionState>('disconnected');
  readonly eventsSubject = new Subject<string>();
  readonly errorsSubject = new Subject<Error>();

  readonly state$ = this.stateSubject.asObservable();
  readonly events$ = this.eventsSubject.asObservable();
  readonly errors$ = this.errorsSubject.asObservable();

  connectCalls = 0;
  disconnectCalls = 0;
  shouldFailConnect = false;

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

  it('should connect a serial device and register it with state "connected"', async () => {
    setupService();
    const transport = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport];

    const device = await service.connectSerialDevice();

    expect(device).toBeDefined();
    expect(device?.name).toBe('Device 1');
    expect(device?.state).toBe('connected');
    expect(device?.transportType).toBe('serial');
    expect(service.devices().length).toBe(1);
    expect(service.isConnecting()).toBe(false);
    expect(transport.connectCalls).toBe(1);
  });

  it('should handle user cancelling the device picker without crashing or creating a device', async () => {
    setupService();
    const cancelError = new DOMException('The user cancelled the prompt.', 'NotFoundError');
    mockFactory.requestPortError = cancelError;

    const result = await service.connectSerialDevice();

    expect(result).toBeNull();
    expect(service.devices().length).toBe(0);
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
    expect(service.devices().length).toBe(2);
    expect(service.devices()[0].id).toBe(device1?.id);
    expect(service.devices()[1].id).toBe(device2?.id);
  });

  it('should associate received events with the correct device in reverse chronological order', async () => {
    setupService();
    const transport1 = new MockDeviceTransport();
    const transport2 = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport1, transport2];

    const device1 = await service.connectSerialDevice();
    const device2 = await service.connectSerialDevice();

    // Device 1 emits an event
    transport1.eventsSubject.next('HIT_DEV1_FIRST');
    // Device 2 emits an event
    transport2.eventsSubject.next('HIT_DEV2');
    // Device 1 emits another event
    transport1.eventsSubject.next('HIT_DEV1_LATEST');

    const events = service.events();
    expect(events.length).toBe(3);

    // Newest event at top (index 0)
    expect(events[0].deviceId).toBe(device1?.id);
    expect(events[0].payload).toBe('HIT_DEV1_LATEST');

    expect(events[1].deviceId).toBe(device2?.id);
    expect(events[1].payload).toBe('HIT_DEV2');

    expect(events[2].deviceId).toBe(device1?.id);
    expect(events[2].payload).toBe('HIT_DEV1_FIRST');
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

    // Transport 2 encounters a serial disconnect error
    transport2.errorsSubject.next(new Error('Device 2 serial lost'));

    const devices = service.devices();
    const d1 = devices.find((d) => d.id === dev1?.id);
    const d2 = devices.find((d) => d.id === dev2?.id);
    const d3 = devices.find((d) => d.id === dev3?.id);

    expect(d1?.state).toBe('connected');
    expect(d2?.state).toBe('error');
    expect(d2?.errorMessage).toBe('Device 2 serial lost');
    expect(d3?.state).toBe('connected');
  });

  it('should disconnect an individual device and update its state', async () => {
    setupService();
    const transport1 = new MockDeviceTransport();
    const transport2 = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport1, transport2];

    const dev1 = await service.connectSerialDevice();
    const dev2 = await service.connectSerialDevice();

    await service.disconnectDevice(dev1!.id);

    expect(transport1.disconnectCalls).toBe(1);
    expect(transport2.disconnectCalls).toBe(0);

    const d1 = service.getDevice(dev1!.id);
    const d2 = service.getDevice(dev2!.id);

    expect(d1?.state).toBe('disconnected');
    expect(d2?.state).toBe('connected');
  });

  it('should remove a device completely from the list', async () => {
    setupService();
    const transport = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport];

    const dev = await service.connectSerialDevice();
    expect(service.devices().length).toBe(1);

    await service.removeDevice(dev!.id);
    expect(service.devices().length).toBe(0);
    expect(transport.disconnectCalls).toBe(1);
  });

  it('should clear events', async () => {
    setupService();
    const transport = new MockDeviceTransport();
    mockFactory.transportsToReturn = [transport];

    await service.connectSerialDevice();
    transport.eventsSubject.next('EVENT_1');
    expect(service.events().length).toBe(1);

    service.clearEvents();
    expect(service.events().length).toBe(0);
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
});
