import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { WebSerialTransportFactory } from './web-serial-transport-factory.service';
import { WebSerialTransport } from './web-serial-transport';

describe('WebSerialTransportFactory', () => {
  let factory: WebSerialTransportFactory;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [WebSerialTransportFactory],
    });
    factory = TestBed.inject(WebSerialTransportFactory);
  });

  it('should detect when Web Serial is not supported in the environment', () => {
    const originalNavigator = globalThis.navigator;
    try {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
      });

      expect(factory.isSupported()).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    }
  });

  it('should return empty array for getPorts() when Web Serial is not supported', async () => {
    vi.spyOn(factory, 'isSupported').mockReturnValue(false);
    const ports = await factory.getPorts();
    expect(ports).toEqual([]);
  });

  it('should call navigator.serial.getPorts() when supported', async () => {
    const mockPorts = [{ getInfo: () => ({ usbVendorId: 0x2e8a }) }] as unknown as SerialPort[];
    vi.spyOn(factory, 'isSupported').mockReturnValue(true);

    const originalSerial = (globalThis.navigator as unknown as { serial?: unknown }).serial;
    try {
      (globalThis.navigator as unknown as { serial: unknown }).serial = {
        getPorts: vi.fn().mockResolvedValue(mockPorts),
        requestPort: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      const ports = await factory.getPorts();
      expect(ports).toBe(mockPorts);
    } finally {
      (globalThis.navigator as unknown as { serial: unknown }).serial = originalSerial;
    }
  });

  it('should throw error on requestPort() when unsupported', async () => {
    vi.spyOn(factory, 'isSupported').mockReturnValue(false);
    await expect(factory.requestPort()).rejects.toThrow(
      'The Web Serial API is not supported in this browser.',
    );
  });

  it('should call navigator.serial.requestPort() when supported', async () => {
    const mockPort = {} as SerialPort;
    vi.spyOn(factory, 'isSupported').mockReturnValue(true);

    const originalSerial = (globalThis.navigator as unknown as { serial?: unknown }).serial;
    try {
      const requestPortSpy = vi.fn().mockResolvedValue(mockPort);
      (globalThis.navigator as unknown as { serial: unknown }).serial = {
        getPorts: vi.fn(),
        requestPort: requestPortSpy,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      const port = await factory.requestPort();
      expect(port).toBe(mockPort);
      expect(requestPortSpy).toHaveBeenCalledOnce();
    } finally {
      (globalThis.navigator as unknown as { serial: unknown }).serial = originalSerial;
    }
  });

  it('should listen for serial connect events via connect$ observable', () => {
    vi.spyOn(factory, 'isSupported').mockReturnValue(true);
    const mockPort = { getInfo: () => ({ usbVendorId: 0x2e8a }) } as unknown as SerialPort;

    let registeredHandler: ((event: Event) => void) | undefined;
    const addEventListenerSpy = vi
      .fn()
      .mockImplementation((type: string, handler: (event: Event) => void) => {
        if (type === 'connect') {
          registeredHandler = handler;
        }
      });
    const removeEventListenerSpy = vi.fn();

    const originalSerial = (globalThis.navigator as unknown as { serial?: unknown }).serial;
    try {
      (globalThis.navigator as unknown as { serial: unknown }).serial = {
        addEventListener: addEventListenerSpy,
        removeEventListener: removeEventListenerSpy,
      };

      const receivedPorts: SerialPort[] = [];
      const sub = factory.connect$.subscribe((port) => receivedPorts.push(port));

      expect(addEventListenerSpy).toHaveBeenCalledWith('connect', expect.any(Function));

      // Simulate browser firing connect event
      registeredHandler?.({ port: mockPort } as unknown as Event);

      expect(receivedPorts).toEqual([mockPort]);

      sub.unsubscribe();
      expect(removeEventListenerSpy).toHaveBeenCalledWith('connect', expect.any(Function));
    } finally {
      (globalThis.navigator as unknown as { serial: unknown }).serial = originalSerial;
    }
  });

  it('should instantiate WebSerialTransport in createTransport()', () => {
    const mockPort = {
      getInfo: vi.fn().mockReturnValue({}),
      open: vi.fn(),
      close: vi.fn(),
    } as unknown as SerialPort;

    const transport = factory.createTransport(mockPort);
    expect(transport).toBeInstanceOf(WebSerialTransport);
  });

  it('should find matching port by vendorId and productId, ignoring busy ports', () => {
    const busyPort = {
      readable: {},
      writable: {},
      getInfo: () => ({ usbVendorId: 0x2e8a, usbProductId: 0x000a }),
    } as unknown as SerialPort;

    const availablePort = {
      readable: null,
      writable: null,
      getInfo: () => ({ usbVendorId: 0x2e8a, usbProductId: 0x000a }),
    } as unknown as SerialPort;

    const matched = factory.findMatchingPort([busyPort, availablePort], {
      usbVendorId: 0x2e8a,
      usbProductId: 0x000a,
    });
    expect(matched).toBe(availablePort);
  });

  it('should return sole available port if no exact vendor match or single port exists', () => {
    const port = {
      readable: null,
      writable: null,
      getInfo: () => ({ usbVendorId: 0x1234 }),
    } as unknown as SerialPort;

    const matched = factory.findMatchingPort([port]);
    expect(matched).toBe(port);
  });

  it('should find matching candidate device by port info', () => {
    const port = {
      readable: null,
      writable: null,
      getInfo: () => ({ usbVendorId: 0x2e8a, usbProductId: 0x000b }),
    } as unknown as SerialPort;

    const candidate1 = { id: 'dev-1', metadata: { usbVendorId: 0x2e8a, usbProductId: 0x000a } };
    const candidate2 = { id: 'dev-2', metadata: { usbVendorId: 0x2e8a, usbProductId: 0x000b } };

    const matched = factory.findMatchingDevice(port, [candidate1, candidate2]);
    expect(matched).toBe(candidate2);
  });
});
