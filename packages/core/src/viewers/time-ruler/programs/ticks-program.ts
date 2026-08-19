import type {
  TimeRulerFrame,
  TimeRulerProgram,
  TimeRulerRenderInput,
} from "../types";
import { computeTimeTicks, formatTimeLabel } from "../ticks";

export class TicksTimeRulerProgram implements TimeRulerProgram {
  readonly name = "ticks" as const;

  draw(
    ctx: CanvasRenderingContext2D,
    input: TimeRulerRenderInput,
    frame: TimeRulerFrame,
  ): void {
    const {
      startTime,
      endTime,
      color = "#94a3b8",
      backgroundColor = "transparent",
      tickColor,
      labelColor,
      font,
      tickPosition = "top",
      timeFormat = "auto",
      minMajorPixelSpacing = 75,
    } = input;

    const { width, height, dpr } = frame;
    const duration = Math.max(0.000001, endTime - startTime);

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    if (backgroundColor && backgroundColor !== "transparent") {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }

    const { majorStep, majorTicks, minorTicks } = computeTimeTicks(
      startTime,
      endTime,
      width / dpr,
      minMajorPixelSpacing,
    );

    const actualTickColor = tickColor ?? color;
    const actualLabelColor = labelColor ?? color;

    // Draw baseline border
    ctx.strokeStyle = actualTickColor;
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    if (tickPosition === "top") {
      ctx.moveTo(0, 0.5 * dpr);
      ctx.lineTo(width, 0.5 * dpr);
    } else {
      ctx.moveTo(0, height - 0.5 * dpr);
      ctx.lineTo(width, height - 0.5 * dpr);
    }
    ctx.stroke();

    const majorTickH = Math.min(height * 0.45, 8 * dpr);
    const minorTickH = Math.min(height * 0.25, 4 * dpr);

    // Draw minor ticks
    ctx.strokeStyle = actualTickColor;
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();

    for (const tick of minorTicks) {
      const x = Math.round(((tick - startTime) / duration) * width) + 0.5 * dpr;
      if (x < 0 || x > width) continue;

      if (tickPosition === "top") {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, minorTickH);
      } else if (tickPosition === "bottom") {
        ctx.moveTo(x, height);
        ctx.lineTo(x, height - minorTickH);
      } else {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, minorTickH);
        ctx.moveTo(x, height);
        ctx.lineTo(x, height - minorTickH);
      }
    }
    ctx.stroke();

    // Draw major ticks
    ctx.beginPath();
    for (const tick of majorTicks) {
      const x = Math.round(((tick - startTime) / duration) * width) + 0.5 * dpr;
      if (x < 0 || x > width) continue;

      if (tickPosition === "top") {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, majorTickH);
      } else if (tickPosition === "bottom") {
        ctx.moveTo(x, height);
        ctx.lineTo(x, height - majorTickH);
      } else {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, majorTickH);
        ctx.moveTo(x, height);
        ctx.lineTo(x, height - majorTickH);
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

    for (const tick of majorTicks) {
      const x = ((tick - startTime) / duration) * width;
      const text = formatTimeLabel(tick, majorStep, timeFormat);
      const metrics = ctx.measureText(text);
      const textWidth = metrics.width;

      let drawX = x + 3 * dpr;
      if (drawX + textWidth > width - 4 * dpr) {
        drawX = x - textWidth - 3 * dpr;
      }
      if (drawX < 4 * dpr) {
        drawX = 4 * dpr;
      }

      const drawY = tickPosition === "top" ? height * 0.55 : height * 0.45;

      ctx.fillText(text, drawX, drawY);
    }

    ctx.restore();
  }
}
