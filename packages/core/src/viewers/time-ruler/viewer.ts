import type { ISonoscope } from "../../types";
import type {
  ITimeRulerViewer,
  ResolvedTimeRulerConfig,
  TimeRulerEvents,
  TimeRulerOptions,
  TimeRulerProgram,
  TimeRulerProgramName,
  TimeRulerStatus,
  TimeRulerViewport,
} from "./types";
import { TypedEventEmitter } from "../../events";
import { clampViewportTimes } from "../../viewport-math";
import { BoxesTimeRulerProgram } from "./programs/boxes-program";
import { TicksTimeRulerProgram } from "./programs/ticks-program";

function resolveTimeRulerProgram(
  program: TimeRulerProgramName | TimeRulerProgram | undefined,
): TimeRulerProgram {
  if (typeof program === "object" && program !== null && "draw" in program) {
    return program;
  }
  if (program === "boxes") {
    return new BoxesTimeRulerProgram();
  }
  return new TicksTimeRulerProgram();
}

function resolveTimeRulerConfig(
  input: Partial<TimeRulerOptions> = {},
  duration = 0,
): ResolvedTimeRulerConfig {
  const minViewportDuration = Math.max(
    0.001,
    input.minViewportDuration ?? 0.05,
  );
  const maxViewportDuration = Math.max(
    minViewportDuration,
    input.maxViewportDuration !== undefined
      ? input.maxViewportDuration
      : Math.min(3600, duration || 3600),
  );

  const initialStart = input.startTime ?? 0;
  const initialEnd = input.endTime ?? duration;

  const clamped = clampViewportTimes(
    initialStart,
    initialEnd,
    duration,
    minViewportDuration,
    maxViewportDuration,
  );

  return {
    autoRender: input.autoRender ?? true,
    startTime: clamped.startTime,
    endTime: clamped.endTime,
    minViewportDuration,
    maxViewportDuration,
    color: input.color ?? "#94a3b8",
    backgroundColor: input.backgroundColor ?? "transparent",
    tickColor: input.tickColor ?? input.color ?? "#94a3b8",
    labelColor: input.labelColor ?? input.color ?? "#94a3b8",
    font:
      input.font ??
      '10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    tickPosition: input.tickPosition ?? "top",
    timeFormat: input.timeFormat ?? "auto",
    minMajorPixelSpacing: input.minMajorPixelSpacing ?? 75,
    program: input.program ?? "ticks",
  };
}

export class TimeRulerViewer implements ITimeRulerViewer {
  private readonly events = new TypedEventEmitter<TimeRulerEvents>();
  private readonly canvas: HTMLCanvasElement;
  private readonly scope: ISonoscope;
  private config: ResolvedTimeRulerConfig;
  private programInstance: TimeRulerProgram;
  private scopeCleanup: Array<() => void> = [];
  private renderQueued = false;
  private renderRunning = false;
  private renderAgain = false;
  private requestCounter = 0;
  private status: TimeRulerStatus = { state: "idle" };

  constructor(
    scope: ISonoscope,
    canvas: HTMLCanvasElement,
    options?: Partial<TimeRulerOptions>,
  ) {
    this.scope = scope;
    this.canvas = canvas;
    this.config = resolveTimeRulerConfig(options, scope.getDuration());
    this.programInstance = resolveTimeRulerProgram(this.config.program);

    this.bindScope();

    if (this.config.autoRender) {
      this.requestRender();
    }
  }

  private bindScope(): void {
    for (const cleanup of this.scopeCleanup) cleanup();
    this.scopeCleanup = [];

    const unlistenViewport = this.scope.on("viewportchange", (e) => {
      const currentStart = this.config.startTime;
      const currentEnd = this.config.endTime;
      if (
        Math.abs(currentStart - e.viewport.startTime) < 1e-6 &&
        Math.abs(currentEnd - e.viewport.endTime) < 1e-6
      ) {
        return;
      }
      this.config.startTime = e.viewport.startTime;
      this.config.endTime = e.viewport.endTime;
      this.events.emit("viewportchange", { viewport: this.getViewport() });
      this.requestRender();
    });

    const unlistenSource = this.scope.on("sourcechange", () => {
      this.requestRender();
    });

    this.scopeCleanup.push(unlistenViewport, unlistenSource);
  }

