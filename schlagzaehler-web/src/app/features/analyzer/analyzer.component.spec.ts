import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { DeviceManagerService } from '../../core/device/services/device-manager.service';
import { WebSerialTransportFactory } from '../../core/device/transport/web-serial-transport-factory.service';
import { AnalyzerComponent } from './analyzer.component';

class MockWebSerialFactory {
  isSupported(): boolean {
    return true;
  }
  async requestPort(): Promise<SerialPort> {
    return {} as SerialPort;
  }
}

describe('AnalyzerComponent', () => {
  let fixture: ComponentFixture<AnalyzerComponent>;
  let component: AnalyzerComponent;
  let deviceManager: DeviceManagerService;

  const setupComponent = () => {
    TestBed.configureTestingModule({
      imports: [AnalyzerComponent],
      providers: [
        provideRouter([]),
        DeviceManagerService,
        { provide: WebSerialTransportFactory, useClass: MockWebSerialFactory },
      ],
    });

    fixture = TestBed.createComponent(AnalyzerComponent);
    component = fixture.componentInstance;
    deviceManager = TestBed.inject(DeviceManagerService);
    fixture.detectChanges();
  };

  it('should create the analyzer component with default all sensors selected', () => {
    setupComponent();
    expect(component).toBeTruthy();
    expect(component.selectedTarget()).toBe('all');
    expect(component.sensorTargetOptions).toHaveLength(4);
    expect(component.sensorTargetOptions.map((o) => o.value)).toEqual(['all', '0', '1', '2']);
  });

  it('should change target when onSelectTarget is called', () => {
    setupComponent();
    component.onSelectTarget('1');
    expect(component.selectedTarget()).toBe(1);

    component.onSelectTarget('2');
    expect(component.selectedTarget()).toBe(2);

    component.onSelectTarget('0');
    expect(component.selectedTarget()).toBe(0);

    component.onSelectTarget('all');
    expect(component.selectedTarget()).toBe('all');
  });

  it('should format target labels and badges accurately', () => {
    setupComponent();
    expect(component.formatTargetLabel('all')).toBe('All Sensors (Interleaved)');
    expect(component.formatTargetLabel(3)).toBe('All Sensors (Interleaved)');
    expect(component.formatTargetLabel(0)).toBe('Sensor 0 (GPIO 26)');
    expect(component.formatTargetLabel(1)).toBe('Sensor 1 (GPIO 27)');
    expect(component.formatTargetLabel(2)).toBe('Sensor 2 (GPIO 28)');

    expect(component.formatTargetBadge(3)).toBe('All (3x)');
    expect(component.formatTargetBadge(0)).toBe('Sensor 0');
    expect(component.formatTargetBadge(1)).toBe('Sensor 1');
    expect(component.formatTargetBadge(2)).toBe('Sensor 2');
    expect(component.formatTargetBadge(undefined)).toBe('Sensor 0');
  });

  it('should invoke deviceManager.startCapture with selected sensor target when armed', async () => {
    setupComponent();
    const startCaptureSpy = vi
      .spyOn(deviceManager, 'startCapture')
      .mockImplementation(async () => {});

    // Mock an active connected device
    vi.spyOn(component, 'activeDevice').mockReturnValue({
      id: 'test-pico',
      name: 'Pico Target',
      type: 'pico',
      state: {
        connectionState: 'connected',
        gameState: 'READY',
        activeMode: 'COUNT',
        modeParam: 0,
        score: 0,
        timerElapsedMs: 0,
        sensorState: 'ARMED',
        isReady: true,
      },
    } as any);

    component.onSelectTarget('1');
    await component.onArmCapture();

    expect(startCaptureSpy).toHaveBeenCalledWith('test-pico', 1);

    component.onSelectTarget('all');
    await component.onArmCapture();

    expect(startCaptureSpy).toHaveBeenCalledWith('test-pico', 'all');
  });
});
