import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PiezoCaptureResult } from '../../core/device/models/piezo-capture.model';
import { DeviceManagerService } from '../../core/device/services/device-manager.service';
import {
  WaveformChartComponent,
  YAxisScale,
  ZoomPreset,
} from './components/waveform-chart/waveform-chart.component';

export type CaptureTargetOption = 'all' | 0 | 1 | 2;

export interface SensorTargetOption {
  readonly value: string;
  readonly target: CaptureTargetOption;
  readonly label: string;
}

@Component({
  selector: 'app-analyzer',
  imports: [FormsModule, RouterLink, DatePipe, WaveformChartComponent],
  templateUrl: './analyzer.component.html',
})
export class AnalyzerComponent {
  protected readonly deviceManager = inject(DeviceManagerService);
  private readonly chartComp = viewChild(WaveformChartComponent);

  readonly sensorTargetOptions: readonly SensorTargetOption[] = [
    { value: 'all', target: 'all', label: 'All Sensors (Interleaved)' },
    { value: '0', target: 0, label: 'Sensor 0 (GPIO 26)' },
    { value: '1', target: 1, label: 'Sensor 1 (GPIO 27)' },
    { value: '2', target: 2, label: 'Sensor 2 (GPIO 28)' },
  ];

  readonly selectedDeviceId = signal<string>('');
  readonly selectedCaptureId = signal<string>('');
  readonly selectedTarget = signal<CaptureTargetOption>('all');
  readonly zoomPreset = signal<ZoomPreset>('full');
  readonly yAxisScale = signal<YAxisScale>('auto');

  readonly connectedDevices = computed(() =>
    this.deviceManager.devices().filter((d) => d.state.connectionState === 'connected'),
  );

  readonly activeDevice = computed(() => {
    const id = this.selectedDeviceId();
    const connected = this.connectedDevices();
    return connected.find((d) => d.id === id) ?? connected[0] ?? null;
  });

  readonly activeDeviceProgress = computed(() => {
    const dev = this.activeDevice();
    if (!dev) {
      return null;
    }
    const progress = this.deviceManager.captureProgress()[dev.id];
    return progress !== undefined ? progress : null;
  });

  readonly isAutoRearmEnabled = computed(() => {
    const dev = this.activeDevice();
    return dev ? Boolean(this.deviceManager.autoRearmDevices()[dev.id]) : false;
  });

  readonly isDeviceCapturingOrArmed = computed(() => {
    const dev = this.activeDevice();
    if (!dev) {
      return false;
    }
    const s = dev.state.sensorState;
    return (
      s === 'CAPTURE_ARMED' ||
      s === 'CAPTURING' ||
      s === 'TRANSMITTING' ||
      this.activeDeviceProgress() !== null
    );
  });

  readonly activeCapture = computed<PiezoCaptureResult | null>(() => {
    const list = this.deviceManager.captures();
    if (list.length === 0) {
      return null;
    }
    const id = this.selectedCaptureId();
    return list.find((c) => c.id === id) ?? list[0];
  });

  constructor() {
    effect(() => {
      const list = this.deviceManager.captures();
      if (list.length > 0 && !this.selectedCaptureId()) {
        this.selectedCaptureId.set(list[0].id);
      }
    });
  }

  onSelectDevice(deviceId: string): void {
    this.selectedDeviceId.set(deviceId);
  }

  onSelectTarget(value: string): void {
    if (value === 'all') {
      this.selectedTarget.set('all');
    } else {
      const num = Number.parseInt(value, 10);
      if (num === 0 || num === 1 || num === 2) {
        this.selectedTarget.set(num);
      }
    }
  }

  formatTargetLabel(target: CaptureTargetOption | number | undefined): string {
    if (target === 'all' || target === 3) {
      return 'All Sensors (Interleaved)';
    }
    if (target === 0) {
      return 'Sensor 0';
    }
    if (target === 1) {
      return 'Sensor 1';
    }
    if (target === 2) {
      return 'Sensor 2';
    }
    return 'All Sensors';
  }

  formatTargetBadge(target: number | undefined): string {
    if (target === 3) {
      return 'All (3x)';
    }
    if (target === 0 || target === 1 || target === 2) {
      return `Sensor ${target}`;
    }
    return 'Sensor 0';
  }

  async onArmCapture(): Promise<void> {
    const dev = this.activeDevice();
    if (!dev) {
      return;
    }
    try {
      await this.deviceManager.startCapture(dev.id, this.selectedTarget());
    } catch {
      // Handled by deviceManager state
    }
  }

  async onStopCapture(): Promise<void> {
    const dev = this.activeDevice();
    if (!dev) {
      return;
    }
    try {
      await this.deviceManager.stopCapture(dev.id);
    } catch {
      // Handled by deviceManager state
    }
  }

  onToggleAutoRearm(enabled: boolean): void {
    const dev = this.activeDevice();
    if (!dev) {
      return;
    }
    this.deviceManager.setAutoRearm(dev.id, enabled);
  }

  onSelectCapture(capture: PiezoCaptureResult): void {
    this.selectedCaptureId.set(capture.id);
  }

  onDeleteCapture(captureId: string): void {
    this.deviceManager.removeCapture(captureId);
    if (this.selectedCaptureId() === captureId) {
      const remaining = this.deviceManager.captures();
      this.selectedCaptureId.set(remaining[0]?.id ?? '');
    }
  }

  onClearCaptures(): void {
    this.deviceManager.clearCaptures();
    this.selectedCaptureId.set('');
  }

  onExportCsv(): void {
    const cap = this.activeCapture();
    if (!cap) {
      return;
    }

    let csvContent: string;
    if (cap.target === 3) {
      const lines = ['Triplet,Time_ms,Sensor_0,Sensor_1,Sensor_2'];
      const preTriplets = Math.floor(cap.preSamples / 3);
      const tripletCount = Math.floor(cap.samples.length / 3);
      const rate = cap.sampleRateHz > 0 ? cap.sampleRateHz : 10000;
      const tripletPeriodMs = (3 * 1000) / rate;
      for (let t = 0; t < tripletCount; t++) {
        const timeMs = (t - preTriplets) * tripletPeriodMs;
        const s0 = cap.samples[t * 3];
        const s1 = cap.samples[t * 3 + 1];
        const s2 = cap.samples[t * 3 + 2];
        lines.push(`${t - preTriplets},${timeMs.toFixed(2)},${s0},${s1},${s2}`);
      }
      csvContent = lines.join('\n') + '\n';
    } else {
      const lines = ['Sample,ADC_Value'];
      for (let i = 0; i < cap.samples.length; i++) {
        lines.push(`${i - cap.preSamples},${cap.samples[i]}`);
      }
      csvContent = lines.join('\n') + '\n';
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `piezo_${this.formatFilenameTimestamp(cap.timestamp)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  onExportPng(): void {
    const cap = this.activeCapture();
    const chart = this.chartComp();
    if (!cap || !chart) {
      return;
    }

    const dataUrl = chart.exportPngDataUrl();
    if (!dataUrl) {
      return;
    }
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `piezo_${this.formatFilenameTimestamp(cap.timestamp)}_chart.png`;
    a.click();
  }

  private formatFilenameTimestamp(date: Date): string {
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }
}
