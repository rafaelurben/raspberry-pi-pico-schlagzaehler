import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DeviceManagerService } from '../../core/device/services/device-manager.service';
import {
  DeviceListComponent,
  RenameDeviceEvent,
} from './components/device-list/device-list.component';
import {
  EventListComponent,
  SendRawCommandEvent,
} from './components/event-list/event-list.component';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, DeviceListComponent, EventListComponent],
  templateUrl: './settings.component.html',
})
export class SettingsComponent {
  protected readonly deviceManager = inject(DeviceManagerService);

  readonly newDeviceName = signal<string>('');

  async onConnectDevice(): Promise<void> {
    const preferredName = this.newDeviceName().trim();
    try {
      const connected = await this.deviceManager.connectSerialDevice(preferredName || undefined);
      if (connected) {
        this.newDeviceName.set('');
      }
    } catch {
      // Errors are tracked and presented via deviceManager.lastError or device state
    }
  }

  async onDisconnectDevice(deviceId: string): Promise<void> {
    await this.deviceManager.disconnectDevice(deviceId);
  }

  async onReconnectDevice(deviceId: string): Promise<void> {
    try {
      await this.deviceManager.reconnectDevice(deviceId);
    } catch {
      // Errors are reflected in device.errorMessage and device.state.connectionState
    }
  }

  async onRemoveDevice(deviceId: string): Promise<void> {
    await this.deviceManager.removeDevice(deviceId);
  }

  onRenameDevice(event: RenameDeviceEvent): void {
    this.deviceManager.updateDeviceName(event.deviceId, event.name);
  }

  async onSendRawCommand(event: SendRawCommandEvent): Promise<void> {
    try {
      await this.deviceManager.sendCommandToDevices(event.deviceIds, {
        type: '_RAW',
        payload: event.payload,
      });
    } catch (e) {
      console.warn('Failed to send raw command', event, e);
    }
  }

  onClearEvents(): void {
    this.deviceManager.clearEvents();
  }
}
