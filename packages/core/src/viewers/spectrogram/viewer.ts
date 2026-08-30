import type {
  AudioSource,
  FrequencyScale,
  IViewportController,
  ViewportConfig,
} from "../../types";
import type { SpectrogramComputeBackend } from "./backends/backend";
import type { SpectrogramRenderer } from "./renderers/canvas";
import type { WebGL2RenderProgram } from "./renderers/webgl2-program";
import type {
  CacheStats,
  ISpectrogramViewer,
  RendererMode,
  ResolvedSpectrogramConfig,
  SpectrogramEvents,
  SpectrogramMatrix,
  SpectrogramOptions,
  SpectrogramProfileStats,
  SpectrogramStatus,
  SpectrumPoint,
  SpectrumSlice,
  StftConfig,
  TileStateInfo,
  ValueMode,
} from "./types";
import { attachAutoResize } from "../../auto-resize";
import { TypedEventEmitter } from "../../events";
import {
  createSpectrogramBackend,
  isSpectrogramComputeBackend,
} from "./backends/backend-factory";
import { createTileKey, SpectrogramCache } from "./cache";
import { resolveConfig, stableHash } from "./config";
import {
  canvasToTimeFrequency as mapCanvasToTimeFrequency,
  timeFrequencyToCanvas as mapTimeFrequencyToCanvas,
} from "./frequency-scale";
import { createSpectrogramRenderer } from "./renderers/renderer-factory";
import { createSpectrogramProgram } from "./renderers/webgl2-program-factory";
import { applyTransforms } from "./transforms";
import { deriveDb, derivePower } from "./value-scale";

type TileJob = {
  priority: number;
  sequence: number;
  run: () => Promise<SpectrogramMatrix>;
  resolve: (matrix: SpectrogramMatrix) => void;
  reject: (error: unknown) => void;
};

export class SpectrogramViewer implements ISpectrogramViewer {
  private readonly events = new TypedEventEmitter<SpectrogramEvents>();
  private readonly cache: SpectrogramCache;
  private renderer: SpectrogramRenderer;
  private viewportCleanup: Array<() => void> = [];
  private sourceRangeCleanup: (() => void) | undefined;
  private resizeCleanup: (() => void) | undefined;
  private renderQueued = false;
  private renderRunning = false;
  private renderAgain = false;
  private readonly pendingTiles = new Map<string, Promise<SpectrogramMatrix>>();
  private readonly tileQueue: TileJob[] = [];
  private runningTileComputations = 0;
  private tileSequence = 0;
  private progressivePaint:
    | { generation: number; callback: () => void }
    | undefined;
  private requestCounter = 0;
  private renderGeneration = 0;
  private cacheGeneration = 0;
  private status: SpectrogramStatus = { state: "idle" };
  private source: AudioSource;
  private viewport: IViewportController;
  private readonly canvas: HTMLCanvasElement;
  private config: ResolvedSpectrogramConfig;
  private readonly backend: SpectrogramComputeBackend;
  private playheadTime: number | undefined;

