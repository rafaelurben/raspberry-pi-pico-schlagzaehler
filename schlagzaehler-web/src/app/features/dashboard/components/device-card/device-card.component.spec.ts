import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Device, DeviceState } from '../../../../core/device/models/device.model';
import {
  ChangeModeEvent,
  ChangeParameterEvent,
  DeviceCardComponent,
} from './device-card.component';

@Component({
  imports: [DeviceCardComponent],
  template: `
    <app-device-card
      [device]="testDevice"
      (modeChange)="lastModeChange = $event"
      (parameterChange)="lastParameterChange = $event"
      (resetGame)="lastResetId = $event"
      (reconnect)="lastReconnectId = $event"
    />
  `,
})
class TestHostComponent {
  testDevice = new Device({
    id: 'device-1',
    name: 'Pico Target 1',
    state: new DeviceState({
      connectionState: 'connected',
      gameState: 'READY',
      sensorState: 'ARMED',
      isReady: true,
      mode: 'COUNT',
      score: 14,
      elapsedMs: 5000,
    }),
    transportType: 'serial',
  });
  lastModeChange: ChangeModeEvent | null = null;
  lastParameterChange: ChangeParameterEvent | null = null;
  lastResetId: string | null = null;
  lastReconnectId: string | null = null;
}

describe('DeviceCardComponent', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
  });

  it('should render device name, connection state, readiness, mode, score, and timer', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Pico Target 1');
    expect(compiled.textContent).toContain('Connected');
    expect(compiled.textContent).toContain('READY');
    expect(compiled.textContent).toContain('COUNT');
    expect(compiled.querySelector('[data-testid="device-score"]')?.textContent?.trim()).toBe('14');
    expect(compiled.querySelector('[data-testid="device-timer"]')?.textContent?.trim()).toBe(
      '00:05.0',
    );
  });

  it('should automatically increase elapsed time in COUNT/RACE mode between heartbeats when RUNNING', () => {
    const startMs = 100000;
    host.testDevice = new Device({
      id: 'device-1',
      name: 'Pico Target 1',
      state: new DeviceState({
        connectionState: 'connected',
        gameState: 'RUNNING',
        mode: 'COUNT',
        score: 3,
        elapsedMs: 2000,
        lastTimerUpdatedAt: startMs,
      }),
      transportType: 'serial',
    });
    fixture.detectChanges();

    const cardDebug = fixture.debugElement.children[0].componentInstance as DeviceCardComponent;
    cardDebug.nowMs.set(startMs + 400);
    fixture.detectChanges();

    const timerText = fixture.nativeElement
      .querySelector('[data-testid="device-timer"]')
      ?.textContent?.trim();
    expect(timerText).toBe('00:02.4');
  });

  it('should automatically decrease remaining time in TIMED mode between heartbeats when RUNNING', () => {
    const startMs = 100000;
    host.testDevice = new Device({
      id: 'device-1',
      name: 'Pico Target 1',
      state: new DeviceState({
        connectionState: 'connected',
        gameState: 'RUNNING',
        mode: 'TIMED',
        parameter: 30,
        score: 8,
        remainingMs: 10000,
        lastTimerUpdatedAt: startMs,
      }),
      transportType: 'serial',
    });
    fixture.detectChanges();

    const cardDebug = fixture.debugElement.children[0].componentInstance as DeviceCardComponent;
    cardDebug.nowMs.set(startMs + 600);
    fixture.detectChanges();

    const timerText = fixture.nativeElement
      .querySelector('[data-testid="device-timer"]')
      ?.textContent?.trim();
    expect(timerText).toBe('00:09.4');
  });

  it('should emit modeChange when dropdown selection changes and resetGame when reset button is clicked', () => {
    fixture.detectChanges();

    const cardDebug = fixture.debugElement.children[0].componentInstance as DeviceCardComponent;
    cardDebug.onModeSelect('TIMED');
    expect(host.lastModeChange).toEqual({ deviceId: 'device-1', mode: 'TIMED' });

    const resetBtn = fixture.nativeElement.querySelector(
      '[data-testid="reset-game-button"]',
    ) as HTMLButtonElement;
    resetBtn.click();
    expect(host.lastResetId).toBe('device-1');
  });

  it('should show parameter input beside mode selector in TIMED and RACE modes and emit parameterChange', () => {
    host.testDevice = new Device({
      id: 'device-1',
      name: 'Pico Target 1',
      state: new DeviceState({
        connectionState: 'connected',
        gameState: 'READY',
        mode: 'TIMED',
        parameter: 30,
      }),
      transportType: 'serial',
    });
    fixture.detectChanges();

    const paramInput = fixture.nativeElement.querySelector(
      '[data-testid="param-input"]',
    ) as HTMLInputElement;
    expect(paramInput).toBeTruthy();

    paramInput.value = '45';
    paramInput.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(host.lastParameterChange).toEqual({ deviceId: 'device-1', parameter: 45 });
  });

  it('should display Reconnect button when device is disconnected', () => {
    host.testDevice = new Device({
      id: 'device-1',
      name: 'Pico Target 1',
      state: new DeviceState({
        connectionState: 'disconnected',
      }),
      transportType: 'serial',
    });
    fixture.detectChanges();

    const reconnectBtn = fixture.nativeElement.querySelector(
      '[data-testid="reconnect-button"]',
    ) as HTMLButtonElement;
    expect(reconnectBtn).toBeTruthy();
    reconnectBtn.click();
    expect(host.lastReconnectId).toBe('device-1');
  });
});
