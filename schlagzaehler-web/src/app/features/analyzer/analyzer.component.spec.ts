import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { DeviceManagerService } from '../../core/device/services/device-manager.service';
import { WebSerialTransportFactory } from '../../core/device/transport/web-serial-transport-factory.service';
import { AnalyzerComponent } from './analyzer.component';
import { Device } from '../../core/device/models/device.model';

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
    expect(component.formatTargetLabel(255)).toBe('All Sensors (Interleaved)');
    expect(component.formatTargetLabel(0)).toBe('Sensor 0');
    expect(component.formatTargetLabel(1)).toBe('Sensor 1');
    expect(component.formatTargetLabel(2)).toBe('Sensor 2');

    expect(component.formatTargetBadge(255)).toBe('All (3x)');
    expect(component.formatTargetBadge(0)).toBe('Sensor 0');
    expect(component.formatTargetBadge(1)).toBe('Sensor 1');
    expect(component.formatTargetBadge(2)).toBe('Sensor 2');
    expect(component.formatTargetBadge(undefined)).toBe('Sensor 0');
  });

  it('should invoke deviceManager.startCapture with selected sensor target when armed', async () => {
    setupComponent();
    const startCaptureSpy = vi.spyOn(deviceManager, 'startCapture').mockImplementation(async () => {
      /* empty */
    });

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
    } as unknown as Device);

    component.onSelectTarget('1');
    await component.onArmCapture();

    expect(startCaptureSpy).toHaveBeenCalledWith('test-pico', 1);

    component.onSelectTarget('all');
    await component.onArmCapture();

    expect(startCaptureSpy).toHaveBeenCalledWith('test-pico', 'all');
  });

  it('should display separate thresholds and baselines for all 3 sensors in ALL mode', () => {
    setupComponent();

    const mockCapture = {
      id: 'cap-1',
      deviceId: 'pico-1',
      deviceName: 'Pico Target',
      timestamp: new Date('2026-01-01T12:00:00Z'),
      sampleRateHz: 10000,
      preSamples: 300,
      totalSamples: 600,
      baseline: 1800,
      noise: 10,
      threshold: 1850,
      target: 255,
      peak: 2500,
      samples: new Uint16Array(600),
      sensors: [
        { sensorId: 0, baseline: 1800, noise: 10, threshold: 1850 },
        { sensorId: 1, baseline: 1900, noise: 15, threshold: 1960 },
        { sensorId: 2, baseline: 2000, noise: 20, threshold: 2070 },
      ],
    };

    expect(component.isAllTarget(255)).toBe(true);
    expect(component.isAllTarget('all')).toBe(true);
    expect(component.isAllTarget(0)).toBe(false);

    const calibs = component.getSensorCalibrations(mockCapture);
    expect(calibs).toHaveLength(3);
    expect(calibs[0].threshold).toBe(1850);
    expect(calibs[1].threshold).toBe(1960);
    expect(calibs[2].threshold).toBe(2070);

    deviceManager.captures.set([mockCapture]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const textContent = el.textContent || '';
    expect(textContent).toContain('Sensor 0:');
    expect(textContent).toContain('1850');
    expect(textContent).toContain('1800');
    expect(textContent).toContain('Sensor 1:');
    expect(textContent).toContain('1960');
    expect(textContent).toContain('1900');
    expect(textContent).toContain('Sensor 2:');
    expect(textContent).toContain('2070');
    expect(textContent).toContain('2000');
  });
});
