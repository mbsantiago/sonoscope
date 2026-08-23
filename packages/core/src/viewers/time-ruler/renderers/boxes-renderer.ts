import type {
  TimeRulerFrame,
  TimeRulerRenderer,
  TimeRulerRenderInput,
} from "../types";
import { computeTimeTicks, formatTimeLabel } from "../ticks";

export class BoxesTimeRulerRenderer implements TimeRulerRenderer {
  readonly name = "boxes" as const;

  draw(
    ctx: CanvasRenderingContext2D,
    input: TimeRulerRenderInput,
    frame: TimeRulerFrame,
  ): void {
    const {
      startTime,
      endTime,
      color = "#e2e8f0",
      backgroundColor = "#0b0f17",
      tickColor = "#334155",
      labelColor,
      font,
      timeFormat = "auto",
      minMajorPixelSpacing = 90,
    } = input;

    const { width, height, dpr } = frame;
    const duration = Math.max(0.000001, endTime - startTime);

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    // Draw background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    const { majorStep } = computeTimeTicks(
      startTime,
      endTime,
      width / dpr,
      minMajorPixelSpacing,
    );

    const actualBorderColor = tickColor ?? color;
    const actualLabelColor = labelColor ?? color;

    // Draw top and bottom container borders
    ctx.strokeStyle = actualBorderColor;
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(0, 0.5 * dpr);
    ctx.lineTo(width, 0.5 * dpr);
    ctx.moveTo(0, height - 0.5 * dpr);
    ctx.lineTo(width, height - 0.5 * dpr);
    ctx.stroke();

    const startMajor = Math.floor(startTime / majorStep) * majorStep;
    const endMajor = Math.ceil(endTime / majorStep) * majorStep;

    const fontSize = Math.max(9, Math.min(13, Math.floor(10 * dpr)));
    ctx.font =
      font ??
      `500 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    for (
      let t = startMajor;
      t <= endMajor + 1e-9;
      t = Math.round((t + majorStep) / majorStep) * majorStep
    ) {
      const x1 = ((t - startTime) / duration) * width;
      const x2 = ((t + majorStep - startTime) / duration) * width;

      // Draw vertical separator at start of cell
      ctx.beginPath();
      ctx.strokeStyle = actualBorderColor;
      ctx.lineWidth = 1 * dpr;
      ctx.moveTo(Math.round(x1) + 0.5 * dpr, 0);
      ctx.lineTo(Math.round(x1) + 0.5 * dpr, height);
      ctx.stroke();

      // Text label inside the cell
      const cellCenterX = (x1 + x2) / 2;
      const cellWidth = x2 - x1;
      const label = formatTimeLabel(t, majorStep, timeFormat);
      const textWidth = ctx.measureText(label).width;

      if (cellWidth >= textWidth + 8 * dpr) {
        if (cellCenterX > -textWidth && cellCenterX < width + textWidth) {
          ctx.fillStyle = actualLabelColor;
          ctx.fillText(label, cellCenterX, height / 2);
        }
      } else if (cellWidth >= textWidth * 0.7) {
        // Truncate or compact if space is tighter
        if (cellCenterX > 0 && cellCenterX < width) {
          ctx.fillStyle = actualLabelColor;
          ctx.fillText(label, cellCenterX, height / 2);
        }
      }
    }

    ctx.restore();
  }
}
