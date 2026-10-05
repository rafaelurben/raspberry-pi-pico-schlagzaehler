import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DeviceEvent } from '../../../../core/device/models/device-event.model';
import { Device } from '../../../../core/device/models/device.model';
import { EventListComponent } from './event-list.component';

@Component({
  imports: [EventListComponent],
  template: `
    <app-event-list [events]="testEvents" [devices]="testDevices" (clear)="clearCalled = true" />
  `,
})
class TestHostComponent {
  testEvents: DeviceEvent[] = [];
  testDevices: Device[] = [];
  clearCalled = false;
}

describe('EventListComponent', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
  });

  it('should display empty state when events list is empty', () => {
    host.testEvents = [];
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('No events received');
  });

  it('should display events with resolved device names and payload text', () => {
    host.testDevices = [
      { id: 'dev-1', name: 'Pico One', state: 'connected', transportType: 'serial' },
      { id: 'dev-2', name: 'Pico Two', state: 'connected', transportType: 'serial' },
    ];
    host.testEvents = [
      {
        id: 'evt-1',
        deviceId: 'dev-1',
        timestamp: new Date('2026-10-05T12:00:00.000Z'),
        payload: 'Hit detected! Value: 450',
      },
      {
        id: 'evt-2',
        deviceId: 'dev-2',
        timestamp: new Date('2026-10-05T12:00:01.000Z'),
        payload: 'Hit detected! Value: 620',
      },
    ];
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Pico One');
    expect(compiled.textContent).toContain('Hit detected! Value: 450');

    expect(compiled.textContent).toContain('Pico Two');
    expect(compiled.textContent).toContain('Hit detected! Value: 620');
  });

  it('should emit clear when clear button is clicked', () => {
    host.testEvents = [
      {
        id: 'evt-1',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'HIT',
      },
    ];
    fixture.detectChanges();

    const clearBtn = fixture.nativeElement.querySelector(
      'button[aria-label="Clear all received events"]',
    ) as HTMLButtonElement;
    expect(clearBtn).toBeTruthy();

    clearBtn.click();
    expect(host.clearCalled).toBe(true);
  });
});
