import type {
  AudioSource,
  IViewportController,
  ViewportConfig,
} from "../../types";
import type {
  IWaveformViewer,
  ResolvedWaveformConfig,
  WaveformEvents,
  WaveformOptions,
  WaveformRenderer,
  WaveformStatus,
  WaveformViewport,
} from "./types";
import { attachAutoResize } from "../../auto-resize";
import { colorMapToRgb } from "../../colormap";
import { TypedEventEmitter } from "../../events";
import { createWaveformRenderer } from "./renderers/renderer-factory";

function resolveWaveformConfig(
  source: AudioSource,
  input: Partial<WaveformOptions> = {},
): ResolvedWaveformConfig {
  if (!source) throw new Error("WaveformViewer requires a source");

  let color = input.color ?? "#000000";
  if (input.colorMap) {
    color = colorMapToRgb(input.colorMap, 255);
  }

  return {
    autoRender: input.autoRender ?? true,
    channel: input.channel ?? 0,
    color,
    backgroundColor: input.backgroundColor ?? "transparent",
    amplitudeScale: input.amplitudeScale ?? 1,
    colorMap: input.colorMap,
    renderer: input.renderer ?? "canvas2d",
  };
}

export class WaveformViewer implements IWaveformViewer {
  private readonly events = new TypedEventEmitter<WaveformEvents>();
  private renderer: WaveformRenderer;
  private viewportCleanup: Array<() => void> = [];
  private resizeCleanup: (() => void) | undefined;
  private renderQueued = false;
  private renderRunning = false;
  private renderAgain = false;
  private requestCounter = 0;
  private status: WaveformStatus = { state: "idle" };
  private source: AudioSource;
  private viewport: IViewportController;
  private readonly canvas: HTMLCanvasElement;
  private config: ResolvedWaveformConfig;
  private lastViewportStartTime: number;
  private lastViewportEndTime: number;

  constructor(
    canvas: HTMLCanvasElement,
    viewport: IViewportController,
    source: AudioSource,
    options?: Partial<WaveformOptions>,
  ) {
    if (!canvas) {
      throw new Error("WaveformViewer requires a canvas");
    }
    if (!viewport) {
      throw new Error("WaveformViewer requires a viewport controller");
    }
    if (!source) {
      throw new Error("WaveformViewer requires an AudioSource");
    }

    const resolvedConfig = resolveWaveformConfig(source, options);

    this.source = source;
    this.viewport = viewport;
    this.canvas = canvas;
    this.config = resolvedConfig;
    const initialViewport = viewport.getViewport();
    this.lastViewportStartTime = initialViewport.startTime;
    this.lastViewportEndTime = initialViewport.endTime;
    this.renderer = createWaveformRenderer(resolvedConfig.renderer);
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

  getSource(): AudioSource {
    return this.source;
  }

  getViewportController(): IViewportController {
    return this.viewport;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getViewport(): WaveformViewport {
    const vp = this.viewport.getViewport();
    return {
      startTime: vp.startTime,
      endTime: vp.endTime,
    };
  }

  setViewport(vp: Partial<ViewportConfig>): void {
    this.viewport.setViewport(vp);
  }

  getConfig(): ResolvedWaveformConfig {
    return this.config;
  }

  setConfig(input: Partial<WaveformOptions>): void {
    const cleanInput = Object.fromEntries(
      Object.entries(input).filter(([_, v]) => v !== undefined),
    );
    const shouldDeriveColors =
      input.colorMap !== undefined && input.color === undefined;

    const baseConfig = { ...this.config };
    if (shouldDeriveColors) {
      delete (baseConfig as Partial<ResolvedWaveformConfig>).color;
    }

    this.config = resolveWaveformConfig(this.source, {
      ...baseConfig,
      ...cleanInput,
    });

    if (input.renderer !== undefined) {
      this.renderer.destroy?.();
      this.renderer = createWaveformRenderer(this.config.renderer);
    }

    this.events.emit("configchange", { config: this.config });
  }

  updateConfig(input: Partial<WaveformOptions>): void {
    this.setConfig(input);
    this.requestRender();
  }

  getStatus(): WaveformStatus {
    return this.status;
  }

  getRendererKind(): string {
    if (typeof this.config.renderer === "string") {
      return this.config.renderer;
    }
    if (this.config.renderer && "type" in this.config.renderer) {
      return this.config.renderer.type;
    }
    return "custom";
  }

  canvasToTime(x: number): number {
    const width = this.canvas.width;
    const vp = this.getViewport();
    const span = vp.endTime - vp.startTime;
    return vp.startTime + (x / (width || 1)) * span;
  }

  timeToCanvas(time: number): number {
    const width = this.canvas.width;
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

    const vp = this.getViewport();

    await this.renderer.render({
      canvas: this.canvas,
      source: this.source,
      channel: this.config.channel,
      startTime: vp.startTime,
      endTime: vp.endTime,
      color: this.config.color,
      backgroundColor: this.config.backgroundColor,
      amplitudeScale: this.config.amplitudeScale,
      colorMap: this.config.colorMap,
    });

    if (this.status.state === "destroyed") return;

    this.status = { state: "ready" };
    this.events.emit("rendercomplete", { requestId });
  }

  setSource(source: AudioSource): void {
    if (this.source === source) return;
    this.source = source;
    this.requestRender();
  }

  destroy(): void {
    this.status = { state: "destroyed" };
    this.events.clear();
    for (const cleanup of this.viewportCleanup) cleanup();
    this.viewportCleanup = [];
    this.resizeCleanup?.();
    this.resizeCleanup = undefined;
    this.renderer.destroy?.();
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
}
