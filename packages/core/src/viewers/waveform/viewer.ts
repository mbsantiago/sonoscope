import type { AudioSource, ISonoscope } from "../../types";
import type {
  BarPeakBlock,
  IWaveformViewer,
  PeakBlock,
  ResolvedWaveformConfig,
  WaveformConfig,
  WaveformEvents,
  WaveformRenderer,
  WaveformStatus,
  WaveformViewport,
} from "./types";
import { attachAutoResize } from "../../auto-resize";
import { colorMapToRgb } from "../../colormap";
import { TypedEventEmitter } from "../../events";
import { clampViewportTimes } from "../../viewport-math";
import { WaveformPeakPyramid } from "./peaks";
import { createWaveformRenderer } from "./renderers/renderer-factory";

function resolveWaveformConfig(
  source: AudioSource,
  input: Partial<WaveformConfig> = {},
): ResolvedWaveformConfig {
  if (!source) throw new Error("WaveformViewer requires a source");

  const duration = Math.max(0.001, source.duration);

  if (
    input.minViewportDuration !== undefined &&
    input.minViewportDuration <= 0
  ) {
    throw new Error("minViewportDuration must be greater than zero");
  }

  if (
    input.maxViewportDuration !== undefined &&
    input.minViewportDuration !== undefined &&
    input.maxViewportDuration < input.minViewportDuration
  ) {
    throw new Error(
      "maxViewportDuration must be greater than or equal to minViewportDuration",
    );
  }

  const minViewportDuration = Math.min(
    input.minViewportDuration ?? 0.05,
    duration,
  );
  const maxViewportDuration = Math.max(
    minViewportDuration,
    input.maxViewportDuration !== undefined
      ? input.maxViewportDuration
      : Math.min(30, duration),
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

  const defaultColor = input.colorMap
    ? colorMapToRgb(input.colorMap, 210)
    : "#38bdf8";

  return {
    autoRender: input.autoRender ?? true,
    channel: input.channel ?? 0,
    startTime: clamped.startTime,
    endTime: clamped.endTime,
    minViewportDuration,
    maxViewportDuration,
    color: input.color ?? defaultColor,
    backgroundColor: input.backgroundColor ?? "transparent",
    amplitudeScale: input.amplitudeScale ?? 1.0,
    colorMap: input.colorMap,
    renderer: input.renderer ?? "canvas2d",
  };
}

export class WaveformViewer implements IWaveformViewer {
  private readonly events = new TypedEventEmitter<WaveformEvents>();
  private pyramid: WaveformPeakPyramid;
  private renderer: WaveformRenderer;
  private scopeCleanup: Array<() => void> = [];
  private resizeCleanup: (() => void) | undefined;
  private renderQueued = false;
  private renderRunning = false;
  private renderAgain = false;
  private requestCounter = 0;
  private status: WaveformStatus = { state: "idle" };
  private scope: ISonoscope;
  private readonly canvas: HTMLCanvasElement;
  private config: ResolvedWaveformConfig;

  constructor(
    scope: ISonoscope,
    canvas: HTMLCanvasElement,
    options?: Partial<WaveformConfig>,
  ) {
    if (!scope) {
      throw new Error("WaveformViewer requires an ISonoscope instance");
    }
    if (!canvas) {
      throw new Error("WaveformViewer requires a canvas");
    }

    const scopeVp = scope.getViewport();
    const resolvedConfig = resolveWaveformConfig(scope.source, {
      ...options,
      startTime: scopeVp.startTime,
      endTime: scopeVp.endTime,
    });

    this.scope = scope;
    this.canvas = canvas;
    this.config = resolvedConfig;
    this.renderer = createWaveformRenderer(resolvedConfig.renderer);
    this.pyramid = new WaveformPeakPyramid(
      this.scope.source,
      resolvedConfig.channel,
    );
    this.bindScope();
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

  getScope(): ISonoscope {
    return this.scope;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getViewport(): WaveformViewport {
    const scopeVp = this.scope.getViewport();
    return {
      startTime: scopeVp.startTime,
      endTime: scopeVp.endTime,
    };
  }

  getConfig(): ResolvedWaveformConfig {
    return this.config;
  }

  setConfig(input: Partial<WaveformConfig>): void {
    const cleanInput = Object.fromEntries(
      Object.entries(input).filter(([_, v]) => v !== undefined),
    );
    const shouldDeriveColors =
      input.colorMap !== undefined && input.color === undefined;

    const baseConfig = { ...this.config };
    if (shouldDeriveColors) {
      delete (baseConfig as Partial<ResolvedWaveformConfig>).color;
    }

    const previousChannel = this.config.channel;

    this.config = resolveWaveformConfig(this.scope.source, {
      ...baseConfig,
      ...cleanInput,
    });

    if (this.config.channel !== previousChannel) {
      this.pyramid.clear();
      this.pyramid = new WaveformPeakPyramid(
        this.scope.source,
        this.config.channel,
      );
    }

    if (input.renderer !== undefined) {
      this.renderer.destroy?.();
      this.renderer = createWaveformRenderer(this.config.renderer);
    }

    this.events.emit("configchange", { config: this.config });
  }

  updateConfig(input: Partial<WaveformConfig>): void {
    this.setConfig(input);
    this.requestRender();
  }

  getStatus(): WaveformStatus {
    return this.status;
  }

  getRendererKind(): string {
    return this.renderer.kind;
  }

  canvasToTime(x: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || this.canvas.width;
    const ratio = Math.max(0, Math.min(1, x / (width || 1)));
    const vp = this.getViewport();
    return vp.startTime + ratio * (vp.endTime - vp.startTime);
  }

  timeToCanvas(time: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || this.canvas.width;
    const vp = this.getViewport();
    const span = vp.endTime - vp.startTime;
    return ((time - vp.startTime) / (span || 1)) * width;
  }

  on<Name extends keyof WaveformEvents>(
    name: Name,
    handler: (event: WaveformEvents[Name]) => void,
  ): () => void {
    return this.events.on(name, handler);
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
    if (this.renderRunning || this.status.state === "destroyed") return;
    this.renderRunning = true;
    while (this.renderAgain && this.status.state !== "destroyed") {
      this.renderAgain = false;
      try {
        await this.render();
      } catch (error) {
        this.status = {
          state: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        };
        this.events.emit("error", {
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }
    this.renderRunning = false;
  }

  async render(): Promise<void> {
    if (this.status.state === "destroyed") return;
    const requestId = `waveform-${++this.requestCounter}`;
    this.status = { state: "rendering" };
    this.events.emit("renderstart", { requestId });

    const rect = this.canvas.getBoundingClientRect();
    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const targetWidth = Math.max(
      1,
      Math.floor((rect.width || this.canvas.width) * dpr),
    );

    const vp = this.getViewport();
    const timeSpan = vp.endTime - vp.startTime;
    const barDuration = this.renderer.getBarDuration?.(
      timeSpan,
      targetWidth,
      dpr,
    );

    let peaks: PeakBlock | BarPeakBlock;
    if (typeof barDuration === "number" && barDuration > 0) {
      peaks = await this.pyramid.getBarPeaks(
        vp.startTime,
        vp.endTime,
        barDuration,
      );
    } else {
      peaks = await this.pyramid.getPeaks(
        vp.startTime,
        vp.endTime,
        targetWidth,
      );
    }

    if (this.status.state === "destroyed") return;

    this.renderer.render({
      canvas: this.canvas,
      peaks,
      color: this.config.color,
      backgroundColor: this.config.backgroundColor,
      startTime: vp.startTime,
      endTime: vp.endTime,
      amplitudeScale: this.config.amplitudeScale,
      colorMap: this.config.colorMap,
    });

    this.status = { state: "ready" };
    this.events.emit("rendercomplete", { requestId });
  }

  destroy(): void {
    this.status = { state: "destroyed" };
    this.events.clear();
    for (const cleanup of this.scopeCleanup) cleanup();
    this.scopeCleanup = [];
    this.resizeCleanup?.();
    this.resizeCleanup = undefined;
    this.pyramid.clear();
    this.renderer.destroy?.();
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
      this.pyramid.clear();
      this.pyramid = new WaveformPeakPyramid(
        this.scope.source,
        this.config.channel,
      );
      this.events.emit("configchange", { config: this.config });
      this.requestRender();
    });

    this.scopeCleanup.push(unlistenViewport, unlistenSource);
  }
}
