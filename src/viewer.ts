import { MainThreadComputeBackend, type SpectrogramComputeBackend } from './backend';
import { createTileKey, SpectrogramCache } from './cache';
import { resolveConfig, stableHash } from './config';
import { TypedEventEmitter } from './events';
import { canvasToTimeFrequency as mapCanvasToTimeFrequency, timeFrequencyToCanvas as mapTimeFrequencyToCanvas } from './frequency-scale';
import { zoomViewportTime } from './navigation';
import { FrameMeter, PerformanceProfiler } from './performance';
import { CanvasSpectrogramRenderer, type RenderInput, type SpectrogramRenderer } from './renderers/canvas';
import { createSpectrogramRenderer } from './renderer-factory';
import { DecodedAudioSource, createAudioSourceFromUrl } from './source';
import { applyTransforms } from './transforms';
import type { AudioSource, CacheStats, RendererMode, ResolvedSpectrogramConfig, SpectrogramConfig, SpectrogramEvents, SpectrogramMatrix, SpectrogramStatus, TileStateInfo } from './types';
import { WorkerComputeBackend } from './worker-backend';

export class SpectrogramViewer {
  private readonly events = new TypedEventEmitter<SpectrogramEvents>();
  private readonly cache: SpectrogramCache;
  private renderer: SpectrogramRenderer;
  private playbackCleanup: Array<() => void> = [];
  private sourceRangeCleanup: (() => void) | undefined;
  private renderQueued = false;
  private renderRunning = false;
  private renderAgain = false;
  private animationFrame: number | undefined;
  private readonly pendingTiles = new Map<string, Promise<SpectrogramMatrix>>();
  private requestCounter = 0;
  private renderGeneration = 0;
  private status: SpectrogramStatus = { state: 'idle' };
  private readonly playbackFrameMeter = new FrameMeter();
  private lastPlaybackPrefetchTime = Number.NEGATIVE_INFINITY;
  private suppressCachedPlaybackRender = false;

  private constructor(
    private config: ResolvedSpectrogramConfig,
    private readonly backend: SpectrogramComputeBackend,
  ) {
    this.cache = new SpectrogramCache({ maxCachedTiles: config.cache.maxCachedTiles });
    this.renderer = createSpectrogramRenderer(config.canvas, config.renderer);
    this.attachPlaybackSync();
    this.attachSourceRangeSync();
  }

  static async create(input: SpectrogramConfig & { backend?: SpectrogramComputeBackend }): Promise<SpectrogramViewer> {
    if (!input.source && input.audio) {
      const url = input.audio.currentSrc || input.audio.src;
      if (!url) throw new Error('SpectrogramViewer requires audio.currentSrc or audio.src when source is omitted');
      const config = resolveConfig({ ...input, source: await DecodedAudioSource.fromUrl(url) });
      return new SpectrogramViewer(config, input.backend ?? new MainThreadComputeBackend());
    }
    const config = resolveConfig(input);
    return new SpectrogramViewer(config, input.backend ?? new MainThreadComputeBackend());
  }

  static async fromUrl(input: Omit<SpectrogramConfig, 'audio' | 'source'> & { audio: HTMLAudioElement; url: string; backend?: SpectrogramComputeBackend }): Promise<SpectrogramViewer> {
    input.audio.src = input.url;
    const source = await createAudioSourceFromUrl(input.url);
    const viewer = await SpectrogramViewer.create({
      ...input,
      source,
      backend: input.backend ?? new WorkerComputeBackend(),
      viewport: { startTime: 0, endTime: Math.min(10, source.duration), minFrequency: 0, maxFrequency: source.sampleRate / 2, ...input.viewport },
    });
    return viewer;
  }

  static renderLoading(canvas: HTMLCanvasElement, text?: string): void {
    new CanvasSpectrogramRenderer().renderLoading({ canvas, ...(text === undefined ? {} : { text }) });
  }

  on<Name extends keyof SpectrogramEvents>(name: Name, handler: (event: SpectrogramEvents[Name]) => void): () => void {
    return this.events.on(name, handler);
  }

