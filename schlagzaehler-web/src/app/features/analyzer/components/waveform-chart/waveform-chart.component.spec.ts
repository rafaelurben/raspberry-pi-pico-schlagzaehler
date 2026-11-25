import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { WaveformChartComponent } from './waveform-chart.component';
import { PiezoCaptureResult } from '../../../../core/device/models/piezo-capture.model';

describe('WaveformChartComponent', () => {
  let fixture: ComponentFixture<WaveformChartComponent>;
  let component: WaveformChartComponent;

  const createComponent = (capture: PiezoCaptureResult) => {
    TestBed.configureTestingModule({
      imports: [WaveformChartComponent],
    });

    fixture = TestBed.createComponent(WaveformChartComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('capture', capture);
    fixture.detectChanges();
  };

  it('should display separate thresholds and baselines for all three sensors in ALL mode', () => {
    const allCapture: PiezoCaptureResult = {
      id: 'cap-all-1',
      deviceId: 'pico-test',
      deviceName: 'Pico Device',
      timestamp: new Date('2026-01-01T10:00:00Z'),
      sampleRateHz: 10000,
      preSamples: 30,
      totalSamples: 90,
      target: 255,
      peak: 2400,
      samples: new Uint16Array(90),
      sensors: [
        { sensorId: 0, baseline: 1800, noise: 10, threshold: 1850 },
        { sensorId: 1, baseline: 1910, noise: 12, threshold: 1970 },
        { sensorId: 2, baseline: 2020, noise: 14, threshold: 2090 },
      ],
    };

    createComponent(allCapture);

    expect(component.isAllSensors()).toBe(true);
    expect(component.sensorCalibrations()).toHaveLength(3);
    expect(component.sensorCalibrations()[0].threshold).toBe(1850);
    expect(component.sensorCalibrations()[1].threshold).toBe(1970);
    expect(component.sensorCalibrations()[2].threshold).toBe(2090);

    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent || '';
    expect(text).toContain('Sensor 0');
    expect(text).toContain('1850');
    expect(text).toContain('1800');
    expect(text).toContain('Sensor 1');
    expect(text).toContain('1970');
    expect(text).toContain('1910');
    expect(text).toContain('Sensor 2');
    expect(text).toContain('2090');
    expect(text).toContain('2020');
  });

  it('should display single threshold and baseline in single sensor mode', () => {
    const singleCapture: PiezoCaptureResult = {
      id: 'cap-single-1',
      deviceId: 'pico-test',
      deviceName: 'Pico Device',
      timestamp: new Date('2026-01-01T10:00:00Z'),
      sampleRateHz: 10000,
      preSamples: 10,
      totalSamples: 30,
      target: 1,
      peak: 2300,
      samples: new Uint16Array(30),
      sensors: [{ sensorId: 1, baseline: 1850, noise: 12, threshold: 1920 }],
    };

    createComponent(singleCapture);

    expect(component.isAllSensors()).toBe(false);
    expect(component.sensorCalibrations()).toHaveLength(1);

    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent || '';
    expect(text).toContain('Sensor 1');
    expect(text).toContain('Threshold (1920)');
    expect(text).toContain('Baseline (1850)');
  });
});
