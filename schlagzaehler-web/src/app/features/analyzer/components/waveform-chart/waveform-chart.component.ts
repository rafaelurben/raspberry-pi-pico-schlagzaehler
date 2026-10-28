import {
  AfterViewInit,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { PiezoCaptureResult } from '../../../../core/device/models/piezo-capture.model';

export type ZoomPreset = 'full' | 'ringdown' | 'impact';
export type YAxisScale = 'auto' | 'full12bit';

interface HoverPoint {
  readonly sampleRel: number;
  readonly timeMs: number;
  readonly adcValue: number;
}

@Component({
  selector: 'app-waveform-chart',
  templateUrl: 'waveform-chart.component.html',
})
export class WaveformChartComponent implements AfterViewInit {
  readonly capture = input.required<PiezoCaptureResult>();
  readonly zoom = input<ZoomPreset>('full');
  readonly yScale = input<YAxisScale>('auto');

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('chartCanvas');
  readonly hoverPoint = signal<HoverPoint | null>(null);

  readonly visibleRange = computed(() => {
    const cap = this.capture();
    const rate = cap.sampleRateHz > 0 ? cap.sampleRateHz : 10000;
    const pre = cap.preSamples;
    const total = cap.totalSamples;
    const preset = this.zoom();

    if (preset === 'impact') {
      const start = Math.max(0, pre - Math.round(0.01 * rate));
      const end = Math.min(total - 1, pre + Math.round(0.05 * rate));
      return { start, end };
    }
    if (preset === 'ringdown') {
      const start = Math.max(0, pre - Math.round(0.02 * rate));
      const end = Math.min(total - 1, pre + Math.round(0.25 * rate));
      return { start, end };
    }
    return { start: 0, end: Math.max(0, total - 1) };
  });

  constructor() {
    effect(() => {
      // Track reactive inputs and re-render canvas whenever they change
      this.capture();
      this.zoom();
      this.yScale();
      this.hoverPoint();
      this.drawChart();
    });
  }

  ngAfterViewInit(): void {
    this.drawChart();
  }

  onMouseMove(event: MouseEvent): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const padLeft = 56;
    const padRight = 20;
    const plotWidth = rect.width - padLeft - padRight;
    if (plotWidth <= 0) {
      return;
    }

    const relX = event.clientX - rect.left - padLeft;
    if (relX < 0 || relX > plotWidth) {
      this.hoverPoint.set(null);
      return;
    }

    const cap = this.capture();
    const { start, end } = this.visibleRange();
    const span = Math.max(1, end - start);
    const idx = Math.min(end, Math.max(start, Math.round(start + (relX / plotWidth) * span)));
    const sampleRel = idx - cap.preSamples;
    const rate = cap.sampleRateHz > 0 ? cap.sampleRateHz : 10000;
    const timeMs = (sampleRel * 1000) / rate;
    const adcValue = cap.samples[idx] ?? 0;

    this.hoverPoint.set({ sampleRel, timeMs, adcValue });
  }

  onMouseLeave(): void {
    this.hoverPoint.set(null);
  }

  exportPngDataUrl(): string | null {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) {
      return null;
    }
    return canvas.toDataURL('image/png');
  }

  private drawChart(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const cssWidth = canvas.clientWidth || 800;
    const cssHeight = canvas.clientHeight || 360;

    if (
      canvas.width !== Math.round(cssWidth * dpr) ||
      canvas.height !== Math.round(cssHeight * dpr)
    ) {
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const padLeft = 56;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 36;
    const plotW = Math.max(10, cssWidth - padLeft - padRight);
    const plotH = Math.max(10, cssHeight - padTop - padBottom);

    const cap = this.capture();
    const { start, end } = this.visibleRange();
    const samples = cap.samples;

    // Determine Y bounds
    let yMin = 0;
    let yMax = 4095;

    if (this.yScale() === 'auto' && samples.length > 0) {
      let minVal = cap.baseline;
      let maxVal = Math.max(cap.threshold, cap.peak);
      for (let i = start; i <= end && i < samples.length; i++) {
        const v = samples[i];
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
      }
      const margin = Math.max(40, Math.round((maxVal - minVal) * 0.12));
      yMin = Math.max(0, minVal - margin);
      yMax = Math.min(4095, maxVal + margin);
      if (yMax <= yMin) {
        yMax = yMin + 100;
      }
    }

    const yToPx = (val: number): number =>
      padTop + plotH - ((val - yMin) / Math.max(1, yMax - yMin)) * plotH;
    const idxToPx = (idx: number): number =>
      padLeft + ((idx - start) / Math.max(1, end - start)) * plotW;

    // Horizontal grid lines & Y labels
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const yTicks = 5;
    for (let t = 0; t <= yTicks; t++) {
      const val = Math.round(yMin + ((yMax - yMin) * t) / yTicks);
      const y = yToPx(val);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.stroke();
      ctx.fillText(String(val), padLeft - 8, y);
    }

    // Vertical grid lines & X labels (Time in ms)
    const rate = cap.sampleRateHz > 0 ? cap.sampleRateHz : 10000;
    const xTicks = 6;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let t = 0; t <= xTicks; t++) {
      const idx = Math.round(start + ((end - start) * t) / xTicks);
      const x = idxToPx(idx);
      const relSample = idx - cap.preSamples;
      const ms = (relSample * 1000) / rate;

      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + plotH);
      ctx.stroke();

      ctx.fillText(`${ms >= 0 ? '+' : ''}${ms.toFixed(0)} ms`, x, padTop + plotH + 10);
    }

    // Clip to plot area for reference lines and waveform
    ctx.save();
    ctx.beginPath();
    ctx.rect(padLeft, padTop, plotW, plotH);
    ctx.clip();

    // Baseline reference line
    const yBase = yToPx(cap.baseline);
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padLeft, yBase);
    ctx.lineTo(padLeft + plotW, yBase);
    ctx.stroke();

    // Threshold reference line
    const yThresh = yToPx(cap.threshold);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(padLeft, yThresh);
    ctx.lineTo(padLeft + plotW, yThresh);
    ctx.stroke();

    // Trigger vertical line (sample = preSamples)
    if (cap.preSamples >= start && cap.preSamples <= end) {
      const xTrig = idxToPx(cap.preSamples);
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 1.25;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(xTrig, padTop);
      ctx.lineTo(xTrig, padTop + plotH);
      ctx.stroke();
    }

    ctx.setLineDash([]);

    // Waveform path
    if (samples.length > 0 && end >= start) {
      if (cap.target === 3) {
        // Multi-channel interleaved mode: draw 3 distinct colored sensor curves
        const colors = ['#38bdf8', '#34d399', '#f59e0b'];
        for (let s = 0; s < 3; s++) {
          ctx.strokeStyle = colors[s];
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          let first = true;
          const firstIdx = start + ((s - (start % 3) + 3) % 3);
          for (let i = firstIdx; i <= end && i < samples.length; i += 3) {
            const x = idxToPx(i);
            const y = yToPx(samples[i]);
            if (first) {
              ctx.moveTo(x, y);
              first = false;
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
        }
      } else {
        // Single channel mode: min/max bucketed per horizontal pixel for crisp rendering
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        const totalVisible = end - start + 1;
        const bucketSize = Math.max(1, Math.floor(totalVisible / (plotW * 2)));

        let first = true;
        for (let i = start; i <= end && i < samples.length; i += bucketSize) {
          const bucketEnd = Math.min(end, samples.length - 1, i + bucketSize - 1);
          let minV = samples[i];
          let maxV = samples[i];
          let minIdx = i;
          let maxIdx = i;

          for (let j = i + 1; j <= bucketEnd; j++) {
            const v = samples[j];
            if (v < minV) {
              minV = v;
              minIdx = j;
            }
            if (v > maxV) {
              maxV = v;
              maxIdx = j;
            }
          }

          const firstIdx = Math.min(minIdx, maxIdx);
          const secondIdx = Math.max(minIdx, maxIdx);
          const firstVal = firstIdx === minIdx ? minV : maxV;
          const secondVal = secondIdx === minIdx ? minV : maxV;

          const x1 = idxToPx(firstIdx);
          const y1 = yToPx(firstVal);
          if (first) {
            ctx.moveTo(x1, y1);
            first = false;
          } else {
            ctx.lineTo(x1, y1);
          }

          if (secondIdx !== firstIdx) {
            ctx.lineTo(idxToPx(secondIdx), yToPx(secondVal));
          }
        }
        ctx.stroke();
      }
    }

    // Hover crosshair
    const hover = this.hoverPoint();
    if (hover) {
      const hoverIdx = hover.sampleRel + cap.preSamples;
      if (hoverIdx >= start && hoverIdx <= end) {
        const hx = idxToPx(hoverIdx);
        const hy = yToPx(hover.adcValue);

        ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hx, padTop);
        ctx.lineTo(hx, padTop + plotH);
        ctx.stroke();

        ctx.fillStyle = '#e0e7ff';
        ctx.beginPath();
        ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
    ctx.restore();
  }
}
