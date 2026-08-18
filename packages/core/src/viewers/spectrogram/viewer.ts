import type { ISonoscope, ViewportConfig } from "../../types";
import type { SpectrogramComputeBackend } from "./backends/backend";
import type { RenderInput, SpectrogramRenderer } from "./renderers/canvas";
import type {
  CacheStats,
  ISpectrogramViewer,
  RendererMode,
  ResolvedSpectrogramConfig,
  SpectrogramEvents,
  SpectrogramMatrix,
  SpectrogramOptions,
  SpectrogramStatus,
  SpectrumPoint,
  SpectrumSlice,
  StftConfig,
  TileStateInfo,
  ValueMode,
} from "./types";
import { TypedEventEmitter } from "../../events";
import { zoomViewportFrequency, zoomViewportTime } from "../../navigation";
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
import { applyTransforms } from "./transforms";
import { deriveDb, derivePower } from "./value-scale";

export class SpectrogramViewer implements ISpectrogramViewer {
  private readonly events = new TypedEventEmitter<SpectrogramEvents>();
  private readonly cache: SpectrogramCache;
  private renderer: SpectrogramRenderer;
  private scopeCleanup: Array<() => void> = [];
  private sourceRangeCleanup: (() => void) | undefined;
  private renderQueued = false;
  private renderRunning = false;
  private renderAgain = false;
  private readonly pendingTiles = new Map<string, Promise<SpectrogramMatrix>>();
  private requestCounter = 0;
  private renderGeneration = 0;
  private status: SpectrogramStatus = { state: "idle" };
  private isSelfUpdating = false;
  private scope: ISonoscope;
  private readonly canvas: HTMLCanvasElement;
  private config: ResolvedSpectrogramConfig;
  private readonly backend: SpectrogramComputeBackend;

