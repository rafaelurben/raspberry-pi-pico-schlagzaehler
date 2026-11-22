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
      [(hideTimerEvents)]="hideTimer"
      (clear)="clearCalled = true"
      (sendRaw)="lastSentRaw = $event"
    />
  `,
})
class TestHostComponent {
  testEvents: DeviceEvent[] = [];
  testDevices: Device[] = [];
  hideTimer = false;
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

  it('should display TIMER events by default when hideTimerEvents is false', () => {
    host.testDevices = [
      new Device({
        id: 'dev-1',
        name: 'Pico One',
        state: new DeviceState({ connectionState: 'connected' }),
        transportType: 'serial',
      }),
    ];
    host.testEvents = [
      {
        id: 'evt-1',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'TIMER elapsed=1000 remaining=29000',
      },
      {
        id: 'evt-2',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'HIT id=1 target=0 peak=2150 intensity=300',
      },
    ];
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('TIMER elapsed=1000 remaining=29000');
    expect(compiled.textContent).toContain('HIT id=1 target=0 peak=2150 intensity=300');

    const checkbox = fixture.nativeElement.querySelector(
      '[data-testid="hide-timer-checkbox"]',
    ) as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(false);
  });

  it('should hide TIMER events when hideTimerEvents filter is toggled via checkbox', () => {
    host.testDevices = [
      new Device({
        id: 'dev-1',
        name: 'Pico One',
        state: new DeviceState({ connectionState: 'connected' }),
        transportType: 'serial',
      }),
    ];
    host.testEvents = [
      {
        id: 'evt-1',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'TIMER elapsed=1000 remaining=29000',
      },
      {
        id: 'evt-2',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'HIT id=1 target=0 peak=2150 intensity=300',
      },
      {
        id: 'evt-3',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'MODE active=TIMED param=30',
      },
    ];
    fixture.detectChanges();

    const checkbox = fixture.nativeElement.querySelector(
      '[data-testid="hide-timer-checkbox"]',
    ) as HTMLInputElement;

    // Toggle hide TIMER filter ON
    checkbox.click();
    fixture.detectChanges();

    expect(host.hideTimer).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain('TIMER elapsed=1000 remaining=29000');
    // Non-TIMER events remain visible (including MODE active=TIMED)
    expect(fixture.nativeElement.textContent).toContain(
      'HIT id=1 target=0 peak=2150 intensity=300',
    );
    expect(fixture.nativeElement.textContent).toContain('MODE active=TIMED param=30');

    // Toggle hide TIMER filter OFF
    checkbox.click();
    fixture.detectChanges();

    expect(host.hideTimer).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('TIMER elapsed=1000 remaining=29000');
    expect(fixture.nativeElement.textContent).toContain(
      'HIT id=1 target=0 peak=2150 intensity=300',
    );
  });

  it('should combine device filtering and hideTimerEvents filter', () => {
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
        timestamp: new Date(),
        payload: 'TIMER elapsed=2000 remaining=28000',
      },
      {
        id: 'evt-2',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'HIT id=1 target=0 peak=1900 intensity=200',
      },
      {
        id: 'evt-3',
        deviceId: 'dev-2',
        timestamp: new Date(),
        payload: 'SCORE value=10',
      },
      {
        id: 'evt-4',
        deviceId: 'dev-2',
        timestamp: new Date(),
        payload: 'TIMER elapsed=3000 remaining=27000',
      },
    ];
    fixture.detectChanges();

    // Filter by Pico One only
    const filterOneBtn = fixture.nativeElement.querySelector(
      '[data-testid="filter-device-dev-1"]',
    ) as HTMLButtonElement;
    filterOneBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('TIMER elapsed=2000 remaining=28000');
    expect(fixture.nativeElement.textContent).toContain(
      'HIT id=1 target=0 peak=1900 intensity=200',
    );
    expect(fixture.nativeElement.textContent).not.toContain('SCORE value=10');
    expect(fixture.nativeElement.textContent).not.toContain('TIMER elapsed=3000 remaining=27000');

    // Also enable hide TIMER events
    const checkbox = fixture.nativeElement.querySelector(
      '[data-testid="hide-timer-checkbox"]',
    ) as HTMLInputElement;
    checkbox.click();
    fixture.detectChanges();

    // Only non-TIMER events for Pico One should be visible
    expect(fixture.nativeElement.textContent).not.toContain('TIMER elapsed=2000 remaining=28000');
    expect(fixture.nativeElement.textContent).toContain(
      'HIT id=1 target=0 peak=1900 intensity=200',
    );
    expect(fixture.nativeElement.textContent).not.toContain('SCORE value=10');
    expect(fixture.nativeElement.textContent).not.toContain('TIMER elapsed=3000 remaining=27000');
  });

  it('should show empty state if all received events are TIMER events and hideTimerEvents is active', () => {
    host.testEvents = [
      {
        id: 'evt-1',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'TIMER elapsed=100 remaining=900',
      },
      {
        id: 'evt-2',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'TIMER elapsed=200 remaining=800',
      },
    ];
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('No events received');

    const checkbox = fixture.nativeElement.querySelector(
      '[data-testid="hide-timer-checkbox"]',
    ) as HTMLInputElement;
    checkbox.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No events received');
  });

  it('should correctly identify TIMER events using isTimerEvent', () => {
    const eventListComponent = fixture.debugElement.children[0]
      .componentInstance as EventListComponent;

    expect(
      eventListComponent.isTimerEvent({
        id: '1',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'TIMER elapsed=5000 remaining=25000',
      }),
    ).toBe(true);

    expect(
      eventListComponent.isTimerEvent({
        id: '2',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'timer elapsed=5000',
      }),
    ).toBe(true);

    expect(
      eventListComponent.isTimerEvent({
        id: '3',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'TIMER',
      }),
    ).toBe(true);

    expect(
      eventListComponent.isTimerEvent({
        id: '4',
        deviceId: 'dev-1',
        timestamp: new Date(),
        type: 'TIMER',
        payload: 'anything',
      }),
    ).toBe(true);

    expect(
      eventListComponent.isTimerEvent({
        id: '5',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'MODE active=TIMED param=30',
      }),
    ).toBe(false);

    expect(
      eventListComponent.isTimerEvent({
        id: '6',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'HIT id=1 target=0',
      }),
    ).toBe(false);

    expect(
      eventListComponent.isTimerEvent({
        id: '7',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'SCORE value=100',
      }),
    ).toBe(false);
  });
});
