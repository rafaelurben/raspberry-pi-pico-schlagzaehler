import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DeviceEvent } from '../../../../core/device/models/device-event.model';
import { Device, DeviceState } from '../../../../core/device/models/device.model';
import { EventListComponent, SendRawCommandEvent } from './event-list.component';

@Component({
  imports: [EventListComponent],
  template: `
    <app-event-list
      [events]="testEvents"
      [devices]="testDevices"
      (clear)="clearCalled = true"
      (sendRaw)="lastSentRaw = $event"
    />
  `,
})
class TestHostComponent {
  testEvents: DeviceEvent[] = [];
  testDevices: Device[] = [];
  clearCalled = false;
  lastSentRaw: SendRawCommandEvent | null = null;
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
      new Device({
        id: 'dev-1',
        name: 'Pico One',
        state: new DeviceState({ connectionState: 'connected' }),
        transportType: 'serial',
      }),
      new Device({
        id: 'dev-2',
        name: 'Pico Two',
        state: new DeviceState({ connectionState: 'connected' }),
        transportType: 'serial',
      }),
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

  it('should allow filtering live events by one or multiple devices', () => {
    host.testDevices = [
      new Device({
        id: 'dev-1',
        name: 'Pico One',
        state: new DeviceState({ connectionState: 'connected' }),
        transportType: 'serial',
      }),
      new Device({
        id: 'dev-2',
        name: 'Pico Two',
        state: new DeviceState({ connectionState: 'connected' }),
        transportType: 'serial',
      }),
      new Device({
        id: 'dev-3',
        name: 'Pico Three',
        state: new DeviceState({ connectionState: 'connected' }),
        transportType: 'serial',
      }),
    ];
    host.testEvents = [
      { id: '1', deviceId: 'dev-1', timestamp: new Date(), payload: 'EVT_FROM_ONE' },
      { id: '2', deviceId: 'dev-2', timestamp: new Date(), payload: 'EVT_FROM_TWO' },
      { id: '3', deviceId: 'dev-3', timestamp: new Date(), payload: 'EVT_FROM_THREE' },
    ];
    fixture.detectChanges();

    const filterOneBtn = fixture.nativeElement.querySelector(
      '[data-testid="filter-device-dev-1"]',
    ) as HTMLButtonElement;
    const filterTwoBtn = fixture.nativeElement.querySelector(
      '[data-testid="filter-device-dev-2"]',
    ) as HTMLButtonElement;

    // Filter by Pico One only
    filterOneBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('EVT_FROM_ONE');
    expect(fixture.nativeElement.textContent).not.toContain('EVT_FROM_TWO');
    expect(fixture.nativeElement.textContent).not.toContain('EVT_FROM_THREE');

    // Add Pico Two to the filter (multi-device filter)
    filterTwoBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('EVT_FROM_ONE');
    expect(fixture.nativeElement.textContent).toContain('EVT_FROM_TWO');
    expect(fixture.nativeElement.textContent).not.toContain('EVT_FROM_THREE');
  });

  it('should allow sending raw events to one or multiple devices', () => {
    host.testDevices = [
      new Device({
        id: 'dev-1',
        name: 'Pico One',
        state: new DeviceState({ connectionState: 'connected' }),
        transportType: 'serial',
      }),
      new Device({
        id: 'dev-2',
        name: 'Pico Two',
        state: new DeviceState({ connectionState: 'connected' }),
        transportType: 'serial',
      }),
    ];
    fixture.detectChanges();

    const targetOneBtn = fixture.nativeElement.querySelector(
      '[data-testid="target-device-dev-1"]',
    ) as HTMLButtonElement;
    targetOneBtn.click();
    fixture.detectChanges();

    const rawInput = fixture.nativeElement.querySelector(
      '[data-testid="raw-command-input"]',
    ) as HTMLInputElement;
    rawInput.value = 'STATUS';
    rawInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const sendBtn = fixture.nativeElement.querySelector(
      '[data-testid="send-raw-button"]',
    ) as HTMLButtonElement;
    sendBtn.click();
    fixture.detectChanges();

    expect(host.lastSentRaw).toEqual({
      deviceIds: ['dev-1'],
      payload: 'STATUS',
    });
  });

  it('should display sent events with a distinct device badge color and filter them with the recipient device', () => {
    host.testDevices = [
      new Device({
        id: 'dev-1',
        name: 'Pico One',
        state: new DeviceState({ connectionState: 'connected' }),
        transportType: 'serial',
      }),
      new Device({
        id: 'dev-2',
        name: 'Pico Two',
        state: new DeviceState({ connectionState: 'connected' }),
        transportType: 'serial',
      }),
    ];
    host.testEvents = [
      {
        id: 'evt-sent-1',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'MODE:TIMED',
        direction: 'sent',
      },
      {
        id: 'evt-recv-1',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'MODE active=TIMED param=30',
        direction: 'received',
      },
      {
        id: 'evt-sent-2',
        deviceId: 'dev-2',
        timestamp: new Date(),
        payload: 'RESET',
        direction: 'sent',
      },
    ];
    fixture.detectChanges();

    const sentBadges = fixture.nativeElement.querySelectorAll('span[data-direction="sent"]');
    const receivedBadges = fixture.nativeElement.querySelectorAll(
      'span[data-direction="received"]',
    );
    expect(sentBadges).toHaveLength(2);
    expect(receivedBadges).toHaveLength(1);
    expect(sentBadges[0].className).toContain('bg-amber-900/60');
    expect(receivedBadges[0].className).toContain('bg-slate-800');

    // Filter by Pico One and verify both sent and received events for Pico One remain
    const filterOneBtn = fixture.nativeElement.querySelector(
      '[data-testid="filter-device-dev-1"]',
    ) as HTMLButtonElement;
    filterOneBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('MODE:TIMED');
    expect(fixture.nativeElement.textContent).toContain('MODE active=TIMED param=30');
    expect(fixture.nativeElement.textContent).not.toContain('RESET');
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
      '[data-testid="clear-events-button"]',
    ) as HTMLButtonElement;
    expect(clearBtn).toBeTruthy();

    clearBtn.click();
    expect(host.clearCalled).toBe(true);
  });
});
