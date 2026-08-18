import type {
  FrequencyRulerFrame,
  FrequencyRulerProgram,
  FrequencyRulerRenderInput,
} from "../types";
import { hzToScale } from "../../spectrogram/frequency-scale";
import { computeFrequencyTicks, formatFrequencyLabel } from "../ticks";

export class BoxesFrequencyRulerProgram implements FrequencyRulerProgram {
  readonly name = "boxes" as const;

  draw(
    ctx: CanvasRenderingContext2D,
    input: FrequencyRulerRenderInput,
    frame: FrequencyRulerFrame,
  ): void {
    const {
      minFrequency,
      maxFrequency,
      frequencyScale = "linear",
      color = "#e2e8f0",
      backgroundColor = "#0b0f17",
      tickColor = "#334155",
      labelColor,
      font,
      frequencyFormat = "auto",
      minMajorPixelSpacing = 45,
    } = input;

    const { width, height, dpr } = frame;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    const { majorTicks } = computeFrequencyTicks(
      minFrequency,
      maxFrequency,
      height / dpr,
      frequencyScale,
      minMajorPixelSpacing,
    );

    const actualBorderColor = tickColor ?? color;
    const actualLabelColor = labelColor ?? color;

    const minScaled = hzToScale(
      Math.max(frequencyScale === "log" ? 1 : 0, minFrequency),
      frequencyScale,
    );
    const maxScaled = hzToScale(
      Math.max(minFrequency + 1, maxFrequency),
      frequencyScale,
    );
    const span = Math.max(0.000001, maxScaled - minScaled);

    const getY = (hz: number) => {
      const s = hzToScale(
        Math.max(frequencyScale === "log" ? 1 : 0, hz),
        frequencyScale,
      );
      return (1 - (s - minScaled) / span) * height;
    };

    // Draw outer left and right container borders
    ctx.strokeStyle = actualBorderColor;
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(0.5 * dpr, 0);
    ctx.lineTo(0.5 * dpr, height);
    ctx.moveTo(width - 0.5 * dpr, 0);
    ctx.lineTo(width - 0.5 * dpr, height);
    ctx.stroke();

    // Draw horizontal dividers at all tick boundaries
    ctx.beginPath();
    for (let i = 0; i < majorTicks.length; i++) {
      const hz = majorTicks[i]!;
      const y = Math.round(getY(hz)) + 0.5 * dpr;
      if (y >= 0 && y <= height) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
    }
    ctx.stroke();

    const fontSize = Math.max(9, Math.min(13, Math.floor(10 * dpr)));
    ctx.font =
      font ??
      `500 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    // Draw labels centered inside each boxed interval
    if (majorTicks.length >= 2) {
      for (let i = 0; i < majorTicks.length - 1; i++) {
        const fLower = majorTicks[i]!;
        const fUpper = majorTicks[i + 1]!;
        const yLower = getY(fLower);
        const yUpper = getY(fUpper);
        const cellHeight = Math.abs(yLower - yUpper);
        const centerY = (yLower + yUpper) / 2;

        if (cellHeight >= fontSize + 2 * dpr) {
          const text = formatFrequencyLabel(fUpper, frequencyFormat);
          const metrics = ctx.measureText(text);
          const padX = 3 * dpr;
          const padY = 2 * dpr;

          // Clear background under label so text never touches or overlaps lines
          ctx.fillStyle = backgroundColor;
          ctx.fillRect(
            width / 2 - metrics.width / 2 - padX,
            centerY - fontSize / 2 - padY,
            metrics.width + padX * 2,
            fontSize + padY * 2,
          );

          ctx.fillStyle = actualLabelColor;
          ctx.fillText(text, width / 2, centerY);
        }
      }
    } else if (majorTicks.length === 1) {
      const text = formatFrequencyLabel(majorTicks[0]!, frequencyFormat);
      ctx.fillStyle = actualLabelColor;
      ctx.fillText(text, width / 2, height / 2);
    }

    ctx.restore();
  }
}
