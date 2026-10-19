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

@Component({
  selector: 'app-analyzer',
  imports: [FormsModule, RouterLink, DatePipe, WaveformChartComponent],
  templateUrl: './analyzer.component.html',
})
export class AnalyzerComponent {
  protected readonly deviceManager = inject(DeviceManagerService);
  private readonly chartComp = viewChild(WaveformChartComponent);

  readonly selectedDeviceId = signal<string>('');
  readonly selectedCaptureId = signal<string>('');
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

  async onArmCapture(): Promise<void> {
    const dev = this.activeDevice();
    if (!dev) {
      return;
    }
    try {
      await this.deviceManager.startCapture(dev.id);
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

    const lines = ['Sample,ADC_Value'];
    for (let i = 0; i < cap.samples.length; i++) {
      lines.push(`${i - cap.preSamples},${cap.samples[i]}`);
    }
    const csvContent = lines.join('\n') + '\n';
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