  getConfig(): ResolvedSpectrogramConfig {
    return this.config;
  }

  getRendererKind(): SpectrogramRenderer['kind'] {
    return this.renderer.kind;
  }

  getSource(): AudioSource {
    if (!this.config.source) throw new Error('SpectrogramViewer has no AudioSource');
    return this.config.source;
  }

  getDuration(): number {
    return this.getSource().duration;
  }

  setConfig(input: Partial<SpectrogramConfig>): void {
    const previousTileConfigHash = this.tileConfigHash();
    const previousRenderer = this.config.renderer;
    const source = input.source ?? this.config.source;
    const viewport = { ...this.config.viewport, ...input.viewport };
    this.config = resolveConfig({ ...this.config, ...input, renderer: input.renderer ?? this.config.renderer, viewport, viewportConstraints: { ...this.config.viewportConstraints, ...input.viewportConstraints }, canvas: input.canvas ?? this.config.canvas, ...(source ? { source } : {}) });
    this.renderGeneration += 1;
    if (this.tileConfigHash() !== previousTileConfigHash) {
      this.cache.clear();
      this.pendingTiles.clear();
    }
    if (input.renderer !== undefined && stableHash(this.config.renderer) !== stableHash(previousRenderer)) {
      this.renderer.destroy?.();
      this.renderer = createSpectrogramRenderer(this.config.canvas, this.config.renderer);
    } else {
      this.renderer.invalidate();
    }
    this.attachSourceRangeSync();
    this.events.emit('configchange', { config: this.config });
  }

  updateConfig(input: Partial<SpectrogramConfig>): void {
    this.setConfig(input);
    this.requestRender();
  }

  setSource(source: AudioSource, options?: { viewport?: Partial<ResolvedSpectrogramConfig['viewport']> }): void {
    this.setConfig({
      source,
      viewport: {
        startTime: 0,
        endTime: Math.min(10, source.duration),
        minFrequency: 0,
        maxFrequency: source.sampleRate / 2,
        ...options?.viewport,
      },
    });
  }

  updateSource(source: AudioSource, options?: { viewport?: Partial<ResolvedSpectrogramConfig['viewport']> }): void {
    this.setSource(source, options);
    this.requestRender();
  }

  async setSourceUrl(url: string, options?: { viewport?: Partial<ResolvedSpectrogramConfig['viewport']> }): Promise<void> {
    if (this.config.audio) this.config.audio.src = url;
    this.setSource(await createAudioSourceFromUrl(url), options);
  }

  async updateSourceUrl(url: string, options?: { viewport?: Partial<ResolvedSpectrogramConfig['viewport']> }): Promise<void> {
    await this.setSourceUrl(url, options);
    this.requestRender();
  }

  getViewport(): ResolvedSpectrogramConfig['viewport'] {
    return this.config.viewport;
  }

  setViewport(viewport: Partial<ResolvedSpectrogramConfig['viewport']>): void {
    this.config = resolveConfig({
      ...this.config,
      viewport: { ...this.config.viewport, ...viewport },
      viewportConstraints: this.config.viewportConstraints,
      canvas: this.config.canvas,
      ...(this.config.source ? { source: this.config.source } : {}),
    });
    this.renderGeneration += 1;
    this.events.emit('viewportchange', { viewport: this.config.viewport });
  }

  updateViewport(viewport: Partial<ResolvedSpectrogramConfig['viewport']>): void {
    this.setViewport(viewport);
    this.requestRender();
  }

  getTimeBounds(): { startTime: number; endTime: number; minDurationSeconds: number; maxDurationSeconds: number } {
    return {
      startTime: 0,
      endTime: this.getDuration(),
      minDurationSeconds: this.config.viewportConstraints.minDurationSeconds,
      maxDurationSeconds: this.config.viewportConstraints.maxDurationSeconds,
    };
  }

  zoomTime(factor: number, centerTime = (this.config.viewport.startTime + this.config.viewport.endTime) / 2): void {
    const next = zoomViewportTime(this.config.viewport, this.getTimeBounds(), centerTime, factor);
    if (next === this.config.viewport) return;
    this.updateViewport(next);
  }

