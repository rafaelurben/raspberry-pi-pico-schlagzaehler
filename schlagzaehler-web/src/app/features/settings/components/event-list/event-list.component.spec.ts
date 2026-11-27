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
        type: 'HIT_DETECTED',
      },
      {
        id: 'evt-2',
        deviceId: 'dev-2',
        timestamp: new Date('2026-10-05T12:00:01.000Z'),
        payload: 'Hit detected! Value: 620',
        type: 'HIT_DETECTED',
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
      { id: '1', deviceId: 'dev-1', timestamp: new Date(), payload: 'EVT_FROM_ONE', type: 'TEST' },
      { id: '2', deviceId: 'dev-2', timestamp: new Date(), payload: 'EVT_FROM_TWO', type: 'TEST' },
      {
        id: '3',
        deviceId: 'dev-3',
        timestamp: new Date(),
        payload: 'EVT_FROM_THREE',
        type: 'TEST',
      },
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
        type: 'COMMAND',
      },
      {
        id: 'evt-recv-1',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'MODE active=TIMED param=30',
        direction: 'received',
        type: 'GAME_MODE',
      },
      {
        id: 'evt-sent-2',
        deviceId: 'dev-2',
        timestamp: new Date(),
        payload: 'RESET',
        direction: 'sent',
        type: 'COMMAND',
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
        type: 'HIT_DETECTED',
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

  // --- Direction Filtering Tests ---

  it('should show all events by default and allow filtering by received or sent direction', () => {
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
        id: 'evt-rx',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'SCORE value=10',
        direction: 'received',
        type: 'SCORE',
      },
      {
        id: 'evt-tx',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'RESET',
        direction: 'sent',
        type: 'COMMAND',
      },
      {
        id: 'evt-nodir',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'HIT id=1',
        type: 'HIT_DETECTED',
      },
    ];
    fixture.detectChanges();

    // Default: 'all' direction shows all events
    expect(fixture.nativeElement.textContent).toContain('SCORE value=10');
    expect(fixture.nativeElement.textContent).toContain('RESET');
    expect(fixture.nativeElement.textContent).toContain('HIT id=1');

    const rxFilterBtn = fixture.nativeElement.querySelector(
      '[data-testid="filter-direction-received"]',
    ) as HTMLButtonElement;
    const txFilterBtn = fixture.nativeElement.querySelector(
      '[data-testid="filter-direction-sent"]',
    ) as HTMLButtonElement;
    const allFilterBtn = fixture.nativeElement.querySelector(
      '[data-testid="filter-direction-all"]',
    ) as HTMLButtonElement;

    // Filter by 'received': sent events hidden, nodir is treated as received
    rxFilterBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('SCORE value=10');
    expect(fixture.nativeElement.textContent).toContain('HIT id=1');
    expect(fixture.nativeElement.textContent).not.toContain('RESET');

    // Filter by 'sent': only sent events shown
    txFilterBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('SCORE value=10');
    expect(fixture.nativeElement.textContent).not.toContain('HIT id=1');
    expect(fixture.nativeElement.textContent).toContain('RESET');

    // Switch back to 'all'
    allFilterBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('SCORE value=10');
    expect(fixture.nativeElement.textContent).toContain('RESET');
    expect(fixture.nativeElement.textContent).toContain('HIT id=1');
  });

  // --- Event Type Filtering Tests ---

  it('should compute availableEventTypes sorted strictly alphabetically with no special ordering for TIMER', () => {
    host.testEvents = [
      { id: '1', deviceId: 'dev-1', timestamp: new Date(), payload: 'Z', type: 'ZEBRA' },
      { id: '2', deviceId: 'dev-1', timestamp: new Date(), payload: 'T', type: 'TIMER' },
      { id: '3', deviceId: 'dev-1', timestamp: new Date(), payload: 'A', type: 'ALPHA' },
      { id: '4', deviceId: 'dev-1', timestamp: new Date(), payload: 'M', type: 'MODE' },
    ];
    fixture.detectChanges();

    const eventListComponent = fixture.debugElement.children[0]
      .componentInstance as EventListComponent;

    // Pure alphabetical sort: ALPHA, MODE, TIMER, ZEBRA
    expect(eventListComponent.availableEventTypes()).toEqual(['ALPHA', 'MODE', 'TIMER', 'ZEBRA']);
  });

  it('should unselect TIMER events by default while displaying other event types', () => {
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
        type: 'TIMER',
      },
      {
        id: 'evt-2',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'HIT id=1 target=0 peak=2150 intensity=300',
        type: 'HIT_DETECTED',
      },
      {
        id: 'evt-3',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'SCORE value=5',
        type: 'SCORE',
      },
    ];
    fixture.detectChanges();

    // TIMER is unselected by default, HIT_DETECTED and SCORE are visible
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).not.toContain('TIMER elapsed=1000 remaining=29000');
    expect(compiled.textContent).toContain('HIT id=1 target=0 peak=2150 intensity=300');
    expect(compiled.textContent).toContain('SCORE value=5');

    // TIMER pill button is present and rendered with inactive / line-through styling
    const timerBtn = fixture.nativeElement.querySelector(
      '[data-testid="filter-type-TIMER"]',
    ) as HTMLButtonElement;
    expect(timerBtn).toBeTruthy();
    expect(timerBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('should display TIMER events when the TIMER filter button is clicked', () => {
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
        type: 'TIMER',
      },
      {
        id: 'evt-2',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'HIT id=1 target=0 peak=2150 intensity=300',
        type: 'HIT_DETECTED',
      },
    ];
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('TIMER elapsed=1000 remaining=29000');

    // Toggle TIMER ON
    const timerBtn = fixture.nativeElement.querySelector(
      '[data-testid="filter-type-TIMER"]',
    ) as HTMLButtonElement;
    timerBtn.click();
    fixture.detectChanges();

    expect(timerBtn.getAttribute('aria-pressed')).toBe('true');
    expect(fixture.nativeElement.textContent).toContain('TIMER elapsed=1000 remaining=29000');
    expect(fixture.nativeElement.textContent).toContain(
      'HIT id=1 target=0 peak=2150 intensity=300',
    );

    // Toggle TIMER back OFF
    timerBtn.click();
    fixture.detectChanges();

    expect(timerBtn.getAttribute('aria-pressed')).toBe('false');
    expect(fixture.nativeElement.textContent).not.toContain('TIMER elapsed=1000 remaining=29000');
  });

  it('should allow toggling off individual event types and selecting all types via All button', () => {
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
        id: '1',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'HIT peak=2000',
        type: 'HIT_DETECTED',
      },
      {
        id: '2',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'SCORE value=10',
        type: 'SCORE',
      },
      {
        id: '3',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'TIMER elapsed=500',
        type: 'TIMER',
      },
    ];
    fixture.detectChanges();

    // Toggle off SCORE
    const scoreBtn = fixture.nativeElement.querySelector(
      '[data-testid="filter-type-SCORE"]',
    ) as HTMLButtonElement;
    scoreBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('HIT peak=2000');
    expect(fixture.nativeElement.textContent).not.toContain('SCORE value=10');
    expect(fixture.nativeElement.textContent).not.toContain('TIMER elapsed=500');

    // Click "All" types button -> all types selected (including TIMER)
    const allTypesBtn = fixture.nativeElement.querySelector(
      '[data-testid="filter-type-all"]',
    ) as HTMLButtonElement;
    allTypesBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('HIT peak=2000');
    expect(fixture.nativeElement.textContent).toContain('SCORE value=10');
    expect(fixture.nativeElement.textContent).toContain('TIMER elapsed=500');
  });

  it('should show empty state if all received events are TIMER events and TIMER is unselected', () => {
    host.testEvents = [
      {
        id: 'evt-1',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'TIMER elapsed=100 remaining=900',
        type: 'TIMER',
      },
      {
        id: 'evt-2',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'TIMER elapsed=200 remaining=800',
        type: 'TIMER',
      },
    ];
    fixture.detectChanges();

    // TIMER is unselected by default, so all events are filtered out
    expect(fixture.nativeElement.textContent).toContain('No events received');

    // Toggle TIMER ON -> events become visible
    const timerBtn = fixture.nativeElement.querySelector(
      '[data-testid="filter-type-TIMER"]',
    ) as HTMLButtonElement;
    timerBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('No events received');
    expect(fixture.nativeElement.textContent).toContain('TIMER elapsed=100 remaining=900');
  });

  it('should combine device filtering, direction filtering, and event type filtering', () => {
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
        payload: 'HIT id=1 target=0',
        direction: 'received',
        type: 'HIT_DETECTED',
      },
      {
        id: 'evt-2',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'RESET',
        direction: 'sent',
        type: 'COMMAND',
      },
      {
        id: 'evt-3',
        deviceId: 'dev-2',
        timestamp: new Date(),
        payload: 'HIT id=2 target=1',
        direction: 'received',
        type: 'HIT_DETECTED',
      },
      {
        id: 'evt-4',
        deviceId: 'dev-1',
        timestamp: new Date(),
        payload: 'TIMER elapsed=500',
        direction: 'received',
        type: 'TIMER',
      },
    ];
    fixture.detectChanges();

    // Filter by Device: Pico One
    const filterOneBtn = fixture.nativeElement.querySelector(
      '[data-testid="filter-device-dev-1"]',
    ) as HTMLButtonElement;
    filterOneBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('HIT id=1 target=0');
    expect(fixture.nativeElement.textContent).toContain('RESET');
    expect(fixture.nativeElement.textContent).not.toContain('HIT id=2 target=1'); // dev-2 filtered out
    expect(fixture.nativeElement.textContent).not.toContain('TIMER elapsed=500'); // TIMER unselected by default

    // Also filter by Direction: Received
    const rxFilterBtn = fixture.nativeElement.querySelector(
      '[data-testid="filter-direction-received"]',
    ) as HTMLButtonElement;
    rxFilterBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('HIT id=1 target=0');
    expect(fixture.nativeElement.textContent).not.toContain('RESET'); // sent filtered out

    // Enable TIMER
    const timerBtn = fixture.nativeElement.querySelector(
      '[data-testid="filter-type-TIMER"]',
    ) as HTMLButtonElement;
    timerBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('HIT id=1 target=0');
    expect(fixture.nativeElement.textContent).toContain('TIMER elapsed=500');
    expect(fixture.nativeElement.textContent).not.toContain('RESET');
    expect(fixture.nativeElement.textContent).not.toContain('HIT id=2 target=1');
  });
});
