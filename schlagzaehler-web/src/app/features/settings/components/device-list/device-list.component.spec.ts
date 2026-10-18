import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Device, DeviceState } from '../../../../core/device/models/device.model';
import { DeviceListComponent, RenameDeviceEvent } from './device-list.component';

@Component({
  imports: [DeviceListComponent],
  template: `
    <app-device-list
      [devices]="testDevices"
      (disconnect)="lastDisconnectedId = $event"
      (reconnect)="lastReconnectedId = $event"
      (remove)="lastRemovedId = $event"
      (rename)="lastRenamed = $event"
    />
  `,
})
class TestHostComponent {
  testDevices: Device[] = [];
  lastDisconnectedId: string | null = null;
  lastReconnectedId: string | null = null;
  lastRemovedId: string | null = null;
  lastRenamed: RenameDeviceEvent | null = null;
}

describe('DeviceListComponent', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
  });

  it('should display empty state when devices list is empty', () => {
    host.testDevices = [];
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('No devices connected');
  });

  it('should display connected device information', () => {
    host.testDevices = [
      new Device({
        id: 'device-1',
        name: 'Device 1',
        state: new DeviceState({ connectionState: 'connected' }),
        transportType: 'serial',
        metadata: { usbVendorId: 0x2e8a, usbProductId: 0x000a },
      }),
      new Device({
        id: 'device-2',
        name: 'Device 2',
        state: new DeviceState({ connectionState: 'error' }),
        transportType: 'serial',
        errorMessage: 'Connection lost',
      }),
    ];
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Device 1');
    expect(compiled.textContent).toContain('USB 0x2e8a:0x000a');
    expect(compiled.textContent).toContain('Connected');

    expect(compiled.textContent).toContain('Device 2');
    expect(compiled.textContent).toContain('Connection lost');
    expect(compiled.textContent).toContain('Error');
  });

  it('should emit disconnect when disconnect button is clicked', () => {
    host.testDevices = [
      new Device({
        id: 'device-1',
        name: 'Device 1',
        state: new DeviceState({ connectionState: 'connected' }),
        transportType: 'serial',
      }),
    ];
    fixture.detectChanges();

    const disconnectBtn = fixture.nativeElement.querySelector(
      '[data-testid="disconnect-device-1"]',
    ) as HTMLButtonElement;
    expect(disconnectBtn).toBeTruthy();

    disconnectBtn.click();
    expect(host.lastDisconnectedId).toBe('device-1');
  });

  it('should emit reconnect and remove when clicked on disconnected device', () => {
    host.testDevices = [
      new Device({
        id: 'device-2',
        name: 'Device 2',
        state: new DeviceState({ connectionState: 'disconnected' }),
        transportType: 'serial',
      }),
    ];
    fixture.detectChanges();

    const reconnectBtn = fixture.nativeElement.querySelector(
      '[data-testid="reconnect-device-2"]',
    ) as HTMLButtonElement;
    expect(reconnectBtn).toBeTruthy();
    reconnectBtn.click();
    expect(host.lastReconnectedId).toBe('device-2');

    const removeBtn = fixture.nativeElement.querySelector(
      '[data-testid="remove-device-2"]',
    ) as HTMLButtonElement;
    expect(removeBtn).toBeTruthy();
    removeBtn.click();
    expect(host.lastRemovedId).toBe('device-2');
  });

  it('should allow modifying a device name inline', () => {
    host.testDevices = [
      new Device({
        id: 'device-1',
        name: 'Device 1',
        state: new DeviceState({ connectionState: 'connected' }),
        transportType: 'serial',
      }),
    ];
    fixture.detectChanges();

    const editBtn = fixture.nativeElement.querySelector(
      '[data-testid="edit-name-device-1"]',
    ) as HTMLButtonElement;
    expect(editBtn).toBeTruthy();
    editBtn.click();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector(
      '[data-testid="device-name-input-device-1"]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    input.value = 'Target Left';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const saveBtn = fixture.nativeElement.querySelector(
      '[data-testid="save-name-device-1"]',
    ) as HTMLButtonElement;
    saveBtn.click();
    fixture.detectChanges();

    expect(host.lastRenamed).toEqual({ deviceId: 'device-1', name: 'Target Left' });
  });
});
