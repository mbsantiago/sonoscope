import type {
  FrequencyRulerFrame,
  FrequencyRulerProgram,
  FrequencyRulerRenderInput,
} from "../types";
import { hzToScale } from "../../spectrogram/frequency-scale";
import { computeFrequencyTicks, formatFrequencyLabel } from "../ticks";

export class TicksFrequencyRulerProgram implements FrequencyRulerProgram {
  readonly name = "ticks" as const;

  draw(
    ctx: CanvasRenderingContext2D,
    input: FrequencyRulerRenderInput,
    frame: FrequencyRulerFrame,
  ): void {
    const {
      minFrequency,
      maxFrequency,
      frequencyScale = "linear",
      color = "#94a3b8",
      backgroundColor = "transparent",
      tickColor,
      labelColor,
      font,
      tickPosition = "right",
      frequencyFormat = "auto",
      minMajorPixelSpacing = 45,
    } = input;

    const { width, height, dpr } = frame;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    if (backgroundColor && backgroundColor !== "transparent") {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }

    const { majorTicks, minorTicks } = computeFrequencyTicks(
      minFrequency,
      maxFrequency,
      height / dpr,
      frequencyScale,
      minMajorPixelSpacing,
    );

    const actualTickColor = tickColor ?? color;
    const actualLabelColor = labelColor ?? color;

    const minScaled = hzToScale(Math.max(frequencyScale === "log" ? 1 : 0, minFrequency), frequencyScale);
    const maxScaled = hzToScale(Math.max(minFrequency + 1, maxFrequency), frequencyScale);
    const span = Math.max(0.000001, maxScaled - minScaled);

    const getY = (hz: number) => {
      const s = hzToScale(Math.max(frequencyScale === "log" ? 1 : 0, hz), frequencyScale);
      return (1 - (s - minScaled) / span) * height;
    };

    // Draw baseline border
    ctx.strokeStyle = actualTickColor;
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    if (tickPosition === "right") {
      ctx.moveTo(width - 0.5 * dpr, 0);
      ctx.lineTo(width - 0.5 * dpr, height);
    } else {
      ctx.moveTo(0.5 * dpr, 0);
      ctx.lineTo(0.5 * dpr, height);
    }
    ctx.stroke();

    const majorTickLen = Math.min(width * 0.25, 6 * dpr);
    const minorTickLen = Math.min(width * 0.15, 3 * dpr);

    // Draw minor ticks
    if (minorTicks.length > 0) {
      ctx.beginPath();
      for (const hz of minorTicks) {
        const y = Math.round(getY(hz)) + 0.5 * dpr;
        if (y < 0 || y > height) continue;

        if (tickPosition === "right") {
          ctx.moveTo(width - minorTickLen, y);
          ctx.lineTo(width, y);
        } else {
          ctx.moveTo(0, y);
          ctx.lineTo(minorTickLen, y);
        }
      }
      ctx.stroke();
    }

    // Draw major ticks
    ctx.beginPath();
    for (const hz of majorTicks) {
      const y = Math.round(getY(hz)) + 0.5 * dpr;
      if (y < 0 || y > height) continue;

      if (tickPosition === "right") {
        ctx.moveTo(width - majorTickLen, y);
        ctx.lineTo(width, y);
      } else {
        ctx.moveTo(0, y);
        ctx.lineTo(majorTickLen, y);
      }
    }
    ctx.stroke();

    // Draw labels
    ctx.fillStyle = actualLabelColor;
    const fontSize = Math.max(9, Math.min(13, Math.floor(10 * dpr)));
    ctx.font =
      font ??
      `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`;
    ctx.textBaseline = "middle";
    ctx.textAlign = tickPosition === "right" ? "right" : "left";

    const textMargin = 3 * dpr;

    for (const hz of majorTicks) {
      const y = getY(hz);
      if (y < 6 * dpr || y > height - 6 * dpr) {
        // slight adjustment near edges so text does not clip
      }
      const clampedY = Math.max(7 * dpr, Math.min(height - 7 * dpr, y));
      const text = formatFrequencyLabel(hz, frequencyFormat);
      const textX =
        tickPosition === "right"
          ? width - majorTickLen - textMargin
          : majorTickLen + textMargin;

      ctx.fillText(text, textX, clampedY);
    }

    ctx.restore();
  }
}
