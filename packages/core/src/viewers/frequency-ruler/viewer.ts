import type { FrequencyScale, ISonoscope, NavigationOptions } from "../../types";
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
import { TypedEventEmitter } from "../../events";
import { attachCanvasNavigation } from "../../navigation";
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
  private readonly scope: ISonoscope;
  private config: ResolvedFrequencyRulerConfig;
  private programInstance: FrequencyRulerProgram;
  private scopeCleanup: Array<() => void> = [];
  private navCleanups: Array<() => void> = [];
  private isSelfUpdating = false;
  private renderQueued = false;
  private renderRunning = false;
  private renderAgain = false;
  private requestCounter = 0;
  private status: FrequencyRulerStatus = { state: "idle" };

  constructor(
    scope: ISonoscope,
    canvas: HTMLCanvasElement,
    options?: Partial<FrequencyRulerOptions>,
  ) {
    this.scope = scope;
    this.canvas = canvas;
    const scopeVp = scope.getViewport();
    this.config = resolveFrequencyRulerConfig(
      {
        minFrequency: scopeVp.minFrequency,
        maxFrequency: scopeVp.maxFrequency,
        frequencyScale: scopeVp.frequencyScale,
        ...options,
      },
      scope.getSampleRate(),
    );
    this.programInstance = resolveFrequencyRulerProgram(this.config.program);

    if (
      options?.minFrequency !== undefined ||
      options?.maxFrequency !== undefined ||
      options?.frequencyScale !== undefined
    ) {
      scope.setViewport(
        {
          minFrequency: this.config.minFrequency,
          maxFrequency: this.config.maxFrequency,
          frequencyScale: this.config.frequencyScale,
        },
        "frequency-ruler",
      );
    }

    this.bindScope();

    if (this.config.autoRender) {
      this.requestRender();
    }
  }

  private bindScope(): void {
    for (const cleanup of this.scopeCleanup) cleanup();
    this.scopeCleanup = [];

    const unlistenViewport = this.scope.on("viewportchange", (e) => {
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
      if (
        e.viewport.frequencyScale !== undefined &&
        this.config.frequencyScale !== e.viewport.frequencyScale
      ) {
        this.config.frequencyScale = e.viewport.frequencyScale;
        changed = true;
      }
      if (!changed) return;

      this.events.emit("viewportchange", { viewport: this.getViewport() });
      if (!this.isSelfUpdating) {
        this.requestRender();
      }
    });

    const unlistenSource = this.scope.on("sourcechange", () => {
      const nyquist = Math.floor(this.scope.getSampleRate() / 2);
      if (this.config.maxFrequency > nyquist) {
        this.config.maxFrequency = nyquist;
      }
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

  updateViewport(viewport: Partial<FrequencyRulerViewport>): void {
    let changed = false;
    if (
      viewport.minFrequency !== undefined &&
      Math.abs(this.config.minFrequency - viewport.minFrequency) >= 1e-6
    ) {
      this.config.minFrequency = viewport.minFrequency;
      changed = true;
    }
    if (
      viewport.maxFrequency !== undefined &&
      Math.abs(this.config.maxFrequency - viewport.maxFrequency) >= 1e-6
    ) {
      this.config.maxFrequency = viewport.maxFrequency;
      changed = true;
    }
    if (
      viewport.frequencyScale !== undefined &&
      this.config.frequencyScale !== viewport.frequencyScale
    ) {
      this.config.frequencyScale = viewport.frequencyScale;
      changed = true;
    }

    if (changed) {
      this.isSelfUpdating = true;
      try {
        this.scope.setViewport(
          {
            minFrequency: this.config.minFrequency,
            maxFrequency: this.config.maxFrequency,
            frequencyScale: this.config.frequencyScale,
          },
          "frequency-ruler",
        );
      } finally {
        this.isSelfUpdating = false;
      }
      this.events.emit("viewportchange", { viewport: this.getViewport() });
      this.requestRender();
    }
  }

  setViewport(viewport: Partial<FrequencyRulerViewport>): void {
    this.updateViewport(viewport);
  }

  attachNavigation(options?: NavigationOptions): () => void {
    const cleanup = attachCanvasNavigation(this, this.canvas, options);
    this.navCleanups.push(cleanup);
    return () => {
      const idx = this.navCleanups.indexOf(cleanup);
      if (idx !== -1) {
        this.navCleanups.splice(idx, 1);
      }
      cleanup();
    };
  }

  getConfig(): ResolvedFrequencyRulerConfig {
    return { ...this.config };
  }

  updateConfig(input: Partial<FrequencyRulerOptions>): void {
    const sampleRate = this.scope.getSampleRate();
    const baseConfig = { ...this.config, ...input };
    this.config = resolveFrequencyRulerConfig(baseConfig, sampleRate);
    this.programInstance = resolveFrequencyRulerProgram(this.config.program);

    this.isSelfUpdating = true;
    try {
      this.scope.setViewport(
        {
          minFrequency: this.config.minFrequency,
          maxFrequency: this.config.maxFrequency,
          frequencyScale: this.config.frequencyScale,
        },
        "frequency-ruler",
      );
    } finally {
      this.isSelfUpdating = false;
    }

    this.events.emit("configchange", { config: this.getConfig() });
    this.events.emit("viewportchange", { viewport: this.getViewport() });
    this.requestRender();
  }

  setConfig(input: Partial<FrequencyRulerOptions>): void {
    this.updateConfig(input);
  }

  canvasToFrequency(y: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const height = rect.height || this.canvas.height || 1;
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
    const rect = this.canvas.getBoundingClientRect();
    const height = rect.height || this.canvas.height || 1;
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

    const rect = this.canvas.getBoundingClientRect();
    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const width = Math.max(
      1,
      Math.floor((rect.width || this.canvas.width) * dpr),
    );
    const height = Math.max(
      1,
      Math.floor((rect.height || this.canvas.height) * dpr),
    );

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

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

  on<Name extends keyof FrequencyRulerEvents>(
    name: Name,
    handler: (event: FrequencyRulerEvents[Name]) => void,
  ): () => void {
    return this.events.on(name, handler);
  }

  destroy(): void {
    this.status = { state: "destroyed" };
    this.events.clear();
    for (const cleanup of this.scopeCleanup) cleanup();
    this.scopeCleanup = [];
    for (const cleanup of this.navCleanups) cleanup();
    this.navCleanups = [];
  }
}
