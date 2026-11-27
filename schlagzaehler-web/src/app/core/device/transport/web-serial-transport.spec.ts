import { describe, expect, it, vi } from 'vitest';
import { WebSerialTransport } from './web-serial-transport';
import { WebSerialTransportFactory } from './web-serial-transport-factory.service';

function createMockPort(options?: {
  vendorId?: number;
  productId?: number;
  readable?: boolean;
  writable?: boolean;
  openError?: Error;
}): SerialPort {
  const mockReader = {
    read: vi.fn().mockReturnValue(
      new Promise<never>(() => {
        void 0;
      }),
    ),
    cancel: vi.fn().mockResolvedValue(undefined),
    releaseLock: vi.fn(),
  };
  const mockReadable = {
    getReader: vi.fn().mockReturnValue(mockReader),
  };
  const mockWritable = {
    getWriter: vi.fn().mockReturnValue({
      write: vi.fn().mockResolvedValue(undefined),
      releaseLock: vi.fn(),
    }),
  };

  const port = {
    readable: options?.readable ? (mockReadable as unknown as ReadableStream<Uint8Array>) : null,
    writable: options?.writable ? (mockWritable as unknown as WritableStream<Uint8Array>) : null,
    getInfo: vi.fn().mockReturnValue({
      usbVendorId: options?.vendorId ?? 0x2e8a,
      usbProductId: options?.productId ?? 0x000a,
    }),
    open: vi.fn().mockImplementation(async () => {
      if (options?.openError) {
        throw options.openError;
      }
      (port as { readable: unknown; writable: unknown }).readable = mockReadable;
      (port as { readable: unknown; writable: unknown }).writable = mockWritable;
    }),
    close: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as SerialPort;

  return port;
}

describe('WebSerialTransport', () => {
  it('should connect directly when port is available and unopened', async () => {
    const port = createMockPort();
    const transport = new WebSerialTransport(port);

    await transport.connect();

    expect(port.open).toHaveBeenCalledOnce();
    let state = '';
    transport.state$.subscribe((s) => (state = s));
    expect(state).toBe('connected');
  });

  it('should not call open() again if port readable and writable streams already exist', async () => {
    const port = createMockPort({ readable: true, writable: true });
    const transport = new WebSerialTransport(port);

    await transport.connect();

    expect(port.open).not.toHaveBeenCalled();
    let state = '';
    transport.state$.subscribe((s) => (state = s));
    expect(state).toBe('connected');
  });

  it('should try getPorts() pre-check if direct connection fails before showing picker', async () => {
    const stalePort = createMockPort({ openError: new Error('Stale port handle') });
    const freshPort = createMockPort({ vendorId: 0x2e8a, productId: 0x000a });

    const mockFactory = {
      isSupported: vi.fn().mockReturnValue(true),
      getPorts: vi.fn().mockResolvedValue([freshPort]),
      findMatchingPort: vi.fn().mockReturnValue(freshPort),
      requestPort: vi.fn(),
    } as unknown as WebSerialTransportFactory;

    const transport = new WebSerialTransport(stalePort, undefined, mockFactory);

    await transport.connect();

    expect(mockFactory.getPorts).toHaveBeenCalledOnce();
    expect(mockFactory.findMatchingPort).toHaveBeenCalledWith([freshPort], {
      usbVendorId: 0x2e8a,
      usbProductId: 0x000a,
    });
    // Picker was NOT requested because getPorts succeeded
    expect(mockFactory.requestPort).not.toHaveBeenCalled();
    expect(freshPort.open).toHaveBeenCalledOnce();

    let state = '';
    transport.state$.subscribe((s) => (state = s));
    expect(state).toBe('connected');
    expect(transport.getPort()).toBe(freshPort);
  });

  it('should fallback to requestPort() picker when getPorts() returns no matching ports', async () => {
    const stalePort = createMockPort({ openError: new Error('Port lost') });
    const pickedPort = createMockPort({ vendorId: 0x2e8a, productId: 0x000a });

    const mockFactory = {
      isSupported: vi.fn().mockReturnValue(true),
      getPorts: vi.fn().mockResolvedValue([]),
      findMatchingPort: vi.fn().mockReturnValue(null),
      requestPort: vi.fn().mockResolvedValue(pickedPort),
    } as unknown as WebSerialTransportFactory;

    const transport = new WebSerialTransport(stalePort, undefined, mockFactory);

    await transport.connect();

    expect(mockFactory.getPorts).toHaveBeenCalledOnce();
    expect(mockFactory.requestPort).toHaveBeenCalledOnce();
    expect(pickedPort.open).toHaveBeenCalledOnce();

    let state = '';
    transport.state$.subscribe((s) => (state = s));
    expect(state).toBe('connected');
    expect(transport.getPort()).toBe(pickedPort);
  });

  it('should handle user cancelling the picker gracefully by returning to disconnected state', async () => {
    const stalePort = createMockPort({ openError: new Error('Port lost') });

    const mockFactory = {
      isSupported: vi.fn().mockReturnValue(true),
      getPorts: vi.fn().mockResolvedValue([]),
      findMatchingPort: vi.fn().mockReturnValue(null),
      requestPort: vi.fn().mockRejectedValue(new DOMException('User cancelled', 'NotFoundError')),
    } as unknown as WebSerialTransportFactory;

    const transport = new WebSerialTransport(stalePort, undefined, mockFactory);

    await expect(transport.connect()).resolves.toBeUndefined();

    let state = '';
    transport.state$.subscribe((s) => (state = s));
    expect(state).toBe('disconnected');
  });

  it('should transition to disconnected when port fires disconnect event', async () => {
    let disconnectHandler: (() => void) | undefined;
    const port = createMockPort();
    (port.addEventListener as ReturnType<typeof vi.fn>).mockImplementation(
      (type: string, handler: () => void) => {
        if (type === 'disconnect') {
          disconnectHandler = handler;
        }
      },
    );

    const transport = new WebSerialTransport(port);
    await transport.connect();

    let state = '';
    transport.state$.subscribe((s) => (state = s));
    expect(state).toBe('connected');

    disconnectHandler?.();
    expect(state).toBe('disconnected');
  });

  it('should support reconnectWithPort(newPort) to adopt a newly plugged port and connect', async () => {
    const oldPort = createMockPort();
    const newPort = createMockPort({ vendorId: 0x2e8a, productId: 0x000b });

    const transport = new WebSerialTransport(oldPort);
    await transport.reconnectWithPort(newPort);

    expect(transport.getPort()).toBe(newPort);
    expect(newPort.open).toHaveBeenCalledOnce();

    let state = '';
    transport.state$.subscribe((s) => (state = s));
    expect(state).toBe('connected');
    expect(transport.getMetadata()?.usbProductId).toBe(0x000b);
  });
});
