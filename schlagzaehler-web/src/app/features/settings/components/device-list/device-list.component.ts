import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Device } from '../../../../core/device/models/device.model';

export interface RenameDeviceEvent {
  readonly deviceId: string;
  readonly name: string;
}

@Component({
  selector: 'app-device-list',
  imports: [FormsModule],
  templateUrl: './device-list.component.html',
})
export class DeviceListComponent {
  readonly devices = input.required<readonly Device[]>();
  readonly disconnect = output<string>();
  readonly reconnect = output<string>();
  readonly remove = output<string>();
  readonly rename = output<RenameDeviceEvent>();

  readonly editingDeviceId = signal<string | null>(null);
  readonly editingName = signal<string>('');

  startEditing(device: Device): void {
    this.editingDeviceId.set(device.id);
    this.editingName.set(device.name);
  }

  cancelEditing(): void {
    this.editingDeviceId.set(null);
    this.editingName.set('');
  }

  saveEditing(deviceId: string): void {
    const trimmed = this.editingName().trim();
    if (trimmed) {
      this.rename.emit({ deviceId, name: trimmed });
    }
    this.editingDeviceId.set(null);
    this.editingName.set('');
  }

  formatMetadata(device: Device): string | null {
    if (!device.metadata) {
      return null;
    }
    const { usbVendorId, usbProductId } = device.metadata;
    if (usbVendorId != null && usbProductId != null) {
      const vid = '0x' + usbVendorId.toString(16).padStart(4, '0');
      const pid = '0x' + usbProductId.toString(16).padStart(4, '0');
      return `USB ${vid}:${pid}`;
    }
    return null;
  }
}