  constructor(
    scope: ISonoscope,
    canvas: HTMLCanvasElement,
    options?: Partial<SpectrogramOptions>,
  ) {
    if (!scope) {
      throw new Error("SpectrogramViewer requires an ISonoscope instance");
    }
    if (!canvas) {
      throw new Error("SpectrogramViewer requires a canvas");
    }

    const scopeVp = scope.getViewport();
    const resolvedConfig = resolveConfig(scope.source, {
      minFrequency: scopeVp.minFrequency,
      maxFrequency: scopeVp.maxFrequency,
      frequencyScale: scopeVp.frequencyScale,
      ...options,
      startTime: scopeVp.startTime,
      endTime: scopeVp.endTime,
    });

    // If options specified frequency overrides, sync to source
    if (
      options?.minFrequency !== undefined ||
      options?.maxFrequency !== undefined ||
      options?.frequencyScale !== undefined
    ) {
      scope.setViewport(
        {
          minFrequency: resolvedConfig.minFrequency,
          maxFrequency: resolvedConfig.maxFrequency,
          frequencyScale: resolvedConfig.frequencyScale,
        },
        "spectrogram",
      );
    }

    const backend = isSpectrogramComputeBackend(options?.backend)
      ? options.backend
      : createSpectrogramBackend(resolvedConfig.backend);

    this.scope = scope;
    this.canvas = canvas;
    this.config = resolvedConfig;
    this.backend = backend;
    this.cache = new SpectrogramCache({
      maxCachedTiles: resolvedConfig.maxCachedTiles,
    });
    this.renderer = createSpectrogramRenderer(
      this.canvas,
      resolvedConfig.renderer,
    );
    this.bindScope();
    this.attachSourceRangeSync();
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

  getScope(): ISonoscope {
    return this.scope;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getConfig(): ResolvedSpectrogramConfig {
    return this.config;
  }

  getRendererKind(): SpectrogramRenderer["kind"] {
    return this.renderer.kind;
  }

  getNyquist(): number {
    return this.scope.getSampleRate() / 2;
  }

  setConfig(input: Partial<SpectrogramOptions>): void {
    const previousTileConfigHash = this.tileConfigHash();
    const previousRenderer = this.config.renderer;
    const cleanInput = Object.fromEntries(
      Object.entries(input).filter(([_, v]) => v !== undefined),
    );
    this.config = resolveConfig(this.scope.source, {
      ...this.config,
      ...cleanInput,
    });
    this.renderGeneration += 1;
    if (this.tileConfigHash() !== previousTileConfigHash) {
      this.cache.clear();
      this.pendingTiles.clear();
    }
    if (
      input.renderer !== undefined &&
      stableHash(this.config.renderer) !== stableHash(previousRenderer)
    ) {
      this.renderer.destroy?.();
      this.renderer = createSpectrogramRenderer(
        this.canvas,
        this.config.renderer,
      );
    } else {
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
    const scopeVp = this.scope.getViewport();
    return {
      startTime: scopeVp.startTime,
      endTime: scopeVp.endTime,
      minFrequency: this.config.minFrequency,
      maxFrequency: this.config.maxFrequency,
      frequencyScale: this.config.frequencyScale,
    };
  }

  setViewport(viewport: Partial<ViewportConfig>): void {
    const prev = this.getViewport();
    let timeChanged = false;
    let freqChanged = false;

    const nextMinFreq = viewport.minFrequency ?? this.config.minFrequency;
    const nextMaxFreq = viewport.maxFrequency ?? this.config.maxFrequency;
    const nextScale = viewport.frequencyScale ?? this.config.frequencyScale;

    if (
      Math.abs(prev.minFrequency - nextMinFreq) >= 1e-6 ||
      Math.abs(prev.maxFrequency - nextMaxFreq) >= 1e-6 ||
      prev.frequencyScale !== nextScale
    ) {
      freqChanged = true;
      this.config.minFrequency = nextMinFreq;
      this.config.maxFrequency = nextMaxFreq;
      this.config.frequencyScale = nextScale;
    }

    const nextStart = viewport.startTime ?? prev.startTime;
    const nextEnd = viewport.endTime ?? prev.endTime;
    if (
      Math.abs(prev.startTime - nextStart) >= 1e-6 ||
      Math.abs(prev.endTime - nextEnd) >= 1e-6
    ) {
      timeChanged = true;
      this.config.startTime = nextStart;
      this.config.endTime = nextEnd;
    }

    if (timeChanged || freqChanged) {
      this.isSelfUpdating = true;
      try {
        this.scope.setViewport(
          {
            startTime: this.config.startTime,
            endTime: this.config.endTime,
            minFrequency: this.config.minFrequency,
            maxFrequency: this.config.maxFrequency,
            frequencyScale: this.config.frequencyScale,
          },
          "spectrogram",
        );
      } finally {
        this.isSelfUpdating = false;
      }
      this.renderGeneration += 1;
      this.events.emit("viewportchange", { viewport: this.getViewport() });
    }
  }

  updateViewport(viewport: Partial<ViewportConfig>): void {
    this.setViewport(viewport);
    this.requestRender();
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

  zoomFreq(
    factor: number,
    centerFrequency = (this.config.minFrequency + this.config.maxFrequency) / 2,
  ): void {
    const currentViewport = this.getViewport();
    const next = zoomViewportFrequency(
      currentViewport,
      this.getFrequencyBounds(),
      centerFrequency,
      factor,
    );
    if (
      Math.abs(next.minFrequency - currentViewport.minFrequency) < 1e-6 &&
      Math.abs(next.maxFrequency - currentViewport.maxFrequency) < 1e-6
    )
      return;
    this.updateViewport(next);
  }

  zoomBoth(
    factor: number | { time: number; frequency: number },
    center?: { time?: number; frequency?: number },
  ): void {
    const timeFactor = typeof factor === "number" ? factor : factor.time;
    const freqFactor = typeof factor === "number" ? factor : factor.frequency;
    const currentViewport = this.getViewport();
    const timeCenter =
      center?.time ?? (currentViewport.startTime + currentViewport.endTime) / 2;
    const freqCenter =
      center?.frequency ??
      (currentViewport.minFrequency + currentViewport.maxFrequency) / 2;

    const timeBounds = {
      startTime: 0,
      endTime: this.scope.getDuration(),
      minDurationSeconds: this.config.minViewportDuration,
      maxDurationSeconds: this.config.maxViewportDuration,
    };
    const nextTime = zoomViewportTime(
      currentViewport,
      timeBounds,
      timeCenter,
      timeFactor,
    );
    const nextFreq = zoomViewportFrequency(
      currentViewport,
      this.getFrequencyBounds(),
      freqCenter,
      freqFactor,
    );

    this.updateViewport({
      startTime: nextTime.startTime,
      endTime: nextTime.endTime,
      minFrequency: nextFreq.minFrequency,
      maxFrequency: nextFreq.maxFrequency,
    });
  }

  getStatus(): SpectrogramStatus {
    return this.status;
  }

  getTileStates(): TileStateInfo[] {
    return this.tileRangesForTimeRange(0, this.scope.source.duration).map(
      (tile) => {
        const key = this.tileKey(tile.channel, tile.timeStart, tile.timeEnd);
        return {
          ...tile,
          state: this.cache.has(key)
            ? "computed"
            : this.pendingTiles.has(key)
              ? "computing"
              : "uncomputed",
        };
      },
    );
  }

  getCacheStats(): CacheStats {
    return this.cache.stats();
  }

  clearCache(): void {
    const cleared = this.cache.stats().tiles;
    this.cache.clear();
    this.pendingTiles.clear();
    this.events.emit("cacheclear", { clearedTiles: cleared });
  }

  canvasToTimeFrequency(
    x: number,
    y: number,
  ): { time: number; frequency: number } {
    const rect = this.canvas.getBoundingClientRect();
    return mapCanvasToTimeFrequency(
      x,
      y,
      rect.width || this.canvas.width,
      rect.height || this.canvas.height,
      this.getViewport(),
    );
  }

  timeFrequencyToCanvas(
    time: number,
    frequency: number,
  ): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return mapTimeFrequencyToCanvas(
      time,
      frequency,
      rect.width || this.canvas.width,
      rect.height || this.canvas.height,
      this.getViewport(),
    );
  }

  async render(): Promise<void> {
    if (this.isDestroyed()) return;
    this.renderAgain = false;
    const wasRunning = this.renderRunning;
    this.renderRunning = true;
    try {
      const requestId = `render-${++this.requestCounter}`;
      const generation = ++this.renderGeneration;
      const startTime = performance.now();
      const tiles = this.visibleTileRanges();
      const matrices = new Map<string, SpectrogramMatrix>();
      let completed = 0;
      let partialPaintQueued = false;

      this.status = { state: "rendering" };
      this.events.emit("renderstart", { requestId, total: tiles.length });

      const jobs = tiles.map(async (tile) => {
        const matrix = await this.getTile(
          tile.channel,
          tile.timeStart,
          tile.timeEnd,
        );
        if (this.isDestroyed() || generation !== this.renderGeneration) return;
        completed += 1;
        matrices.set(
          `${tile.channel}:${tile.timeStart}:${tile.timeEnd}`,
          matrix,
        );
        this.events.emit("renderprogress", {
          requestId,
          completed,
          total: tiles.length,
          progress: tiles.length === 0 ? 1 : completed / tiles.length,
          phase: "computing",
        });
        if (!partialPaintQueued) {
          partialPaintQueued = true;
          await Promise.resolve();
          partialPaintQueued = false;
          if (
            !this.isDestroyed() &&
            generation === this.renderGeneration &&
            matrices.size < tiles.length
          ) {
            this.paintPartial(
              Array.from(matrices.values()),
              this.missingPlaceholders(tiles, matrices),
            );
          }
        }
      });
      await Promise.all(jobs);
      if (this.isDestroyed() || generation !== this.renderGeneration) return;
      this.prefetchAroundViewport();

      this.paintPartial(Array.from(matrices.values()), []);
      this.events.emit("renderprogress", {
        requestId,
        completed: tiles.length,
        total: tiles.length,
        progress: 1,
        phase: "rendering",
      });
      this.status = { state: "ready" };
      const durationMs = performance.now() - startTime;
      this.events.emit("rendercomplete", {
        requestId,
        durationMs,
        renderedTiles: matrices.size,
        missingTiles: tiles.length - matrices.size,
      });
    } finally {
      if (!wasRunning) {
        this.renderRunning = false;
      }
    }
  }

  requestRender(): void {
    if (this.isDestroyed()) return;
    this.renderAgain = true;
    if (this.renderQueued || this.renderRunning) return;
    this.renderQueued = true;
    void Promise.resolve().then(() => this.renderRequested());
  }

  private paintPartial(
    matrices: SpectrogramMatrix[],
    placeholders: Array<{ timeStart: number; timeEnd: number }>,
  ): void {
    if (this.isDestroyed()) return;
    this.renderer.render({
      canvas: this.canvas,
      viewport: this.getViewport(),
      valueScale: {
        mode: this.config.valueMode,
        min: this.config.minValue,
        max: this.config.maxValue,
        gamma: this.config.valueGamma,
        clamp: this.config.clampValues,
      },
      colorMap: this.config.colorMap,
      tiles: matrices,
      placeholders,
      ...(this.config.showPlayhead
        ? { playheadTime: this.scope.getCurrentTime() }
        : {}),
      ...webglProgramRenderInput(this.config.renderer),
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
      (input.frameIndex * this.config.hopSize) / this.scope.source.sampleRate;
    return this.querySpectrum({
      time,
      ...(input.channel === undefined ? {} : { channel: input.channel }),
      ...(input.mode === undefined ? {} : { mode: input.mode }),
    });
  }

  destroy(): void {
    this.status = { state: "destroyed" };
    this.events.clear();
    for (const cleanup of this.scopeCleanup) cleanup();
    this.scopeCleanup = [];
    this.sourceRangeCleanup?.();
    this.sourceRangeCleanup = undefined;
    this.cache.clear();
    this.pendingTiles.clear();
    this.backend.destroy?.();
    this.renderer.destroy?.();
  }

  private bindScope(): void {
    for (const cleanup of this.scopeCleanup) cleanup();
    this.scopeCleanup = [];

    const unlistenViewport = this.scope.on("viewportchange", (e) => {
      let changed = false;
      const currentStart = this.config.startTime;
      const currentEnd = this.config.endTime;
      if (
        Math.abs(currentStart - e.viewport.startTime) >= 1e-6 ||
        Math.abs(currentEnd - e.viewport.endTime) >= 1e-6
      ) {
        this.config.startTime = e.viewport.startTime;
        this.config.endTime = e.viewport.endTime;
        changed = true;
      }
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

      this.renderGeneration += 1;
      this.events.emit("viewportchange", { viewport: this.getViewport() });
      if (!this.isSelfUpdating) {
        this.requestRender();
      }
    });

    const unlistenSource = this.scope.on("sourcechange", () => {
      this.renderGeneration += 1;
      this.updateViewport({
        minFrequency: this.config.minFrequency,
        maxFrequency: Math.min(
          this.config.maxFrequency,
          this.getFrequencyBounds().maxFrequency,
        ),
      });
      this.requestRender();
    });

    this.scopeCleanup.push(unlistenViewport, unlistenSource);
  }

  private attachSourceRangeSync(): void {
    this.sourceRangeCleanup?.();
    this.sourceRangeCleanup = undefined;
    const source = this.scope.source;
    if (!source.onRangeAvailable) return;
    this.sourceRangeCleanup = source.onRangeAvailable((range) => {
      if (!this.rangeIntersectsViewport(range.startTime, range.endTime)) return;
      this.requestRender();
    });
  }

  private rangeIntersectsViewport(startTime: number, endTime: number): boolean {
    return startTime < this.config.endTime && endTime > this.config.startTime;
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

  private get effectiveTileDuration(): number {
    const maxFrames = 2048;
    const maxDurationForSampleRate =
      (maxFrames * this.config.hopSize) /
      Math.max(1, this.scope.source.sampleRate);
    return Math.min(this.config.tileDuration, maxDurationForSampleRate);
  }

  private prefetchAroundViewport(
    direction: "both" | "forward" = "both",
    seconds = this.effectiveTileDuration * this.config.prefetchTiles,
  ): void {
    if (this.config.prefetchTiles <= 0) return;
    const before =
      direction === "forward"
        ? []
        : this.tileRangesForTimeRange(
            Math.max(0, this.config.startTime - seconds),
            this.config.startTime,
          ).reverse();
    const after = this.tileRangesForTimeRange(
      this.config.endTime,
      Math.min(this.scope.source.duration, this.config.endTime + seconds),
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
      void this.getTile(tile.channel, tile.timeStart, tile.timeEnd).catch(
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

  private get framesPerTile(): number {
    const sampleRate = this.scope.source.sampleRate || 44100;
    const hopSize = this.config.hopSize || 512;
    const nominalDuration = this.effectiveTileDuration;
    const nominalFrames = Math.max(
      1,
      Math.round((nominalDuration * sampleRate) / hopSize),
    );
    return Math.min(4096, nominalFrames);
  }

  private visibleTileRanges(): Array<{
    channel: number;
    timeStart: number;
    timeEnd: number;
  }> {
    return this.tileRangesForTimeRange(
      this.config.startTime,
      this.config.endTime,
    );
  }

  private tileRangesForTimeRange(
    startTime: number,
    endTime: number,
  ): Array<{ channel: number; timeStart: number; timeEnd: number }> {
    const source = this.scope.source;
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
      Math.floor((startTime * sampleRate) / hopSize),
    );
    const endFrame = Math.min(
      totalFrames,
      Math.max(startFrame + 1, Math.ceil((endTime * sampleRate) / hopSize)),
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
    const source = this.scope.source;
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
      Math.min(totalFrames - 1, Math.floor((time * sampleRate) / hopSize)),
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
  ): Promise<SpectrogramMatrix> {
    const source = this.scope.source;
    const stft: StftConfig = {
      windowSize: this.config.windowSize,
      fftSize: this.config.fftSize,
      hopSize: this.config.hopSize,
      window: this.config.window,
    };
    const transforms = this.config.transforms;
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

    const promise = (async () => {
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
        if (this.isDestroyed()) return transformed;
        this.cache.set(key, transformed);
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
    })();
    this.pendingTiles.set(key, promise);
    promise.finally(() => this.pendingTiles.delete(key));
    return promise;
  }

  private tileKey(channel: number, timeStart: number, timeEnd: number): string {
    return createTileKey({
      sourceId: this.scope.source.id,
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
      tileDuration: this.effectiveTileDuration,
      transforms: this.config.transforms.map((transform) => ({
        name: transform.name,
        version: transform.version,
        config: transform.config,
      })),
    });
  }
}

function webglProgramRenderInput(
  renderer: RendererMode,
): Pick<RenderInput, "webglProgram"> {
  if (
    typeof renderer === "object" &&
    renderer.type === "webgl" &&
    renderer.program
  )
    return { webglProgram: renderer.program };
  return {};
}
