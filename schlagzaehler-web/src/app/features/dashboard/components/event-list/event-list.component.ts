import { DatePipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { DeviceEvent } from '../../../../core/device/models/device-event.model';
import { Device } from '../../../../core/device/models/device.model';

@Component({
  selector: 'app-event-list',
  imports: [DatePipe],
  templateUrl: './event-list.component.html',
})
export class EventListComponent {
  readonly events = input.required<readonly DeviceEvent[]>();
  readonly devices = input.required<readonly Device[]>();
  readonly clear = output<void>();

  readonly deviceNameMap = computed(() => {
    const map = new Map<string, string>();
    for (const d of this.devices()) {
      map.set(d.id, d.name);
    }
    return map;
  });

  resolveDeviceName(deviceId: string): string {
    return this.deviceNameMap().get(deviceId) ?? deviceId;
  }
}