  constructor(
    canvas: HTMLCanvasElement,
    viewport: IViewportController,
    source: AudioSource,
    options?: Partial<SpectrogramOptions>,
  ) {
    if (!canvas) {
      throw new Error("SpectrogramViewer requires a canvas");
    }
    if (!viewport) {
      throw new Error("SpectrogramViewer requires a viewport controller");
    }
    if (!source) {
      throw new Error("SpectrogramViewer requires an AudioSource");
    }

    const resolvedConfig = resolveConfig(source, options);

    const backend = isSpectrogramComputeBackend(options?.backend)
      ? options.backend
      : createSpectrogramBackend(resolvedConfig.backend);

    this.canvas = canvas;
    this.viewport = viewport;
    this.source = source;
    this.config = resolvedConfig;
    this.backend = backend;
    this.cache = new SpectrogramCache({
      maxCachedTiles: resolvedConfig.maxCachedTiles,
      maxCachedBytes: resolvedConfig.maxCachedBytes,
    });
    this.renderer = createSpectrogramRenderer(
      this.canvas,
      resolvedConfig.renderer,
    );
    this.bindViewport();
    this.attachSourceRangeSync();
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

  on<Name extends keyof SpectrogramEvents>(
    name: Name,
    handler: (event: SpectrogramEvents[Name]) => void,
  ): () => void {
    return this.events.on(name, handler);
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

  getConfig(): ResolvedSpectrogramConfig {
    return this.config;
  }

  getFrequencyScale(): FrequencyScale {
    return this.config.frequencyScale;
  }

  getRendererKind(): SpectrogramRenderer["kind"] {
    return this.renderer.kind;
  }

  getNyquist(): number {
    return this.source.sampleRate / 2;
  }

  setPlayheadTime(time: number | undefined): void {
    this.playheadTime = time;
    this.requestRender();
  }

  setConfig(input: Partial<SpectrogramOptions>): void {
    const previousTileConfigHash = this.tileConfigHash();
    const previousRenderer = this.config.renderer;
    const cleanInput = Object.fromEntries(
      Object.entries(input).filter(([_, v]) => v !== undefined),
    );
    this.config = resolveConfig(this.source, {
      ...this.config,
      ...cleanInput,
    });
    this.renderGeneration += 1;
    this.cache.setMaxCachedTiles(this.config.maxCachedTiles);
    this.cache.setMaxCachedBytes(this.config.maxCachedBytes);
    const tilesChanged = this.tileConfigHash() !== previousTileConfigHash;
    if (tilesChanged) {
      this.cacheGeneration += 1;
      this.cache.clear();
      this.pendingTiles.clear();
    }

    const rendererChanged =
      input.renderer !== undefined &&
      stableHash(this.config.renderer) !== stableHash(previousRenderer);
    const canSwapInPlace =
      rendererChanged &&
      this.renderer.kind === "webgl2" &&
      typeof this.renderer.setProgram === "function" &&
      isWebGLProgramMode(this.config.renderer);

    if (canSwapInPlace) {
      const nextProgram = this.resolveRendererProgram(this.config.renderer);
      if (nextProgram) {
        this.renderer.setProgram?.(nextProgram);
      } else {
        this.renderer.destroy?.();
        this.renderer = createSpectrogramRenderer(
          this.canvas,
          this.config.renderer,
        );
      }
    } else if (rendererChanged) {
      this.renderer.destroy?.();
      this.renderer = createSpectrogramRenderer(
        this.canvas,
        this.config.renderer,
      );
    } else if (tilesChanged) {
      this.renderer.invalidate();
    }
    this.attachSourceRangeSync();
    this.events.emit("configchange", { config: this.config });
  }

  updateConfig(input: Partial<SpectrogramOptions>): void {
    this.setConfig(input);
    this.requestRender();
  }

  getViewport(): ViewportConfig {
    const viewport = this.viewport.getViewport();
    return {
      startTime: viewport.startTime,
      endTime: viewport.endTime,
      minFrequency: viewport.minFrequency,
      maxFrequency: viewport.maxFrequency,
    };
  }

  setViewport(vp: Partial<ViewportConfig>): void {
    this.viewport.setViewport(vp);
  }

  getFrequencyBounds(): {
    minFrequency: number;
    maxFrequency: number;
  } {
    return {
      minFrequency: 0,
      maxFrequency: this.getNyquist(),
    };
  }

  getStatus(): SpectrogramStatus {
    return this.status;
  }

  getTileStates(): TileStateInfo[] {
    return this.tileRangesForTimeRange(0, this.source.duration).map((tile) => {
      const key = this.tileKey(tile.channel, tile.timeStart, tile.timeEnd);
      return {
        ...tile,
        state: this.cache.has(key)
          ? "computed"
          : this.pendingTiles.has(key)
            ? "computing"
            : "uncomputed",
      };
    });
  }

  getCacheStats(): CacheStats {
    return this.cache.stats();
  }

  getProfileStats(): SpectrogramProfileStats {
    return {
      renderCount: this.renderGeneration,
      lastDurationMs: 0,
      minDurationMs: 0,
      maxDurationMs: 0,
      avgDurationMs: 0,
      totalTilesLoaded: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheHitRatio: 0,
    };
  }

  clearCache(): void {
    const cleared = this.cache.stats().tiles;
    this.cacheGeneration += 1;
    this.cache.clear();
    this.pendingTiles.clear();
    this.events.emit("cacheclear", { clearedTiles: cleared });
  }

  canvasToTimeFrequency(
    x: number,
    y: number,
  ): { time: number; frequency: number } {
    return mapCanvasToTimeFrequency(
      x,
      y,
      this.canvas.width,
      this.canvas.height,
      this.getViewport(),
      this.config.frequencyScale,
    );
  }

  timeFrequencyToCanvas(
    time: number,
    frequency: number,
  ): { x: number; y: number } {
    return mapTimeFrequencyToCanvas(
      time,
      frequency,
      this.canvas.width,
      this.canvas.height,
      this.getViewport(),
      this.config.frequencyScale,
    );
  }

  async render(): Promise<void> {
    if (this.isDestroyed()) return;
    this.status = { state: "rendering" };
    this.requestCounter += 1;
    const requestId = `render_${this.requestCounter}`;
    const currentGeneration = this.renderGeneration;

    const visibleTiles = this.visibleTileRanges();
    const totalTiles = visibleTiles.length;
    this.events.emit("renderstart", { requestId, total: totalTiles });

    const matrices = new Map<string, SpectrogramMatrix>();
    let completed = 0;

    const loadTile = async (tile: {
      channel: number;
      timeStart: number;
      timeEnd: number;
    }) => {
      const matrix = await this.getTile(
        tile.channel,
        tile.timeStart,
        tile.timeEnd,
        currentGeneration * 100 + 10,
      );
      if (this.isDestroyed() || this.renderGeneration !== currentGeneration)
        return;
      matrices.set(`${tile.channel}:${tile.timeStart}:${tile.timeEnd}`, matrix);
      completed += 1;
      this.events.emit("renderprogress", {
        requestId,
        completed,
        total: totalTiles,
        progress: totalTiles === 0 ? 1 : completed / totalTiles,
        phase: "computing",
      });
    };

    this.paintPartial(
      Array.from(matrices.values()),
      this.missingPlaceholders(visibleTiles, matrices),
    );

    const startedTime = performance.now();
    const batchSize = 4;
    for (let index = 0; index < visibleTiles.length; index += batchSize) {
      if (this.renderGeneration !== currentGeneration) return;
      await Promise.all(
        visibleTiles
          .slice(index, index + batchSize)
          .map((tile) => loadTile(tile)),
      );
      if (this.renderGeneration !== currentGeneration) return;
      this.scheduleProgressivePaint(currentGeneration, () => {
        this.paintPartial(
          Array.from(matrices.values()),
          this.missingPlaceholders(visibleTiles, matrices),
        );
      });
    }

    if (this.isDestroyed() || this.renderGeneration !== currentGeneration)
      return;

    this.flushProgressivePaint(currentGeneration);
    this.paintPartial(Array.from(matrices.values()), []);
    const durationMs = performance.now() - startedTime;
    this.events.emit("rendercomplete", {
      requestId,
      durationMs,
      renderedTiles: matrices.size,
      missingTiles: Math.max(0, totalTiles - matrices.size),
    });
    this.status = { state: "ready" };
    this.prefetchAroundViewport();
  }

  requestRender(): void {
    if (this.isDestroyed()) return;
    this.renderAgain = true;
    if (this.renderQueued || this.renderRunning) return;
    this.renderQueued = true;
    void Promise.resolve().then(() => this.renderRequested());
  }

  private resolveRendererProgram(
    mode: RendererMode,
  ): WebGL2RenderProgram | undefined {
    const gl = this.canvas.getContext("webgl2");
    return gl ? createSpectrogramProgram(gl, mode) : undefined;
  }

  private paintPartial(
    matrices: SpectrogramMatrix[],
    placeholders: Array<{ timeStart: number; timeEnd: number }>,
  ): void {
    if (this.isDestroyed()) return;
    this.renderer.render({
      canvas: this.canvas,
      viewport: this.getViewport(),
      frequencyScale: this.config.frequencyScale,
      valueScale: {
        mode: this.config.valueMode,
        min: this.config.minDb,
        max: this.config.maxDb,
        gamma: this.config.valueGamma,
        clamp: this.config.clampValues,
      },
      colorMap: this.config.colorMap,
      tiles: matrices,
      placeholders,
      ...(this.playheadTime !== undefined
        ? { playheadTime: this.playheadTime }
        : {}),
    });
  }

  private missingPlaceholders(
    tiles: Array<{ channel: number; timeStart: number; timeEnd: number }>,
    matrices: Map<string, SpectrogramMatrix>,
  ): Array<{ timeStart: number; timeEnd: number }> {
    return tiles
      .filter(
        (tile) =>
          !matrices.has(`${tile.channel}:${tile.timeStart}:${tile.timeEnd}`),
      )
      .map((tile) => ({ timeStart: tile.timeStart, timeEnd: tile.timeEnd }));
  }

  async queryPoint(input: {
    time: number;
    frequency: number;
    channel?: number;
    mode?: ValueMode;
  }): Promise<SpectrumPoint> {
    const mode = input.mode ?? this.config.valueMode;
    const spectrum = await this.querySpectrum({
      time: input.time,
      channel: input.channel ?? this.config.channel,
      mode,
    });
    let binIndex = 0;
    for (let i = 1; i < spectrum.frequencies.length; i++) {
      if (
        Math.abs(spectrum.frequencies[i]! - input.frequency) <
        Math.abs(spectrum.frequencies[binIndex]! - input.frequency)
      )
        binIndex = i;
    }
    return {
      time: spectrum.time,
      frequency: spectrum.frequencies[binIndex]!,
      frameIndex: spectrum.frameIndex,
      binIndex,
      channel: spectrum.channel,
      mode,
      value: spectrum.values[binIndex]!,
    };
  }

  async queryCanvasPoint(input: {
    x: number;
    y: number;
    channel?: number;
    mode?: ValueMode;
  }): Promise<SpectrumPoint> {
    const point = this.canvasToTimeFrequency(input.x, input.y);
    return this.queryPoint({
      ...point,
      ...(input.channel === undefined ? {} : { channel: input.channel }),
      ...(input.mode === undefined ? {} : { mode: input.mode }),
    });
  }

  async querySpectrum(input: {
    time: number;
    channel?: number;
    mode?: ValueMode;
  }): Promise<SpectrumSlice> {
    const channel = input.channel ?? this.config.channel;
    const mode = input.mode ?? this.config.valueMode;
    const range = this.tileRangeForTime(input.time);
    const matrix = await this.getTile(channel, range.timeStart, range.timeEnd);
    let frameIndex = 0;
    for (let i = 1; i < matrix.times.length; i++) {
      if (
        Math.abs(matrix.times[i]! - input.time) <
        Math.abs(matrix.times[frameIndex]! - input.time)
      )
        frameIndex = i;
    }
    const start = frameIndex * matrix.binCount;
    const end = start + matrix.binCount;

    let values: Float32Array;
    if (mode === "db") {
      if (matrix.db) {
        values = matrix.db.slice(start, end);
      } else {
        values = deriveDb(matrix.magnitude.subarray(start, end));
      }
    } else if (mode === "power") {
      if (matrix.power) {
        values = matrix.power.slice(start, end);
      } else {
        values = derivePower(matrix.magnitude.subarray(start, end));
      }
    } else {
      values = matrix.magnitude.slice(start, end);
    }

    return {
      time: matrix.times[frameIndex]!,
      frameIndex,
      channel,
      mode,
      frequencyScale: this.config.frequencyScale,
      frequencies: matrix.frequencies,
      values,
    };
  }

  async queryFrame(input: {
    frameIndex: number;
    channel?: number;
    mode?: ValueMode;
  }): Promise<SpectrumSlice> {
    const time =
      (input.frameIndex * this.config.hopSize + this.config.windowSize / 2) /
      this.source.sampleRate;
    return this.querySpectrum({
      time,
      ...(input.channel === undefined ? {} : { channel: input.channel }),
      ...(input.mode === undefined ? {} : { mode: input.mode }),
    });
  }

  setSource(source: AudioSource): void {
    if (this.source === source) return;
    this.source = source;
    this.cacheGeneration += 1;
    this.cache.clear();
    this.pendingTiles.clear();
    this.renderer.invalidate();
    this.attachSourceRangeSync();
    this.renderGeneration += 1;
    this.renderer.invalidate?.();
    const visibleTiles = this.visibleTileRanges();
    this.paintPartial([], this.missingPlaceholders(visibleTiles, new Map()));
    this.requestRender();
  }

  destroy(): void {
    this.status = { state: "destroyed" };
    this.events.clear();
    for (const cleanup of this.viewportCleanup) cleanup();
    this.viewportCleanup = [];
    this.sourceRangeCleanup?.();
    this.sourceRangeCleanup = undefined;
    this.resizeCleanup?.();
    this.resizeCleanup = undefined;
    this.cache.clear();
    this.pendingTiles.clear();
    this.backend.destroy?.();
    this.renderer.destroy?.();
  }

  private bindViewport(): void {
    for (const cleanup of this.viewportCleanup) cleanup();
    this.viewportCleanup = [];

    const unlistenViewport = this.viewport.on("viewportchange", (e) => {
      this.renderGeneration += 1;
      this.events.emit("viewportchange", { viewport: e.viewport });
      this.requestRender();
    });

    this.viewportCleanup.push(unlistenViewport);
  }

  private attachSourceRangeSync(): void {
    this.sourceRangeCleanup?.();
    this.sourceRangeCleanup = undefined;
    const source = this.source;
    if (!source.onRangeAvailable) return;
    this.sourceRangeCleanup = source.onRangeAvailable((range) => {
      if (!this.rangeIntersectsViewport(range.startTime, range.endTime)) return;
      this.requestRender();
    });
  }

  private rangeIntersectsViewport(startTime: number, endTime: number): boolean {
    const viewport = this.viewport.getViewport();
    return startTime < viewport.endTime && endTime > viewport.startTime;
  }

  private async renderRequested(): Promise<void> {
    this.renderQueued = false;
    if (this.renderRunning || this.isDestroyed()) return;
    this.renderRunning = true;
    while (this.renderAgain && !this.isDestroyed()) {
      this.renderAgain = false;
      try {
        await this.render();
      } catch (error) {
        this.events.emit("error", {
          error: error instanceof Error ? error : new Error(String(error)),
          recoverable: true,
          phase: "render",
        });
      }
    }
    this.renderRunning = false;
  }

  private isDestroyed(): boolean {
    return this.status.state === "destroyed";
  }

  private get framesPerTile(): number {
    const binCount = Math.max(1, Math.floor(this.config.fftSize / 2));
    return Math.max(1, Math.floor(this.config.tileMaxCells / binCount));
  }

  private get effectiveTileDuration(): number {
    const sampleRate = this.source.sampleRate || 44100;
    const hopSize = this.config.hopSize || 512;
    return (this.framesPerTile * hopSize) / sampleRate;
  }

  private prefetchAroundViewport(
    direction: "both" | "forward" = "both",
    seconds = this.effectiveTileDuration * this.config.prefetchTiles,
  ): void {
    if (this.config.prefetchTiles <= 0) return;
    const viewport = this.viewport.getViewport();
    const before =
      direction === "forward"
        ? []
        : this.tileRangesForTimeRange(
            Math.max(0, viewport.startTime - seconds),
            viewport.startTime,
          ).reverse();
    const after = this.tileRangesForTimeRange(
      viewport.endTime,
      Math.min(this.source.duration, viewport.endTime + seconds),
    );
    const candidates =
      direction === "forward"
        ? after
        : [
            ...after.slice(0, this.config.prefetchTiles),
            ...before.slice(0, this.config.prefetchTiles),
          ];

    const maxStarted =
      direction === "forward"
        ? this.config.prefetchTiles
        : this.config.prefetchTiles * 2;
    let started = 0;
    for (const tile of candidates) {
      if (started >= maxStarted) return;
      if (this.pendingTiles.size >= maxStarted) return;
      const key = this.tileKey(tile.channel, tile.timeStart, tile.timeEnd);
      if (this.cache.has(key) || this.pendingTiles.has(key)) continue;
      started += 1;
      void this.getTile(tile.channel, tile.timeStart, tile.timeEnd, -1).catch(
        (error) => {
          if (this.isDestroyed()) return;
          this.events.emit("error", {
            error: error instanceof Error ? error : new Error(String(error)),
            recoverable: true,
            phase: "compute",
          });
        },
      );
    }
  }

  private visibleTileRanges(): Array<{
    channel: number;
    timeStart: number;
    timeEnd: number;
  }> {
    const viewport = this.viewport.getViewport();
    return this.tileRangesForTimeRange(viewport.startTime, viewport.endTime);
  }

  private tileRangesForTimeRange(
    startTime: number,
    endTime: number,
  ): Array<{ channel: number; timeStart: number; timeEnd: number }> {
    const source = this.source;
    const sampleRate = source.sampleRate;
    const hopSize = this.config.hopSize;
    const windowSize = this.config.windowSize;
    const totalSamples = Math.floor(source.duration * sampleRate);
    if (totalSamples <= 0) return [];
    const totalFrames = Math.max(
      1,
      Math.floor((totalSamples - windowSize) / hopSize) + 1,
    );

    const framesPerTile = this.framesPerTile;
    const channel = this.config.channel;

    const startFrame = Math.max(
      0,
      Math.floor((startTime * sampleRate - windowSize / 2) / hopSize),
    );
    const endFrame = Math.min(
      totalFrames,
      Math.max(
        startFrame + 1,
        Math.ceil((endTime * sampleRate - windowSize / 2) / hopSize),
      ),
    );

    const firstTileIndex = Math.floor(startFrame / framesPerTile);
    const lastTileIndex = Math.floor(Math.max(0, endFrame - 1) / framesPerTile);

    const ranges: Array<{
      channel: number;
      timeStart: number;
      timeEnd: number;
    }> = [];

    for (let tileIdx = firstTileIndex; tileIdx <= lastTileIndex; tileIdx++) {
      const globalFrameStart = tileIdx * framesPerTile;
      const frameCount = Math.min(
        framesPerTile,
        totalFrames - globalFrameStart,
      );
      if (frameCount <= 0) continue;

      const sampleStart = globalFrameStart * hopSize;
      const sampleEnd =
        (globalFrameStart + frameCount - 1) * hopSize + windowSize;

      ranges.push({
        channel,
        timeStart: sampleStart / sampleRate,
        timeEnd: sampleEnd / sampleRate,
      });
    }

    return ranges;
  }

  private tileRangeForTime(time: number): {
    timeStart: number;
    timeEnd: number;
  } {
    const source = this.source;
    const sampleRate = source.sampleRate || 44100;
    const hopSize = this.config.hopSize || 512;
    const windowSize = this.config.windowSize || 2048;
    const totalSamples = Math.floor(source.duration * sampleRate);
    if (totalSamples <= 0) {
      return {
        timeStart: 0,
        timeEnd: 0,
      };
    }
    const totalFrames = Math.max(
      1,
      Math.floor((totalSamples - windowSize) / hopSize) + 1,
    );
    const framesPerTile = this.framesPerTile;
    const targetFrame = Math.max(
      0,
      Math.min(
        totalFrames - 1,
        Math.round((time * sampleRate - windowSize / 2) / hopSize),
      ),
    );
    const tileIdx = Math.floor(targetFrame / framesPerTile);
    const globalFrameStart = tileIdx * framesPerTile;
    const frameCount = Math.min(framesPerTile, totalFrames - globalFrameStart);
    const sampleStart = globalFrameStart * hopSize;
    const sampleEnd =
      (globalFrameStart + frameCount - 1) * hopSize + windowSize;
    return {
      timeStart: sampleStart / sampleRate,
      timeEnd: sampleEnd / sampleRate,
    };
  }

  private async getTile(
    channel: number,
    timeStart: number,
    timeEnd: number,
    priority = 0,
  ): Promise<SpectrogramMatrix> {
    const source = this.source;
    const stft: StftConfig = {
      windowSize: this.config.windowSize,
      fftSize: this.config.fftSize,
      hopSize: this.config.hopSize,
      window: this.config.window,
    };
    const transforms = this.config.transforms;
    const cacheGeneration = this.cacheGeneration;
    const key = this.tileKey(channel, timeStart, timeEnd);
    const cached = this.cache.get(key);
    if (cached) {
      this.events.emit("tileload", {
        tileId: key,
        timeStart,
        timeEnd,
        channel,
        cacheHit: true,
      });
      return cached;
    }
    const pending = this.pendingTiles.get(key);
    if (pending) return pending;

    const promise = this.enqueueTile(async () => {
      const tileStartTime = performance.now();
      try {
        const raw = await this.backend.computeTile({
          source,
          channel,
          timeStart,
          timeEnd,
          stft,
        });
        const transformed = await applyTransforms(raw, transforms, {
          requestedTimeStart: timeStart,
          requestedTimeEnd: timeEnd,
          sampleRate: source.sampleRate,
          stft,
        });
        if (this.isDestroyed() || cacheGeneration !== this.cacheGeneration)
          return transformed;
        const viewport = this.viewport.getViewport();
        this.cache.set(
          key,
          transformed,
          (timeStart + timeEnd) / 2,
          (viewport.startTime + viewport.endTime) / 2,
        );
        const durationMs = performance.now() - tileStartTime;
        this.events.emit("tileload", {
          tileId: key,
          timeStart,
          timeEnd,
          channel,
          cacheHit: false,
          durationMs,
        });
        return transformed;
      } catch (error) {
        if (this.isDestroyed()) {
          return {
            channel,
            timeStart,
            timeEnd,
            frameStart: 0,
            frameCount: 0,
            binCount: 0,
            sampleRate: source.sampleRate,
            times: new Float32Array(0),
            frequencies: new Float32Array(0),
            magnitude: new Float32Array(0),
          };
        }
        throw error;
      }
    }, priority);
    this.pendingTiles.set(key, promise);
    promise.finally(() => {
      if (this.pendingTiles.get(key) === promise) this.pendingTiles.delete(key);
    });
    return promise;
  }

  private enqueueTile(
    run: () => Promise<SpectrogramMatrix>,
    priority: number,
  ): Promise<SpectrogramMatrix> {
    const promise = new Promise<SpectrogramMatrix>((resolve, reject) => {
      this.tileQueue.push({
        priority,
        sequence: this.tileSequence++,
        run,
        resolve,
        reject,
      });
    });
    this.tileQueue.sort(
      (left, right) =>
        right.priority - left.priority || left.sequence - right.sequence,
    );
    this.pumpTileQueue();
    return promise;
  }

  private pumpTileQueue(): void {
    while (this.runningTileComputations < 4 && this.tileQueue.length > 0) {
      const job = this.tileQueue.shift();
      if (!job) return;
      this.runningTileComputations += 1;
      void job
        .run()
        .then(job.resolve, job.reject)
        .finally(() => {
          this.runningTileComputations -= 1;
          this.pumpTileQueue();
        });
    }
  }

  private scheduleProgressivePaint(
    generation: number,
    callback: () => void,
  ): void {
    if (this.progressivePaint) {
      if (generation >= this.progressivePaint.generation) {
        this.progressivePaint = { generation, callback };
      }
      return;
    }
    const paint = { generation, callback };
    this.progressivePaint = paint;
    const run = () => {
      if (this.progressivePaint !== paint) return;
      this.progressivePaint = undefined;
      if (!this.isDestroyed() && generation === this.renderGeneration)
        callback();
    };
    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(run);
    } else {
      queueMicrotask(run);
    }
  }

  private flushProgressivePaint(generation: number): void {
    const pending = this.progressivePaint;
    if (!pending || pending.generation !== generation) return;
    this.progressivePaint = undefined;
    pending.callback();
  }

  private tileKey(channel: number, timeStart: number, timeEnd: number): string {
    return createTileKey({
      sourceId: this.source.id,
      channel,
      timeStart,
      timeEnd,
      stftHash: stableHash({
        windowSize: this.config.windowSize,
        fftSize: this.config.fftSize,
        hopSize: this.config.hopSize,
        window: this.config.window,
      }),
      transformHash: stableHash(
        this.config.transforms.map((transform) => ({
          name: transform.name,
          version: transform.version,
          config: transform.config,
        })),
      ),
    });
  }

  private tileConfigHash(): string {
    return stableHash({
      channel: this.config.channel,
      windowSize: this.config.windowSize,
      fftSize: this.config.fftSize,
      hopSize: this.config.hopSize,
      window: this.config.window,
      tileMaxCells: this.config.tileMaxCells,
      transforms: this.config.transforms.map((transform) => ({
        name: transform.name,
        version: transform.version,
        config: transform.config,
      })),
    });
  }
}

function isWebGLProgramMode(mode: RendererMode): boolean {
  if (typeof mode === "string") {
    return mode !== "canvas2d" && mode !== "auto";
  }
  if (typeof mode === "object" && mode !== null) {
    return mode.type !== "canvas2d";
  }
  return false;
}