  getStatus(): SpectrogramStatus {
    return this.status;
  }

  getTileStates(): TileStateInfo[] {
    if (!this.config.source) return [];
    return this.tileRangesForTimeRange(0, this.config.source.duration).map((tile) => {
      const key = this.tileKey(tile.channel, tile.timeStart, tile.timeEnd);
      return {
        ...tile,
        state: this.cache.has(key) ? 'computed' : this.pendingTiles.has(key) ? 'computing' : 'uncomputed',
      };
    });
  }

  getCacheStats(): CacheStats {
    return this.cache.stats();
  }

  canvasToTimeFrequency(x: number, y: number): { time: number; frequency: number } {
    const rect = this.config.canvas.getBoundingClientRect();
    return mapCanvasToTimeFrequency(x, y, rect.width || this.config.canvas.width, rect.height || this.config.canvas.height, this.config.viewport);
  }

  timeFrequencyToCanvas(time: number, frequency: number): { x: number; y: number } {
    const rect = this.config.canvas.getBoundingClientRect();
    return mapTimeFrequencyToCanvas(time, frequency, rect.width || this.config.canvas.width, rect.height || this.config.canvas.height, this.config.viewport);
  }

  async render(): Promise<void> {
    if (!this.config.source) throw new Error('Cannot render without an AudioSource');
    const requestId = `render-${++this.requestCounter}`;
    const generation = ++this.renderGeneration;
    const profile = new PerformanceProfiler();
    const tiles = this.visibleTileRanges();
    const matrices = new Map<string, SpectrogramMatrix>();
    let completed = 0;
    let partialPaintQueued = false;
    let paintCount = 0;

    await profile.measureAsync('render.total', { tiles: tiles.length }, async () => {
      this.status = { state: 'rendering' };
      this.events.emit('renderstart', { requestId, total: tiles.length });
      profile.record('render.visibleTiles', performance.now(), 0, { total: tiles.length });
      this.renderer.renderLoading({ canvas: this.config.canvas });

      const jobs = tiles.map(async (tile) => {
        const matrix = await this.getTile(tile.channel, tile.timeStart, tile.timeEnd, profile);
        completed += 1;
        matrices.set(`${tile.channel}:${tile.timeStart}:${tile.timeEnd}`, matrix);
        if (generation !== this.renderGeneration) return;
        this.events.emit('renderprogress', {
          requestId,
          completed,
          total: tiles.length,
          progress: tiles.length === 0 ? 1 : completed / tiles.length,
          phase: 'computing',
        });
        if (!partialPaintQueued) {
          partialPaintQueued = true;
          await Promise.resolve();
          partialPaintQueued = false;
          if (generation === this.renderGeneration && matrices.size < tiles.length) {
            profile.record('render.paint.partial', performance.now(), 0, { tiles: matrices.size, total: tiles.length });
            paintCount += 1;
            this.paintPartial(Array.from(matrices.values()), this.missingPlaceholders(tiles, matrices), profile);
          }
        }
      });
      await Promise.all(jobs);
      if (generation !== this.renderGeneration) return;
      this.prefetchAroundViewport();

      profile.record('render.paint.final', performance.now(), 0, { tiles: matrices.size, total: tiles.length });
      paintCount += 1;
      this.paintPartial(Array.from(matrices.values()), [], profile);
      void this.renderPlaybackPlayhead();
      profile.record('render.paint.count', performance.now(), 0, { count: paintCount });
      profile.record('cache.memory', performance.now(), 0, this.cache.stats());
      this.events.emit('renderprogress', { requestId, completed: tiles.length, total: tiles.length, progress: 1, phase: 'rendering' });
      this.status = { state: 'ready' };
      this.events.emit('rendercomplete', { requestId, renderedTiles: matrices.size, missingTiles: tiles.length - matrices.size });
    });

    if (generation === this.renderGeneration) {
      this.events.emit('renderprofile', { requestId, generation, measures: profile.measures() });
    }
  }

