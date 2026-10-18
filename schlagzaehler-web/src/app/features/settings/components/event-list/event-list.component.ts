import { DatePipe } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DeviceEvent } from '../../../../core/device/models/device-event.model';
import { Device } from '../../../../core/device/models/device.model';

export interface SendRawCommandEvent {
  readonly deviceIds: readonly string[];
  readonly payload: string;
}

@Component({
  selector: 'app-event-list',
  imports: [DatePipe, FormsModule],
  templateUrl: './event-list.component.html',
})
export class EventListComponent {
  readonly events = input.required<readonly DeviceEvent[]>();
  readonly devices = input.required<readonly Device[]>();
  readonly clear = output<void>();
  readonly sendRaw = output<SendRawCommandEvent>();

  /**
   * Selected device IDs for filtering live events.
   * Empty set means show events from all devices.
   */
  readonly selectedFilterDeviceIds = signal<ReadonlySet<string>>(new Set());

  /**
   * Selected target device IDs for sending raw commands.
   */
  readonly selectedTargetDeviceIds = signal<ReadonlySet<string>>(new Set());

  /**
   * Raw command/event text to send.
   */
  readonly rawCommandInput = signal<string>('');

  readonly connectedDevices = computed(() =>
    this.devices().filter((d) => d.state.connectionState === 'connected'),
  );

  readonly filteredEvents = computed(() => {
    const filterIds = this.selectedFilterDeviceIds();
    const allEvents = this.events();
    if (filterIds.size === 0) {
      return allEvents;
    }
    return allEvents.filter((evt) => filterIds.has(evt.deviceId));
  });

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

  isFilterSelected(deviceId: string): boolean {
    return this.selectedFilterDeviceIds().has(deviceId);
  }

  toggleFilterDevice(deviceId: string): void {
    this.selectedFilterDeviceIds.update((current) => {
      const next = new Set(current);
      if (next.has(deviceId)) {
        next.delete(deviceId);
      } else {
        next.add(deviceId);
      }
      return next;
    });
  }

  clearFilter(): void {
    this.selectedFilterDeviceIds.set(new Set());
  }

  isTargetSelected(deviceId: string): boolean {
    return this.selectedTargetDeviceIds().has(deviceId);
  }

  toggleTargetDevice(deviceId: string): void {
    this.selectedTargetDeviceIds.update((current) => {
      const next = new Set(current);
      if (next.has(deviceId)) {
        next.delete(deviceId);
      } else {
        next.add(deviceId);
      }
      return next;
    });
  }

  selectAllConnectedTargets(): void {
    const ids = this.connectedDevices().map((d) => d.id);
    this.selectedTargetDeviceIds.set(new Set(ids));
  }

  onSendRawCommand(): void {
    const payload = this.rawCommandInput().trim();
    if (!payload) {
      return;
    }

    const connectedIds = new Set(this.connectedDevices().map((d) => d.id));
    const explicitlySelected = Array.from(this.selectedTargetDeviceIds()).filter((id) =>
      connectedIds.has(id),
    );
    const targetIds = explicitlySelected.length > 0 ? explicitlySelected : Array.from(connectedIds);

    if (targetIds.length === 0) {
      return;
    }

    this.sendRaw.emit({ deviceIds: targetIds, payload });
    this.rawCommandInput.set('');
  }
}