  getScope(): ISonoscope {
    return this.scope;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getStatus(): TimeRulerStatus {
    return { ...this.status };
  }

  getViewport(): TimeRulerViewport {
    return {
      startTime: this.config.startTime,
      endTime: this.config.endTime,
    };
  }

  getConfig(): ResolvedTimeRulerConfig {
    return { ...this.config };
  }

  updateConfig(input: Partial<TimeRulerOptions>): void {
    const duration = this.scope.getDuration();
    const baseConfig = { ...this.config, ...input };
    this.config = resolveTimeRulerConfig(baseConfig, duration);
    this.programInstance = resolveTimeRulerProgram(this.config.program);

    this.events.emit("configchange", { config: this.getConfig() });
    this.requestRender();
  }

  setConfig(input: Partial<TimeRulerOptions>): void {
    this.updateConfig(input);
  }

  canvasToTime(x: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || this.canvas.width || 1;
    const norm = Math.max(0, Math.min(1, x / width));
    return (
      this.config.startTime +
      norm * (this.config.endTime - this.config.startTime)
    );
  }

  timeToCanvas(time: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || this.canvas.width || 1;
    const duration = Math.max(
      0.000001,
      this.config.endTime - this.config.startTime,
    );
    return ((time - this.config.startTime) / duration) * width;
  }

  async render(): Promise<void> {
    if (this.status.state === "destroyed") return;
    const requestId = `ruler-${++this.requestCounter}`;
    this.status = { state: "rendering" };
    this.events.emit("renderstart", { requestId });

    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      const err = new Error("Canvas 2D context not available");
      this.status = { state: "error", error: err };
      this.events.emit("error", { error: err });
      return;
    }

    const parent = this.canvas.parentElement;
    const parentRect = parent?.getBoundingClientRect();
    const rect = this.canvas.getBoundingClientRect();
    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const logicalWidth = Math.max(
      1,
      Math.round(
        (parent && parentRect && parentRect.width > 0 ? parentRect.width : 0) ||
          this.canvas.clientWidth ||
          rect.width ||
          this.canvas.width / dpr ||
          1,
      ),
    );
    const logicalHeight = Math.max(
      1,
      Math.round(
        (parent && parentRect && parentRect.height > 0 ? parentRect.height : 0) ||
          this.canvas.clientHeight ||
          rect.height ||
          this.canvas.height / dpr ||
          1,
      ),
    );
    const width = Math.max(1, Math.round(logicalWidth * dpr));
    const height = Math.max(1, Math.round(logicalHeight * dpr));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    const vp = this.getViewport();

    this.programInstance.draw(
      ctx,
      {
        canvas: this.canvas,
        startTime: vp.startTime,
        endTime: vp.endTime,
        totalDuration: this.scope.getDuration(),
        color: this.config.color,
        backgroundColor: this.config.backgroundColor,
        tickColor: this.config.tickColor,
        labelColor: this.config.labelColor,
        font: this.config.font,
        tickPosition: this.config.tickPosition,
        timeFormat: this.config.timeFormat,
        minMajorPixelSpacing: this.config.minMajorPixelSpacing,
      },
      { width, height, dpr },
    );

    this.status = { state: "ready" };
    this.events.emit("rendercomplete", { requestId });
  }

  requestRender(): void {
    if (this.status.state === "destroyed") return;
    this.renderAgain = true;
    if (this.renderQueued || this.renderRunning) return;
    this.renderQueued = true;
    void Promise.resolve().then(() => this.renderRequested());
  }

  private async renderRequested(): Promise<void> {
    this.renderQueued = false;
    if (this.renderRunning) return;
    this.renderRunning = true;
    try {
      while (this.renderAgain && this.status.state !== "destroyed") {
        this.renderAgain = false;
        await this.render();
      }
    } finally {
      this.renderRunning = false;
    }
  }

  on<Name extends keyof TimeRulerEvents>(
    name: Name,
    handler: (event: TimeRulerEvents[Name]) => void,
  ): () => void {
    return this.events.on(name, handler);
  }

  destroy(): void {
    this.status = { state: "destroyed" };
    this.events.clear();
    for (const cleanup of this.scopeCleanup) cleanup();
    this.scopeCleanup = [];
  }
}