  requestRender(): void {
    if (this.status.state === 'destroyed') return;
    this.renderAgain = true;
    if (this.renderQueued || this.renderRunning) return;
    this.renderQueued = true;
    void Promise.resolve().then(() => this.renderRequested());
  }

  private paintPartial(matrices: SpectrogramMatrix[], placeholders: Array<{ timeStart: number; timeEnd: number }>, profile: PerformanceProfiler): void {
    this.renderer.render({
      canvas: this.config.canvas,
      viewport: this.config.viewport,
      valueScale: this.config.valueScale,
      colorMap: this.config.colorMap,
      tiles: matrices,
      placeholders,
      profile,
      ...(this.config.playback.showPlayhead && this.config.audio ? { playheadTime: this.config.audio.currentTime } : {}),
      ...webglProgramRenderInput(this.config.renderer),
    });
  }

  private missingPlaceholders(tiles: Array<{ channel: number; timeStart: number; timeEnd: number }>, matrices: Map<string, SpectrogramMatrix>): Array<{ timeStart: number; timeEnd: number }> {
    return tiles.filter((tile) => !matrices.has(`${tile.channel}:${tile.timeStart}:${tile.timeEnd}`)).map((tile) => ({ timeStart: tile.timeStart, timeEnd: tile.timeEnd }));
  }

  async queryPoint(input: { time: number; frequency: number; channel?: number }): Promise<{
    time: number;
    frequency: number;
    frameIndex: number;
    binIndex: number;
    channel: number;
    magnitude?: number;
    power?: number;
    db?: number;
  }> {
    const spectrum = await this.querySpectrum({ time: input.time, channel: input.channel ?? this.config.channel });
    let binIndex = 0;
    for (let i = 1; i < spectrum.values.frequency.length; i++) {
      if (Math.abs(spectrum.values.frequency[i]! - input.frequency) < Math.abs(spectrum.values.frequency[binIndex]! - input.frequency)) binIndex = i;
    }
    return {
      time: spectrum.time,
      frequency: spectrum.values.frequency[binIndex]!,
      frameIndex: spectrum.frameIndex,
      binIndex,
      channel: spectrum.channel,
      ...(spectrum.values.magnitude?.[binIndex] === undefined ? {} : { magnitude: spectrum.values.magnitude[binIndex] }),
      ...(spectrum.values.power?.[binIndex] === undefined ? {} : { power: spectrum.values.power[binIndex] }),
      ...(spectrum.values.db?.[binIndex] === undefined ? {} : { db: spectrum.values.db[binIndex] }),
    };
  }

  async queryCanvasPoint(input: { x: number; y: number; channel?: number }): ReturnType<SpectrogramViewer['queryPoint']> {
    const point = this.canvasToTimeFrequency(input.x, input.y);
    return this.queryPoint({ ...point, ...(input.channel === undefined ? {} : { channel: input.channel }) });
  }

  async querySpectrum(input: { time: number; channel?: number }): Promise<{
    time: number;
    frameIndex: number;
    channel: number;
    frequencyScale: ResolvedSpectrogramConfig['viewport']['frequencyScale'];
    values: { frequency: Float32Array; magnitude: Float32Array; power?: Float32Array; db?: Float32Array; normalized?: Uint8Array | Float32Array };
  }> {
    const channel = input.channel ?? this.config.channel;
    const range = this.tileRangeForTime(input.time);
    const matrix = await this.getTile(channel, range.timeStart, range.timeEnd);
    let frameIndex = 0;
    for (let i = 1; i < matrix.times.length; i++) {
      if (Math.abs(matrix.times[i]! - input.time) < Math.abs(matrix.times[frameIndex]! - input.time)) frameIndex = i;
    }
    const start = frameIndex * matrix.binCount;
    const end = start + matrix.binCount;
    return {
      time: matrix.times[frameIndex]!,
      frameIndex,
      channel,
      frequencyScale: this.config.viewport.frequencyScale,
      values: {
        frequency: matrix.frequencies,
        magnitude: matrix.magnitude.slice(start, end),
        ...(matrix.power ? { power: matrix.power.slice(start, end) } : {}),
        ...(matrix.db ? { db: matrix.db.slice(start, end) } : {}),
        ...(matrix.normalized ? { normalized: matrix.normalized.slice(start, end) } : {}),
      },
    };
  }

