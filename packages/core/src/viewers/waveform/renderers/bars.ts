import type {
  BarPeakBlock,
  WaveformRenderer,
  WaveformRenderInput,
} from "../types";

export interface BarsWaveformRendererOptions {
  /**
   * Width of each bar in CSS pixels.
   * Default: 3
   */
  barWidth?: number | undefined;

  /**
   * Gap between adjacent bars in CSS pixels.
   * Default: 2
   */
  barGap?: number | undefined;

  /**
   * Corner radius for bars in CSS pixels.
   * If undefined and rounded is true, pill/capsule shapes are rendered (radius = barWidth / 2).
   * If 0, flat rectangular bars are rendered.
   * Default: undefined
   */
  barRadius?: number | undefined;

  /**
   * Whether bar ends are rounded (pill/capsule shape).
   * Default: true
   */
  rounded?: boolean | undefined;

  /**
   * Alignment of bars relative to the canvas height:
   * - "center": Bars expand vertically from the horizontal centerline.
   * - "bottom": Bars grow upwards from the bottom edge.
   * - "top": Bars grow downwards from the top edge.
   * Default: "center"
   */
  barAlign?: "center" | "bottom" | "top" | undefined;

  /**
   * Whether to mirror amplitude symmetrically around center in "center" mode.
   * Default: true
   */
  symmetric?: boolean | undefined;

  /**
   * Minimum height of a bar in CSS pixels.
   * If 0, bars taper down to a circle of diameter barWidth during silence.
   * Default: 0
   */
  minBarHeight?: number | undefined;
}

export class BarsWaveformRenderer implements WaveformRenderer {
  readonly kind = "bars" as const;
  private options: BarsWaveformRendererOptions;

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

  render(input: WaveformRenderInput): void {
    const {
      canvas,
      peaks,
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

    const len = peaks.min.length;
    if (len === 0) {
      ctx.restore();
      return;
    }

    const rect =
      typeof canvas.getBoundingClientRect === "function"
        ? canvas.getBoundingClientRect()
        : null;
    const dpr = (rect && rect.width > 0 ? width / rect.width : 1) || 1;

    const barWidthCss = Math.max(0.5, this.options.barWidth ?? 3);
    const barGapCss = Math.max(0, this.options.barGap ?? 2);
    const bw = Math.max(1, barWidthCss * dpr);
    const bg = barGapCss * dpr;
    const step = bw + bg;

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

    const barPeaks = peaks as Partial<BarPeakBlock>;
    const hasPrecomputedBarPeaks =
      typeof barPeaks.barDuration === "number" &&
      typeof barPeaks.kStart === "number" &&
      typeof barPeaks.kEnd === "number";

    const effectiveBarDuration = hasPrecomputedBarPeaks
      ? barPeaks.barDuration!
      : barDuration;

    const kStart = hasPrecomputedBarPeaks
      ? barPeaks.kStart!
      : Math.max(
          0,
          Math.floor((startTime - effectiveBarDuration) / effectiveBarDuration),
        );
    const kEnd = hasPrecomputedBarPeaks
      ? barPeaks.kEnd!
      : Math.ceil((endTime + effectiveBarDuration) / effectiveBarDuration);

    const bars: Array<{ x: number; maxVal: number; minVal: number }> = [];

    for (let k = kStart; k <= kEnd; k++) {
      const tCenter = (k + 0.5) * effectiveBarDuration;
      const x = ((tCenter - startTime) / timeSpan) * width;

      // Cull bars completely outside canvas view
      if (x + halfBw < 0 || x - halfBw > width) {
        continue;
      }

      let maxVal = 0;
      let minVal = 0;

      if (hasPrecomputedBarPeaks) {
        const idx = k - barPeaks.kStart!;
        maxVal = peaks.max[idx] ?? 0;
        minVal = peaks.min[idx] ?? 0;
      } else {
        // Fallback for standard PeakBlock without precomputed bar peaks
        const tStart = k * effectiveBarDuration;
        const tEnd = (k + 1) * effectiveBarDuration;
        const pStart = Math.max(
          0,
          Math.min(
            len - 1,
            Math.round(((tStart - startTime) / timeSpan) * len),
          ),
        );
        const pEnd = Math.max(
          pStart + 1,
          Math.min(len, Math.round(((tEnd - startTime) / timeSpan) * len)),
        );

        let mx = -Infinity;
        let mn = Infinity;
        for (let j = pStart; j < pEnd; j++) {
          const vMax = peaks.max[j]!;
          const vMin = peaks.min[j]!;
          if (vMax > mx) mx = vMax;
          if (vMin < mn) mn = vMin;
        }
        maxVal = mx === -Infinity ? 0 : mx;
        minVal = mn === Infinity ? 0 : mn;
      }

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
    if (barAlign === "bottom") {
      const peak = Math.max(Math.abs(maxVal), Math.abs(minVal));
      const barH = Math.max(minBarHeight, halfBw * 2, peak * fullH);
      return {
        topY: canvasHeight - barH,
        bottomY: canvasHeight,
        barHeight: barH,
      };
    }

    if (barAlign === "top") {
      const peak = Math.max(Math.abs(maxVal), Math.abs(minVal));
      const barH = Math.max(minBarHeight, halfBw * 2, peak * fullH);
      return {
        topY: 0,
        bottomY: barH,
        barHeight: barH,
      };
    }

    // Default "center"
    if (symmetric) {
      const peak = Math.max(Math.abs(maxVal), Math.abs(minVal));
      const barH = Math.max(minBarHeight, halfBw * 2, peak * 2 * halfH);
      return {
        topY: centerY - barH / 2,
        bottomY: centerY + barH / 2,
        barHeight: barH,
      };
    }

    const posH = Math.max(halfBw, maxVal * halfH);
    const negH = Math.max(halfBw, -minVal * halfH);
    const topY = centerY - posH;
    const bottomY = centerY + negH;
    return {
      topY,
      bottomY,
      barHeight: bottomY - topY,
    };
  }

  destroy(): void {}
}
