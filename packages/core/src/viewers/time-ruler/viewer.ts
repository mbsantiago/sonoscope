import type { IViewportController, ViewportConfig } from "../../types";
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
import { attachAutoResize } from "../../auto-resize";
import { TypedEventEmitter } from "../../events";
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
): ResolvedTimeRulerConfig {
  return {
    autoRender: input.autoRender ?? true,
    color: input.color ?? "#94a3b8",
    backgroundColor: input.backgroundColor ?? "transparent",
    tickColor: input.tickColor ?? input.color ?? "#94a3b8",
    labelColor: input.labelColor ?? input.color ?? "#94a3b8",
    font:
      input.font ??
      '10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    tickPosition: input.tickPosition ?? "bottom",
    timeFormat: input.timeFormat ?? "auto",
    minMajorPixelSpacing: input.minMajorPixelSpacing ?? 75,
    program: input.program ?? "ticks",
  };
}

export class TimeRulerViewer implements ITimeRulerViewer {
  private readonly events = new TypedEventEmitter<TimeRulerEvents>();
  private readonly canvas: HTMLCanvasElement;
  private readonly viewport: IViewportController;
  private config: ResolvedTimeRulerConfig;
  private programInstance: TimeRulerProgram;
  private viewportCleanup: Array<() => void> = [];
  private resizeCleanup: (() => void) | undefined;
  private renderQueued = false;
  private renderRunning = false;
  private renderAgain = false;
  private requestCounter = 0;
  private status: TimeRulerStatus = { state: "idle" };
  private lastViewportStartTime: number;
  private lastViewportEndTime: number;

  constructor(
    canvas: HTMLCanvasElement,
    viewport: IViewportController,
    options?: Partial<TimeRulerOptions>,
  ) {
    if (!canvas) {
      throw new Error("TimeRulerViewer requires a canvas");
    }
    if (!viewport) {
      throw new Error("TimeRulerViewer requires a viewport controller");
    }

    this.viewport = viewport;
    this.canvas = canvas;
    this.config = resolveTimeRulerConfig(options);
    const initialViewport = viewport.getViewport();
    this.lastViewportStartTime = initialViewport.startTime;
    this.lastViewportEndTime = initialViewport.endTime;
    this.programInstance = resolveTimeRulerProgram(this.config.program);

    this.bindViewport();
    if (options?.autoResize !== false) {
      this.resizeCleanup = attachAutoResize(this.canvas, {
        devicePixelRatio: options?.devicePixelRatio,
        onResize: () => this.requestRender(),
      });
    }

    if (this.config.autoRender) {
      this.requestRender();
    }
  }

  private bindViewport(): void {
    for (const cleanup of this.viewportCleanup) cleanup();
    this.viewportCleanup = [];

    const unlistenViewport = this.viewport.on("viewportchange", (e) => {
      if (
        e.viewport.startTime === this.lastViewportStartTime &&
        e.viewport.endTime === this.lastViewportEndTime
      ) {
        return;
      }
      this.lastViewportStartTime = e.viewport.startTime;
      this.lastViewportEndTime = e.viewport.endTime;
      this.events.emit("viewportchange", { viewport: e.viewport });
      this.requestRender();
    });

    this.viewportCleanup.push(unlistenViewport);
  }

  getViewportController(): IViewportController {
    return this.viewport;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getStatus(): TimeRulerStatus {
    return { ...this.status };
  }

  getViewport(): TimeRulerViewport {
    const vp = this.viewport.getViewport();
    return {
      startTime: vp.startTime,
      endTime: vp.endTime,
    };
  }

  setViewport(vp: Partial<ViewportConfig>): void {
    this.viewport.setViewport(vp);
  }

  getConfig(): ResolvedTimeRulerConfig {
    return { ...this.config };
  }

  updateConfig(input: Partial<TimeRulerOptions>): void {
    const baseConfig = { ...this.config, ...input };
    this.config = resolveTimeRulerConfig(baseConfig);
    this.programInstance = resolveTimeRulerProgram(this.config.program);

    this.events.emit("configchange", { config: this.getConfig() });
    this.requestRender();
  }

  setConfig(input: Partial<TimeRulerOptions>): void {
    this.updateConfig(input);
  }

  canvasToTime(x: number): number {
    const width = this.canvas.width || 1;
    const norm = Math.max(0, Math.min(1, x / width));
    const viewport = this.getViewport();
    return viewport.startTime + norm * (viewport.endTime - viewport.startTime);
  }

  timeToCanvas(time: number): number {
    const viewport = this.getViewport();
    const span = Math.max(1e-6, viewport.endTime - viewport.startTime);
    const width = this.canvas.width || 1;
    const norm = (time - viewport.startTime) / span;
    return norm * width;
  }

  async render(): Promise<void> {
    if (this.status.state === "destroyed") return;
    const requestId = `time-ruler-${++this.requestCounter}`;
    this.status = { state: "rendering" };
    this.events.emit("renderstart", { requestId });

    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      const err = new Error("Canvas 2D context not available");
      this.status = { state: "error", error: err };
      this.events.emit("error", { error: err });
      return;
    }

    const width = Math.max(1, this.canvas.width || 1);
    const height = Math.max(1, this.canvas.height || 1);
    const vp = this.viewport.getViewport();

    this.programInstance.draw(
      ctx,
      {
        canvas: this.canvas,
        startTime: vp.startTime,
        endTime: vp.endTime,
        totalDuration: vp.totalDuration,
        color: this.config.color,
        backgroundColor: this.config.backgroundColor,
        tickColor: this.config.tickColor,
        labelColor: this.config.labelColor,
        font: this.config.font,
        tickPosition: this.config.tickPosition,
        timeFormat: this.config.timeFormat,
        minMajorPixelSpacing: this.config.minMajorPixelSpacing,
      },
      { width, height, dpr: 1 },
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
    for (const cleanup of this.viewportCleanup) cleanup();
    this.viewportCleanup = [];
    this.resizeCleanup?.();
    this.resizeCleanup = undefined;
  }
}
