import type {
  FrequencyScale,
  IViewportController,
  ViewportConfig,
} from "../../types";
import type {
  FrequencyRulerEvents,
  FrequencyRulerOptions,
  FrequencyRulerProgram,
  FrequencyRulerProgramName,
  FrequencyRulerStatus,
  FrequencyRulerViewport,
  IFrequencyRulerViewer,
  ResolvedFrequencyRulerConfig,
} from "./types";
import { attachAutoResize } from "../../auto-resize";
import { TypedEventEmitter } from "../../events";
import { hzToScale, scaleToHz } from "../spectrogram/frequency-scale";
import { BoxesFrequencyRulerProgram } from "./programs/boxes-program";
import { TicksFrequencyRulerProgram } from "./programs/ticks-program";

function resolveFrequencyRulerProgram(
  program: FrequencyRulerProgramName | FrequencyRulerProgram | undefined,
): FrequencyRulerProgram {
  if (typeof program === "object" && program !== null && "draw" in program) {
    return program;
  }
  if (program === "boxes") {
    return new BoxesFrequencyRulerProgram();
  }
  return new TicksFrequencyRulerProgram();
}

function resolveFrequencyRulerConfig(
  input: Partial<FrequencyRulerOptions> = {},
  sampleRate = 48000,
): ResolvedFrequencyRulerConfig {
  const nyquist = Math.max(100, Math.floor(sampleRate / 2));
  const scale: FrequencyScale = input.frequencyScale ?? "linear";
  const defaultMin = scale === "log" ? 20 : 0;
  const minFrequency = Math.max(
    scale === "log" ? 1 : 0,
    input.minFrequency ?? defaultMin,
  );
  const maxFrequency = Math.max(
    minFrequency + 10,
    input.maxFrequency ?? nyquist,
  );

  return {
    autoRender: input.autoRender ?? true,
    minFrequency,
    maxFrequency,
    frequencyScale: scale,
    color: input.color ?? "#94a3b8",
    backgroundColor: input.backgroundColor ?? "transparent",
    tickColor: input.tickColor ?? input.color ?? "#94a3b8",
    labelColor: input.labelColor ?? input.color ?? "#94a3b8",
    font:
      input.font ??
      '10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    tickPosition: input.tickPosition ?? "right",
    frequencyFormat: input.frequencyFormat ?? "auto",
    minMajorPixelSpacing: input.minMajorPixelSpacing ?? 45,
    program: input.program ?? "ticks",
  };
}

export class FrequencyRulerViewer implements IFrequencyRulerViewer {
  private readonly events = new TypedEventEmitter<FrequencyRulerEvents>();
  private readonly canvas: HTMLCanvasElement;
  private readonly viewport: IViewportController;
  private config: ResolvedFrequencyRulerConfig;
  private programInstance: FrequencyRulerProgram;
  private viewportCleanup: Array<() => void> = [];
  private resizeCleanup: (() => void) | undefined;
  private renderQueued = false;
  private renderRunning = false;
  private renderAgain = false;
  private requestCounter = 0;
  private status: FrequencyRulerStatus = { state: "idle" };

