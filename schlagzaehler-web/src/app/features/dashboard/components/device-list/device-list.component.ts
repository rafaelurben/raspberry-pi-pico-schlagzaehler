import { Component, input, output } from '@angular/core';
import { Device } from '../../../../core/device/models/device.model';

@Component({
  selector: 'app-device-list',
  templateUrl: './device-list.component.html',
})
export class DeviceListComponent {
  readonly devices = input.required<readonly Device[]>();
  readonly disconnect = output<string>();
  readonly remove = output<string>();

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