  async queryFrame(input: { frameIndex: number; channel?: number }): ReturnType<SpectrogramViewer['querySpectrum']> {
    if (!this.config.source) throw new Error('Cannot query without an AudioSource');
    const time = (input.frameIndex * this.config.stft.hopSize) / this.config.source.sampleRate;
    return this.querySpectrum({ time, ...(input.channel === undefined ? {} : { channel: input.channel }) });
  }

  destroy(): void {
    this.stopPlaybackLoop();
    for (const cleanup of this.playbackCleanup) cleanup();
    this.playbackCleanup = [];
    this.sourceRangeCleanup?.();
    this.sourceRangeCleanup = undefined;
    this.cache.clear();
    this.backend.destroy?.();
    this.renderer.destroy?.();
    this.events.clear();
    this.status = { state: 'destroyed' };
  }

  private attachSourceRangeSync(): void {
    this.sourceRangeCleanup?.();
    this.sourceRangeCleanup = undefined;
    const source = this.config.source;
    if (!source?.onRangeAvailable) return;
    this.sourceRangeCleanup = source.onRangeAvailable((range) => {
      if (!this.rangeIntersectsViewport(range.startTime, range.endTime)) return;
      this.queueSourceRangeRender();
    });
  }

  private rangeIntersectsViewport(startTime: number, endTime: number): boolean {
    return startTime < this.config.viewport.endTime && endTime > this.config.viewport.startTime;
  }

  private queueSourceRangeRender(): void {
    if (this.config.audio && !this.config.audio.paused && this.visibleTilesCached()) return;
    this.requestRender();
  }

  private visibleTilesCached(): boolean {
    if (!this.config.source) return false;
    return this.visibleTileRanges().every((tile) => this.cache.has(this.tileKey(tile.channel, tile.timeStart, tile.timeEnd)));
  }

  private async renderRequested(): Promise<void> {
    this.renderQueued = false;
    if (this.renderRunning || this.isDestroyed()) return;
    this.renderRunning = true;
    while (this.renderAgain && !this.isDestroyed()) {
      this.renderAgain = false;
      if (this.suppressCachedPlaybackRender && this.config.audio && !this.config.audio.paused && this.visibleTilesCached()) {
        this.suppressCachedPlaybackRender = false;
        continue;
      }
      this.suppressCachedPlaybackRender = false;
      try {
        await this.render();
      } catch (error) {
        this.events.emit('error', { error: error instanceof Error ? error : new Error(String(error)), recoverable: true, phase: 'render' });
      }
    }
    this.renderRunning = false;
  }

  private isDestroyed(): boolean {
    return this.status.state === 'destroyed';
  }

  private attachPlaybackSync(): void {
    const audio = this.config.audio;
    if (!audio) return;
    const onSeeked = () => {
      this.followPlayheadIfNeeded();
      if (this.config.playback.renderOnSeek) this.requestRender();
    };
    const onSeeking = () => {
      this.followPlayheadIfNeeded();
      if (this.config.playback.renderOnSeek) this.requestRender();
    };
    const onTimeUpdate = () => {
      this.followPlayheadIfNeeded();
      if (audio.paused) void this.renderPlaybackPlayhead();
    };
    const onPlay = () => this.startPlaybackLoop();
    const onPause = () => this.stopPlaybackLoop();
    audio.addEventListener('seeked', onSeeked);
    audio.addEventListener('seeking', onSeeking);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    this.playbackCleanup.push(() => audio.removeEventListener('seeked', onSeeked));
    this.playbackCleanup.push(() => audio.removeEventListener('seeking', onSeeking));
    this.playbackCleanup.push(() => audio.removeEventListener('timeupdate', onTimeUpdate));
    this.playbackCleanup.push(() => audio.removeEventListener('play', onPlay));
    this.playbackCleanup.push(() => audio.removeEventListener('pause', onPause));
  }