  constructor(
    canvas: HTMLCanvasElement,
    viewport: IViewportController,
    options?: Partial<FrequencyRulerOptions>,
  ) {
    if (!canvas) {
      throw new Error("FrequencyRulerViewer requires a canvas");
    }
    if (!viewport) {
      throw new Error("FrequencyRulerViewer requires a viewport controller");
    }

    this.viewport = viewport;
    this.canvas = canvas;
    const vp = viewport.getViewport();
    this.config = resolveFrequencyRulerConfig(
      {
        minFrequency: vp.minFrequency,
        maxFrequency: vp.maxFrequency,
        frequencyScale: options?.frequencyScale ?? "linear",
        ...options,
      },
      vp.maxFrequency * 2,
    );
    this.programInstance = resolveFrequencyRulerProgram(this.config.program);

    if (
      options?.minFrequency !== undefined ||
      options?.maxFrequency !== undefined
    ) {
      viewport.setViewport(
        {
          minFrequency: this.config.minFrequency,
          maxFrequency: this.config.maxFrequency,
        },
        "frequency-ruler",
      );
    }

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
      let changed = false;
      if (
        e.viewport.minFrequency !== undefined &&
        Math.abs(this.config.minFrequency - e.viewport.minFrequency) >= 1e-6
      ) {
        this.config.minFrequency = e.viewport.minFrequency;
        changed = true;
      }
      if (
        e.viewport.maxFrequency !== undefined &&
        Math.abs(this.config.maxFrequency - e.viewport.maxFrequency) >= 1e-6
      ) {
        this.config.maxFrequency = e.viewport.maxFrequency;
        changed = true;
      }
      if (!changed) return;

      this.events.emit("viewportchange", { viewport: this.getViewport() });
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

  getStatus(): FrequencyRulerStatus {
    return this.status;
  }

  getViewport(): FrequencyRulerViewport {
    return {
      minFrequency: this.config.minFrequency,
      maxFrequency: this.config.maxFrequency,
      frequencyScale: this.config.frequencyScale,
    };
  }

  setViewport(vp: Partial<ViewportConfig>): void {
    this.viewport.setViewport(vp);
  }

  destroy(): void {
    this.status = { state: "destroyed" };
    this.events.clear();
    for (const cleanup of this.viewportCleanup) cleanup();
    this.viewportCleanup = [];
    this.resizeCleanup?.();
    this.resizeCleanup = undefined;
  }

  getConfig(): ResolvedFrequencyRulerConfig {
    return { ...this.config };
  }

  updateConfig(input: Partial<FrequencyRulerOptions>): void {
    const sampleRate = (this.viewport.getViewport().maxFrequency || 24000) * 2;
    const baseConfig = { ...this.config, ...input };
    this.config = resolveFrequencyRulerConfig(baseConfig, sampleRate);
    this.programInstance = resolveFrequencyRulerProgram(this.config.program);

    this.events.emit("configchange", { config: this.getConfig() });
    this.requestRender();
  }

  setConfig(input: Partial<FrequencyRulerOptions>): void {
    this.updateConfig(input);
  }

  canvasToFrequency(y: number): number {
    const height = this.canvas.height || 1;
    const scale = this.config.frequencyScale;
    const minScaled = hzToScale(
      Math.max(scale === "log" ? 1 : 0, this.config.minFrequency),
      scale,
    );
    const maxScaled = hzToScale(this.config.maxFrequency, scale);
    const scaled = maxScaled - (y / height) * (maxScaled - minScaled);
    return scaleToHz(scaled, scale);
  }

  frequencyToCanvas(freq: number): number {
    const height = this.canvas.height || 1;
    const scale = this.config.frequencyScale;
    const minScaled = hzToScale(
      Math.max(scale === "log" ? 1 : 0, this.config.minFrequency),
      scale,
    );
    const maxScaled = hzToScale(this.config.maxFrequency, scale);
    const scaled = hzToScale(freq, scale);
    return (1 - (scaled - minScaled) / (maxScaled - minScaled)) * height;
  }

  async render(): Promise<void> {
    if (this.status.state === "destroyed") return;
    const requestId = `freq-ruler-${++this.requestCounter}`;
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

    this.programInstance.draw(
      ctx,
      {
        canvas: this.canvas,
        minFrequency: this.config.minFrequency,
        maxFrequency: this.config.maxFrequency,
        frequencyScale: this.config.frequencyScale,
        color: this.config.color,
        backgroundColor: this.config.backgroundColor,
        tickColor: this.config.tickColor,
        labelColor: this.config.labelColor,
        font: this.config.font,
        tickPosition: this.config.tickPosition,
        frequencyFormat: this.config.frequencyFormat,
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

  on<Name extends keyof FrequencyRulerEvents>(
    name: Name,
    handler: (event: FrequencyRulerEvents[Name]) => void,
  ): () => void {
    return this.events.on(name, handler);
  }
}
