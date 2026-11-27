import { Injectable } from '@angular/core';
import { DeviceMetadata, TransportType } from '../models/device.model';

export interface StoredDevice {
  readonly id: string;
  readonly name: string;
  readonly transportType: TransportType;
  readonly metadata?: DeviceMetadata;
}

export const STORAGE_KEY_DEVICES = 'schlagzaehler_stored_devices';

@Injectable({ providedIn: 'root' })
export class DeviceStorageService {
  private readonly storageKey = STORAGE_KEY_DEVICES;

  /**
   * Retrieves all stored devices from localStorage.
   * Returns an empty array if storage is empty, inaccessible, or corrupted.
   */
  loadDevices(): StoredDevice[] {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return [];
      }
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) {
        return [];
      }
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter(this.isValidStoredDevice);
    } catch {
      return [];
    }
  }

  /**
   * Persists an array of devices to localStorage.
   */
  saveDevices(devices: readonly StoredDevice[]): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return;
      }
      const serialized = JSON.stringify(devices);
      window.localStorage.setItem(this.storageKey, serialized);
    } catch {
      // Ignore QuotaExceededError or SecurityError in restricted environments
    }
  }

  /**
   * Adds or updates a single stored device entry.
   */
  upsertDevice(device: StoredDevice): void {
    const existing = this.loadDevices();
    const index = existing.findIndex((d) => d.id === device.id);
    let updated: StoredDevice[];
    if (index >= 0) {
      updated = [...existing];
      updated[index] = device;
    } else {
      updated = [...existing, device];
    }
    this.saveDevices(updated);
  }

  /**
   * Removes a device from storage by ID.
   */
  removeDevice(deviceId: string): void {
    const existing = this.loadDevices();
    const updated = existing.filter((d) => d.id !== deviceId);
    this.saveDevices(updated);
  }

  /**
   * Clears all stored devices from localStorage.
   */
  clear(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return;
      }
      window.localStorage.removeItem(this.storageKey);
    } catch {
      // Ignore errors in restricted environments
    }
  }

  private isValidStoredDevice(item: unknown): item is StoredDevice {
    if (!item || typeof item !== 'object') {
      return false;
    }
    const candidate = item as Record<string, unknown>;
    const hasValidId = typeof candidate['id'] === 'string' && candidate['id'].trim().length > 0;
    const hasValidName =
      typeof candidate['name'] === 'string' && candidate['name'].trim().length > 0;
    const hasValidTransport =
      candidate['transportType'] === 'serial' ||
      candidate['transportType'] === 'bluetooth' ||
      candidate['transportType'] === 'websocket';

    return hasValidId && hasValidName && hasValidTransport;
  }
}
