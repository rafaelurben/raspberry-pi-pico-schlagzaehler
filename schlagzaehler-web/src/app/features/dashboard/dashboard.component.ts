import { Component, inject } from '@angular/core';
import { DeviceManagerService } from '../../core/device/services/device-manager.service';
import { DeviceListComponent } from './components/device-list/device-list.component';
import { EventListComponent } from './components/event-list/event-list.component';

@Component({
  selector: 'app-dashboard',
  imports: [DeviceListComponent, EventListComponent],
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

  async onDisconnectDevice(deviceId: string): Promise<void> {
    await this.deviceManager.disconnectDevice(deviceId);
  }

  async onRemoveDevice(deviceId: string): Promise<void> {
    await this.deviceManager.removeDevice(deviceId);
  }

  onClearEvents(): void {
    this.deviceManager.clearEvents();
  }
}
