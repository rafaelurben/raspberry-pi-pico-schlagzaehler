import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Device } from '../../../../core/device/models/device.model';
import { DeviceListComponent } from './device-list.component';

@Component({
  imports: [DeviceListComponent],
  template: `
    <app-device-list
      [devices]="testDevices"
      (disconnect)="lastDisconnectedId = $event"
      (remove)="lastRemovedId = $event"
    />
  `,
})
class TestHostComponent {
  testDevices: Device[] = [];
  lastDisconnectedId: string | null = null;
  lastRemovedId: string | null = null;
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
      {
        id: 'device-1',
        name: 'Device 1',
        state: 'connected',
        transportType: 'serial',
        metadata: { usbVendorId: 0x2e8a, usbProductId: 0x000a },
      },
      {
        id: 'device-2',
        name: 'Device 2',
        state: 'error',
        transportType: 'serial',
        errorMessage: 'Connection lost',
      },
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
      {
        id: 'device-1',
        name: 'Device 1',
        state: 'connected',
        transportType: 'serial',
      },
    ];
    fixture.detectChanges();

    const disconnectBtn = fixture.nativeElement.querySelector(
      'button[aria-label="Disconnect Device 1"]',
    ) as HTMLButtonElement;
    expect(disconnectBtn).toBeTruthy();

    disconnectBtn.click();
    expect(host.lastDisconnectedId).toBe('device-1');
  });

  it('should emit remove when remove button is clicked on disconnected device', () => {
    host.testDevices = [
      {
        id: 'device-2',
        name: 'Device 2',
        state: 'disconnected',
        transportType: 'serial',
      },
    ];
    fixture.detectChanges();

    const removeBtn = fixture.nativeElement.querySelector(
      'button[aria-label="Remove Device 2"]',
    ) as HTMLButtonElement;
    expect(removeBtn).toBeTruthy();

    removeBtn.click();
    expect(host.lastRemovedId).toBe('device-2');
  });
});
