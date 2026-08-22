import type { WaveformRenderer, WaveformRenderInput } from "../types";

export class CanvasWaveformRenderer implements WaveformRenderer {
  readonly kind = "canvas2d" as const;

  render(input: WaveformRenderInput): void {
    const {
      canvas,
      peaks,
      color = "#38bdf8",
      backgroundColor = "transparent",
      amplitudeScale = 1.0,
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

    const centerY = height / 2;
    const halfH = (height / 2) * Math.max(0.01, amplitudeScale);
    const len = peaks.min.length;

    // Draw center zero-axis baseline
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    if (len > 0) {
      const hasX = Boolean(peaks.x && peaks.x.length === len);
      const isLineMode = Boolean(peaks.isLineMode);

      if (isLineMode) {
        ctx.beginPath();
        for (let i = 0; i < len; i++) {
          const x = hasX ? peaks.x![i]! : (i / Math.max(1, len - 1)) * width;
          const sample = (peaks.max[i]! + peaks.min[i]!) / 2;
          const y = centerY - sample * halfH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.beginPath();
        for (let i = 0; i < len; i++) {
          const x = hasX ? peaks.x![i]! : (i / Math.max(1, len - 1)) * width;
          const maxVal = peaks.max[i]!;
          const y = centerY - maxVal * halfH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        for (let i = len - 1; i >= 0; i--) {
          const x = hasX ? peaks.x![i]! : (i / Math.max(1, len - 1)) * width;
          const minVal = peaks.min[i]!;
          const y = centerY - minVal * halfH;
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      }
    }

    ctx.restore();
  }

  destroy(): void {}
}