  private startPlaybackLoop(): void {
    this.playbackFrameMeter.reset();
    this.lastPlaybackPrefetchTime = Number.NEGATIVE_INFINITY;
    this.suppressCachedPlaybackRender = true;
    const tick = (time: number) => {
      const start = performance.now();
      const viewportChanged = this.followPlayheadIfNeeded();
      if (viewportChanged || !this.renderPlaybackPlayhead()) this.requestRender();
      this.prefetchPlaybackLookahead(time);
      const stats = this.playbackFrameMeter.tick(time, performance.now() - start);
      if (stats) this.events.emit('playbackprofile', stats);
      this.animationFrame = requestAnimationFrame(tick);
    };
    this.stopPlaybackLoop();
    this.animationFrame = requestAnimationFrame(tick);
  }

  private stopPlaybackLoop(): void {
    if (this.animationFrame !== undefined) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = undefined;
  }

  private followPlayheadIfNeeded(): boolean {
    const audio = this.config.audio;
    if (!audio || !this.config.playback.follow) return false;
    const duration = this.config.viewport.endTime - this.config.viewport.startTime;
    const margin = duration * this.config.playback.followMargin;
    if (audio.currentTime < this.config.viewport.startTime + margin || audio.currentTime > this.config.viewport.endTime - margin) {
      const startTime = Math.max(0, audio.currentTime - duration * this.config.playback.followMargin);
      this.setViewport({ startTime, endTime: startTime + duration });
      return true;
    }
    return false;
  }

  private prefetchPlaybackLookahead(frameTime: number): void {
    const audio = this.config.audio;
    const source = this.config.source;
    if (!audio || !source || !this.config.playback.follow) return;
    if (frameTime - this.lastPlaybackPrefetchTime < 250) return;
    this.lastPlaybackPrefetchTime = frameTime;

    const duration = this.config.viewport.endTime - this.config.viewport.startTime;
    const margin = duration * this.config.playback.followMargin;
    if (audio.currentTime < this.config.viewport.endTime - margin * 1.5) return;

    this.prefetchAroundViewport('forward', margin + this.config.cache.tileDurationSeconds);
  }

  private prefetchAroundViewport(direction: 'both' | 'forward' = 'both', seconds = this.config.cache.tileDurationSeconds * this.config.cache.prefetchTiles): void {
    if (!this.config.source || this.config.cache.prefetchTiles <= 0) return;
    const before = direction === 'forward' ? [] : this.tileRangesForTimeRange(Math.max(0, this.config.viewport.startTime - seconds), this.config.viewport.startTime).reverse();
    const after = this.tileRangesForTimeRange(this.config.viewport.endTime, Math.min(this.config.source.duration, this.config.viewport.endTime + seconds));
    const candidates = direction === 'forward' ? after : [...after.slice(0, this.config.cache.prefetchTiles), ...before.slice(0, this.config.cache.prefetchTiles)];

    const maxStarted = direction === 'forward' ? this.config.cache.prefetchTiles : this.config.cache.prefetchTiles * 2;
    let started = 0;
    for (const tile of candidates) {
      if (started >= maxStarted) return;
      if (this.pendingTiles.size >= maxStarted) return;
      const key = this.tileKey(tile.channel, tile.timeStart, tile.timeEnd);
      if (this.cache.has(key) || this.pendingTiles.has(key)) continue;
      started += 1;
      void this.getTile(tile.channel, tile.timeStart, tile.timeEnd).catch((error) => {
        this.events.emit('error', { error: error instanceof Error ? error : new Error(String(error)), recoverable: true, phase: 'compute' });
      });
    }
  }

  private renderPlaybackPlayhead(): boolean {
    const audio = this.config.audio;
    if (!audio || !this.config.playback.showPlayhead) return true;
    return this.renderer.renderPlayhead({ canvas: this.config.canvas, viewport: this.config.viewport, playheadTime: audio.currentTime });
  }

