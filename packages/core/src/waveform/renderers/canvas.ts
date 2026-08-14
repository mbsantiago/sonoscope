import type { WaveformRenderer, WaveformRenderInput } from "../types";

export class CanvasWaveformRenderer implements WaveformRenderer {
  readonly kind = "canvas2d" as const;

  render(input: WaveformRenderInput): void {
    const {
      canvas,
      peaks,
      color = "#38bdf8",
      progressColor,
      backgroundColor = "transparent",
      cursorColor = "#ffffff",
      playheadTime,
      startTime,
      endTime,
      amplitudeScale = 1.0,
    } = input;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const width = Math.max(1, Math.floor((rect.width || canvas.width) * dpr));
    const height = Math.max(
      1,
      Math.floor((rect.height || canvas.height) * dpr),
    );

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

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
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    if (len > 0) {
      // Determine if waveform is in sub-sample line mode vs envelope mode
      let maxSpread = 0;
      for (let i = 0; i < len; i++) {
        const spread = peaks.max[i]! - peaks.min[i]!;
        if (spread > maxSpread) maxSpread = spread;
      }
      const isLineMode = maxSpread < 0.04;

      const traceEnvelope = () => {
        ctx.beginPath();
        for (let i = 0; i < len; i++) {
          const x = (i / Math.max(1, len - 1)) * width;
          const maxVal = peaks.max[i]!;
          const y = centerY - maxVal * halfH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        for (let i = len - 1; i >= 0; i--) {
          const x = (i / Math.max(1, len - 1)) * width;
          const minVal = peaks.min[i]!;
          const y = centerY - minVal * halfH;
          ctx.lineTo(x, y);
        }
        ctx.closePath();
      };

      const traceLine = () => {
        ctx.beginPath();
        for (let i = 0; i < len; i++) {
          const x = (i / Math.max(1, len - 1)) * width;
          const sample = (peaks.max[i]! + peaks.min[i]!) / 2;
          const y = centerY - sample * halfH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      };

      if (isLineMode) {
        traceLine();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();
      } else {
        traceEnvelope();
        ctx.fillStyle = color;
        ctx.fill();
      }

      // If progressColor and playheadTime are provided, fill played portion
      if (
        progressColor &&
        playheadTime !== undefined &&
        playheadTime >= startTime &&
        endTime > startTime
      ) {
        const playRatio = Math.max(
          0,
          Math.min(1, (playheadTime - startTime) / (endTime - startTime)),
        );
        const playX = playRatio * width;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, playX, height);
        ctx.clip();
        if (isLineMode) {
          traceLine();
          ctx.strokeStyle = progressColor;
          ctx.lineWidth = 2 * dpr;
          ctx.stroke();
        } else {
          traceEnvelope();
          ctx.fillStyle = progressColor;
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // Draw playhead cursor line
    if (
      playheadTime !== undefined &&
      playheadTime >= startTime &&
      playheadTime <= endTime &&
      endTime > startTime
    ) {
      const playX =
        ((playheadTime - startTime) / (endTime - startTime)) * width;
      ctx.strokeStyle = cursorColor;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, height);
      ctx.stroke();
    }

    ctx.restore();
  }

  destroy(): void {}
}
