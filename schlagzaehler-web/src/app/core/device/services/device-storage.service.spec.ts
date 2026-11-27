import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceStorageService, STORAGE_KEY_DEVICES, StoredDevice } from './device-storage.service';

describe('DeviceStorageService', () => {
  let service: DeviceStorageService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [DeviceStorageService],
    });
    service = TestBed.inject(DeviceStorageService);
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should return an empty array when no devices are stored', () => {
    expect(service.loadDevices()).toEqual([]);
  });

  it('should save and load stored devices correctly', () => {
    const devices: StoredDevice[] = [
      {
        id: 'device-1',
        name: 'Target Alpha',
        transportType: 'serial',
        metadata: { usbVendorId: 0x2e8a, usbProductId: 0x000a },
      },
      {
        id: 'device-2',
        name: 'Target Beta',
        transportType: 'serial',
      },
    ];

    service.saveDevices(devices);
    const loaded = service.loadDevices();

    expect(loaded).toEqual(devices);
  });

  it('should upsert a new device and update an existing device', () => {
    const dev1: StoredDevice = {
      id: 'device-1',
      name: 'Pico 1',
      transportType: 'serial',
    };
    service.upsertDevice(dev1);
    expect(service.loadDevices()).toEqual([dev1]);

    const updatedDev1: StoredDevice = {
      id: 'device-1',
      name: 'Renamed Pico 1',
      transportType: 'serial',
      metadata: { fwVersion: '1.0.0' },
    };
    service.upsertDevice(updatedDev1);
    expect(service.loadDevices()).toEqual([updatedDev1]);

    const dev2: StoredDevice = {
      id: 'device-2',
      name: 'Pico 2',
      transportType: 'serial',
    };
    service.upsertDevice(dev2);
    expect(service.loadDevices()).toHaveLength(2);
    expect(service.loadDevices()).toEqual([updatedDev1, dev2]);
  });

  it('should remove a device by id', () => {
    const devices: StoredDevice[] = [
      { id: 'dev-1', name: 'D1', transportType: 'serial' },
      { id: 'dev-2', name: 'D2', transportType: 'serial' },
    ];
    service.saveDevices(devices);

    service.removeDevice('dev-1');
    expect(service.loadDevices()).toEqual([{ id: 'dev-2', name: 'D2', transportType: 'serial' }]);
  });

  it('should clear all stored devices', () => {
    service.saveDevices([{ id: 'dev-1', name: 'D1', transportType: 'serial' }]);
    expect(service.loadDevices()).toHaveLength(1);

    service.clear();
    expect(service.loadDevices()).toHaveLength(0);
    expect(localStorage.getItem(STORAGE_KEY_DEVICES)).toBeNull();
  });

  it('should handle corrupted JSON gracefully by returning empty array', () => {
    localStorage.setItem(STORAGE_KEY_DEVICES, '{ invalid json string');
    expect(service.loadDevices()).toEqual([]);
  });

  it('should filter out invalid items from stored JSON', () => {
    const corruptedArray = [
      { id: 'valid-1', name: 'Valid Device', transportType: 'serial' },
      { id: '', name: 'Empty ID', transportType: 'serial' },
      { id: 'no-name', transportType: 'serial' },
      { id: 'invalid-transport', name: 'Bad Transport', transportType: 'unknown' },
      null,
      123,
    ];
    localStorage.setItem(STORAGE_KEY_DEVICES, JSON.stringify(corruptedArray));

    const loaded = service.loadDevices();
    expect(loaded).toEqual([{ id: 'valid-1', name: 'Valid Device', transportType: 'serial' }]);
  });

  it('should handle localStorage throwing errors without crashing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    expect(() => service.loadDevices()).not.toThrow();
    expect(service.loadDevices()).toEqual([]);

    expect(() =>
      service.saveDevices([{ id: '1', name: 'D', transportType: 'serial' }]),
    ).not.toThrow();
  });
});
