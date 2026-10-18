import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DeviceManagerService } from '../../core/device/services/device-manager.service';
import {
  ChangeModeEvent,
  ChangeParameterEvent,
  DeviceCardComponent,
} from './components/device-card/device-card.component';
import { RenameDeviceEvent } from '../settings/components/device-list/device-list.component';

@Component({
  selector: 'app-dashboard',
  imports: [DeviceCardComponent, RouterLink],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  protected readonly deviceManager = inject(DeviceManagerService);

  async onConnectDevice(): Promise<void> {
    try {
      await this.deviceManager.connectSerialDevice();
    } catch {
      // Errors are tracked and presented via deviceManager.lastError or device state
    }
  }

  async onModeChange(event: ChangeModeEvent): Promise<void> {
    try {
      await this.deviceManager.setGameMode(event.deviceId, event.mode);
    } catch {
      // Errors are reflected on the affected device
    }
  }

  async onParameterChange(event: ChangeParameterEvent): Promise<void> {
    try {
      await this.deviceManager.setGameParameter(event.deviceId, event.parameter);
    } catch {
      // Errors are reflected on the affected device
    }
  }

  async onResetGame(deviceId: string): Promise<void> {
    try {
      await this.deviceManager.resetGame(deviceId);
    } catch {
      // Errors are reflected on the affected device
    }
  }

  async onReconnectDevice(deviceId: string): Promise<void> {
    try {
      await this.deviceManager.reconnectDevice(deviceId);
    } catch {
      // Errors are reflected on the affected device
    }
  }

  onRenameDevice(event: RenameDeviceEvent): void {
    this.deviceManager.updateDeviceName(event.deviceId, event.name);
  }
}