  private visibleTileRanges(): Array<{ channel: number; timeStart: number; timeEnd: number }> {
    if (!this.config.source) throw new Error('Cannot render without an AudioSource');
    return this.tileRangesForTimeRange(this.config.viewport.startTime, this.config.viewport.endTime);
  }

  private tileRangesForTimeRange(startTime: number, endTime: number): Array<{ channel: number; timeStart: number; timeEnd: number }> {
    if (!this.config.source) throw new Error('Cannot compute tile ranges without an AudioSource');
    const ranges: Array<{ channel: number; timeStart: number; timeEnd: number }> = [];
    const firstStart = Math.floor(startTime / this.config.cache.tileDurationSeconds) * this.config.cache.tileDurationSeconds;
    const channel = this.config.channel;
    for (let start = firstStart; start < endTime; start += this.config.cache.tileDurationSeconds) {
      ranges.push({ channel, timeStart: Math.max(0, start), timeEnd: Math.min(this.config.source.duration, start + this.config.cache.tileDurationSeconds) });
    }
    return ranges;
  }

  private tileRangeForTime(time: number): { timeStart: number; timeEnd: number } {
    if (!this.config.source) throw new Error('Cannot query without an AudioSource');
    const start = Math.floor(time / this.config.cache.tileDurationSeconds) * this.config.cache.tileDurationSeconds;
    return { timeStart: Math.max(0, start), timeEnd: Math.min(this.config.source.duration, start + this.config.cache.tileDurationSeconds) };
  }

  private async getTile(channel: number, timeStart: number, timeEnd: number, profile?: PerformanceProfiler): Promise<SpectrogramMatrix> {
    if (!this.config.source) throw new Error('Cannot compute tile without an AudioSource');
    const source = this.config.source;
    const stft = this.config.stft;
    const transforms = this.config.transforms;
    const key = this.tileKey(channel, timeStart, timeEnd);
    const cached = profile ? profile.measure('tile.cache.lookup', { channel, timeStart, timeEnd }, () => this.cache.get(key)) : this.cache.get(key);
    if (cached) return cached;
    const pending = this.pendingTiles.get(key);
    if (pending) return pending;

    const promise = (async () => {
      const raw = await this.backend.computeTile({ source, channel, timeStart, timeEnd, stft, ...(profile ? { profile } : {}) });
      const transform = async () =>
        applyTransforms(raw, transforms, {
          requestedTimeStart: timeStart,
          requestedTimeEnd: timeEnd,
          sampleRate: source.sampleRate,
          stft,
        });
      const transformed = profile ? await profile.measureAsync('tile.transforms.apply', { channel, timeStart, timeEnd }, transform) : await transform();
      this.cache.set(key, transformed);
      this.events.emit('tileload', { tileId: key, timeStart, timeEnd, channel });
      return transformed;
    })();
    this.pendingTiles.set(key, promise);
    promise.finally(() => this.pendingTiles.delete(key));
    return promise;
  }

  private tileKey(channel: number, timeStart: number, timeEnd: number): string {
    if (!this.config.source) throw new Error('Cannot key tile without an AudioSource');
    return createTileKey({
      sourceId: this.config.source.id,
      channel,
      timeStart,
      timeEnd,
      stftHash: stableHash(this.config.stft),
      transformHash: stableHash(this.config.transforms.map((transform) => ({ name: transform.name, version: transform.version, config: transform.config }))),
    });
  }

  private tileConfigHash(): string {
    return stableHash({
      sourceId: this.config.source?.id,
      channel: this.config.channel,
      stft: this.config.stft,
      transforms: this.config.transforms.map((transform) => ({ name: transform.name, version: transform.version, config: transform.config })),
    });
  }
}

function webglProgramRenderInput(renderer: RendererMode): Pick<RenderInput, 'webglProgram'> {
  if (typeof renderer === 'object' && renderer.type === 'webgl' && renderer.program) return { webglProgram: renderer.program };
  return {};
}
