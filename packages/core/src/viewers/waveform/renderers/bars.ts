import type {
  BarPeakBlock,
  BarsWaveformRendererOptions,
  WaveformRenderer,
  WaveformRenderInput,
} from "../types";
import { BarPeakPyramid } from "../peaks/bars";

export class BarsWaveformRenderer implements WaveformRenderer {
  readonly kind = "bars" as const;
  private options: BarsWaveformRendererOptions;
  private pyramid: BarPeakPyramid | null = null;
  private currentSource: unknown = null;
  private currentChannel = 0;

  constructor(options: BarsWaveformRendererOptions = {}) {
    this.options = { ...options };
  }

  getOptions(): BarsWaveformRendererOptions {
    return { ...this.options };
  }

  setOptions(options: Partial<BarsWaveformRendererOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getBarDuration(timeSpan: number, width: number, dpr = 1): number {
    const barWidthCss = Math.max(0.5, this.options.barWidth ?? 3);
    const barGapCss = Math.max(0, this.options.barGap ?? 2);
    const step = (barWidthCss + barGapCss) * dpr;
    return width > 0 ? (step / width) * timeSpan : 0;
  }

  async render(input: WaveformRenderInput): Promise<void> {
    const {
      canvas,
      source,
      channel = 0,
      color = "#38bdf8",
      backgroundColor = "transparent",
      amplitudeScale = 1.0,
      startTime,
      endTime,
    } = input;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = Math.max(1, canvas.width || 1);
    const height = Math.max(1, canvas.height || 1);

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    if (backgroundColor && backgroundColor !== "transparent") {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }

    const rect =
      typeof canvas.getBoundingClientRect === "function"
        ? canvas.getBoundingClientRect()
        : null;

    const dpr =
      typeof window !== "undefined" && window.devicePixelRatio
        ? window.devicePixelRatio
        : (rect && rect.width > 0 ? Math.round(width / rect.width) : 1) || 1;

    const barWidthCss = Math.max(0.5, this.options.barWidth ?? 3);
    const barGapCss = Math.max(0, this.options.barGap ?? 2);
    const bw = Math.max(1, Math.round(barWidthCss * dpr));
    const bg = Math.max(0, Math.round(barGapCss * dpr));
    const step = Math.max(1, bw + bg);

    const timeSpan = endTime - startTime;
    if (timeSpan <= 0 || step <= 0) {
      ctx.restore();
      return;
    }

    // Absolute time duration of one bar slot in audio time
    const barDuration = (step / width) * timeSpan;
    if (barDuration <= 0) {
      ctx.restore();
      return;
    }

    if (
      !this.pyramid ||
      this.currentSource !== source ||
      this.currentChannel !== channel
    ) {
      this.pyramid?.clear();
      this.pyramid = new BarPeakPyramid(source, channel);
      this.currentSource = source;
      this.currentChannel = channel;
    }

    const barPeaks: BarPeakBlock = await this.pyramid.getBarPeaks(
      startTime,
      endTime,
      barDuration,
    );

    const len = barPeaks.min.length;
    if (len === 0) {
      ctx.restore();
      return;
    }

    const barAlign = this.options.barAlign ?? "center";
    const symmetric = this.options.symmetric ?? true;
    const rounded =
      this.options.rounded ??
      (this.options.barRadius === undefined || this.options.barRadius > 0);
    const customRadius =
      this.options.barRadius !== undefined
        ? this.options.barRadius * dpr
        : undefined;
    const minBarHeight = (this.options.minBarHeight ?? 0) * dpr;

    const centerY = height / 2;
    const halfH = (height / 2) * Math.max(0.01, amplitudeScale);
    const fullH = height * Math.max(0.01, amplitudeScale);
    const halfBw = bw / 2;

    const bars: Array<{ x: number; maxVal: number; minVal: number }> = [];

    for (let k = barPeaks.kStart; k <= barPeaks.kEnd; k++) {
      const tCenter = (k + 0.5) * barPeaks.barDuration;
      const x = ((tCenter - startTime) / timeSpan) * width;

      // Cull bars completely outside canvas view
      if (x + halfBw < 0 || x - halfBw > width) {
        continue;
      }

      const idx = k - barPeaks.kStart;
      const maxVal = barPeaks.max[idx] ?? 0;
      const minVal = barPeaks.min[idx] ?? 0;

      bars.push({ x, maxVal, minVal });
    }

    const drawBars = (
      barsToDraw: Array<{ x: number; maxVal: number; minVal: number }>,
      barColor: string,
    ) => {
      if (barsToDraw.length === 0) return;

      if (customRadius !== undefined && customRadius === 0) {
        // Flat rectangular bars
        ctx.fillStyle = barColor;
        ctx.beginPath();
        for (const bar of barsToDraw) {
          const { topY, barHeight } = this.calculateBarGeometry(
            bar.maxVal,
            bar.minVal,
            barAlign,
            symmetric,
            centerY,
            halfH,
            fullH,
            halfBw,
            minBarHeight,
            height,
          );
          ctx.rect(bar.x - halfBw, topY, bw, Math.max(1, barHeight));
        }
        ctx.fill();
      } else if (
        customRadius !== undefined &&
        typeof ctx.roundRect === "function"
      ) {
        // Custom rounded rectangle bars
        ctx.fillStyle = barColor;
        ctx.beginPath();
        for (const bar of barsToDraw) {
          const { topY, barHeight } = this.calculateBarGeometry(
            bar.maxVal,
            bar.minVal,
            barAlign,
            symmetric,
            centerY,
            halfH,
            fullH,
            halfBw,
            minBarHeight,
            height,
          );
          const rad = Math.min(customRadius, halfBw, barHeight / 2);
          ctx.roundRect(bar.x - halfBw, topY, bw, Math.max(1, barHeight), rad);
        }
        ctx.fill();
      } else {
        // Pill / capsule bars using round lineCap
        ctx.strokeStyle = barColor;
        ctx.lineWidth = bw;
        ctx.lineCap = rounded ? "round" : "butt";
        ctx.beginPath();

        for (const bar of barsToDraw) {
          const { topY, bottomY } = this.calculateBarGeometry(
            bar.maxVal,
            bar.minVal,
            barAlign,
            symmetric,
            centerY,
            halfH,
            fullH,
            halfBw,
            minBarHeight,
            height,
          );

          if (rounded) {
            const y1 = topY + halfBw;
            const y2 = bottomY - halfBw;
            if (y2 <= y1) {
              ctx.moveTo(bar.x, y1);
              ctx.lineTo(bar.x, y1 + 0.001);
            } else {
              ctx.moveTo(bar.x, y1);
              ctx.lineTo(bar.x, y2);
            }
          } else {
            ctx.moveTo(bar.x, topY);
            ctx.lineTo(bar.x, bottomY);
          }
        }
        ctx.stroke();
      }
    };

    drawBars(bars, color);

    ctx.restore();
  }

  private calculateBarGeometry(
    maxVal: number,
    minVal: number,
    barAlign: "center" | "bottom" | "top",
    symmetric: boolean,
    centerY: number,
    halfH: number,
    fullH: number,
    halfBw: number,
    minBarHeight: number,
    canvasHeight: number,
  ): { topY: number; bottomY: number; barHeight: number } {
    let topY: number;
    let bottomY: number;

    if (barAlign === "bottom") {
      const peakAmp = Math.max(
        Math.abs(maxVal),
        Math.abs(minVal),
        minBarHeight > 0 ? minBarHeight / fullH : 0,
      );
      const effectiveH = Math.max(minBarHeight, peakAmp * fullH);
      bottomY = canvasHeight;
      topY = canvasHeight - effectiveH;
    } else if (barAlign === "top") {
      const peakAmp = Math.max(
        Math.abs(maxVal),
        Math.abs(minVal),
        minBarHeight > 0 ? minBarHeight / fullH : 0,
      );
      const effectiveH = Math.max(minBarHeight, peakAmp * fullH);
      topY = 0;
      bottomY = effectiveH;
    } else {
      // Center alignment
      if (symmetric) {
        const peakAmp = Math.max(
          Math.abs(maxVal),
          Math.abs(minVal),
          minBarHeight > 0 ? minBarHeight / (2 * halfH) : 0,
        );
        const effectiveHalfH = Math.max(
          minBarHeight / 2,
          halfBw,
          peakAmp * halfH,
        );
        topY = centerY - effectiveHalfH;
        bottomY = centerY + effectiveHalfH;
      } else {
        const topH = Math.max(halfBw, maxVal * halfH);
        const botH = Math.max(halfBw, Math.abs(minVal) * halfH);
        topY = centerY - topH;
        bottomY = centerY + botH;
      }
    }

    const barHeight = Math.max(minBarHeight, bottomY - topY);
    return { topY, bottomY, barHeight };
  }

  destroy(): void {
    this.pyramid?.clear();
    this.pyramid = null;
    this.currentSource = null;
  }
}
