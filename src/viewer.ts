import { MainThreadComputeBackend, type SpectrogramComputeBackend } from './backend';
import { createTileKey, SpectrogramCache } from './cache';
import { resolveConfig, stableHash } from './config';
import { TypedEventEmitter } from './events';
import { canvasToTimeFrequency as mapCanvasToTimeFrequency, timeFrequencyToCanvas as mapTimeFrequencyToCanvas } from './frequency-scale';
import { CanvasSpectrogramRenderer } from './renderer';
import { DecodedAudioSource } from './source';
import { applyTransforms } from './transforms';
import type { ResolvedSpectrogramConfig, SpectrogramConfig, SpectrogramEvents, SpectrogramMatrix, SpectrogramStatus } from './types';

export class SpectrogramViewer {
  private readonly events = new TypedEventEmitter<SpectrogramEvents>();
  private readonly cache: SpectrogramCache;
  private readonly renderer = new CanvasSpectrogramRenderer();
  private playbackCleanup: Array<() => void> = [];
  private animationFrame: number | undefined;
  private requestCounter = 0;
  private status: SpectrogramStatus = { state: 'idle' };

  private constructor(
    private config: ResolvedSpectrogramConfig,
    private readonly backend: SpectrogramComputeBackend,
  ) {
    this.cache = new SpectrogramCache({ maxCachedTiles: config.cache.maxCachedTiles });
    this.attachPlaybackSync();
  }

  static async create(input: SpectrogramConfig & { backend?: SpectrogramComputeBackend }): Promise<SpectrogramViewer> {
    let config = resolveConfig(input);
    if (!config.source && config.audio) {
      const url = config.audio.currentSrc || config.audio.src;
      if (!url) throw new Error('SpectrogramViewer requires audio.currentSrc or audio.src when source is omitted');
      config = { ...config, source: await DecodedAudioSource.fromUrl(url) };
    }
    return new SpectrogramViewer(config, input.backend ?? new MainThreadComputeBackend());
  }

  on<Name extends keyof SpectrogramEvents>(name: Name, handler: (event: SpectrogramEvents[Name]) => void): () => void {
    return this.events.on(name, handler);
  }

  getConfig(): ResolvedSpectrogramConfig {
    return this.config;
  }

  setConfig(input: Partial<SpectrogramConfig>): void {
    const source = input.source ?? this.config.source;
    this.config = resolveConfig({ ...this.config, ...input, canvas: input.canvas ?? this.config.canvas, ...(source ? { source } : {}) });
    this.cache.clear();
    this.renderer.invalidate();
    this.events.emit('configchange', { config: this.config });
  }

  getViewport(): ResolvedSpectrogramConfig['viewport'] {
    return this.config.viewport;
  }

  setViewport(viewport: Partial<ResolvedSpectrogramConfig['viewport']>): void {
    this.config = resolveConfig({
      ...this.config,
      viewport: { ...this.config.viewport, ...viewport },
      canvas: this.config.canvas,
      ...(this.config.source ? { source: this.config.source } : {}),
    });
    this.events.emit('viewportchange', { viewport: this.config.viewport });
  }

  getStatus(): SpectrogramStatus {
    return this.status;
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
    const tiles = this.visibleTileRanges();
    this.status = { state: 'rendering' };
    this.events.emit('renderstart', { requestId, total: tiles.length });
    const matrices: SpectrogramMatrix[] = [];
    let completed = 0;
    for (const tile of tiles) {
      const matrix = await this.getTile(tile.channel, tile.timeStart, tile.timeEnd);
      matrices.push(matrix);
      completed += 1;
      this.events.emit('renderprogress', { requestId, completed, total: tiles.length, progress: completed / tiles.length, phase: 'computing' });
    }
    this.renderer.render({
      canvas: this.config.canvas,
      viewport: this.config.viewport,
      valueScale: this.config.valueScale,
      colorMap: this.config.colorMap,
      tiles: matrices,
      ...(this.config.playback.showPlayhead && this.config.audio ? { playheadTime: this.config.audio.currentTime } : {}),
    });
    this.events.emit('renderprogress', { requestId, completed: tiles.length, total: tiles.length, progress: 1, phase: 'rendering' });
    this.status = { state: 'ready' };
    this.events.emit('rendercomplete', { requestId, renderedTiles: matrices.length, missingTiles: 0 });
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
    const spectrum = await this.querySpectrum({ time: input.time, channel: input.channel ?? 0 });
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
    const channel = input.channel ?? 0;
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
    this.cache.clear();
    this.backend.destroy?.();
    this.events.clear();
    this.status = { state: 'destroyed' };
  }

  private attachPlaybackSync(): void {
    const audio = this.config.audio;
    if (!audio) return;
    const onSeeked = () => {
      this.followPlayheadIfNeeded();
      if (this.config.playback.renderOnSeek) void this.render();
    };
    const onPlay = () => this.startPlaybackLoop();
    const onPause = () => this.stopPlaybackLoop();
    audio.addEventListener('seeked', onSeeked);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    this.playbackCleanup.push(() => audio.removeEventListener('seeked', onSeeked));
    this.playbackCleanup.push(() => audio.removeEventListener('play', onPlay));
    this.playbackCleanup.push(() => audio.removeEventListener('pause', onPause));
  }

  private startPlaybackLoop(): void {
    const tick = () => {
      const viewportChanged = this.followPlayheadIfNeeded();
      if (viewportChanged || !this.renderPlaybackPlayhead()) void this.render();
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

  private renderPlaybackPlayhead(): boolean {
    const audio = this.config.audio;
    if (!audio || !this.config.playback.showPlayhead) return true;
    return this.renderer.renderPlayhead({ canvas: this.config.canvas, viewport: this.config.viewport, playheadTime: audio.currentTime });
  }

  private visibleTileRanges(): Array<{ channel: number; timeStart: number; timeEnd: number }> {
    if (!this.config.source) throw new Error('Cannot render without an AudioSource');
    const ranges: Array<{ channel: number; timeStart: number; timeEnd: number }> = [];
    const firstStart = Math.floor(this.config.viewport.startTime / this.config.cache.tileDurationSeconds) * this.config.cache.tileDurationSeconds;
    for (let channel = 0; channel < this.config.source.channelCount; channel++) {
      for (let start = firstStart; start < this.config.viewport.endTime; start += this.config.cache.tileDurationSeconds) {
        ranges.push({ channel, timeStart: Math.max(0, start), timeEnd: Math.min(this.config.source.duration, start + this.config.cache.tileDurationSeconds) });
      }
    }
    return ranges;
  }

  private tileRangeForTime(time: number): { timeStart: number; timeEnd: number } {
    if (!this.config.source) throw new Error('Cannot query without an AudioSource');
    const start = Math.floor(time / this.config.cache.tileDurationSeconds) * this.config.cache.tileDurationSeconds;
    return { timeStart: Math.max(0, start), timeEnd: Math.min(this.config.source.duration, start + this.config.cache.tileDurationSeconds) };
  }

  private async getTile(channel: number, timeStart: number, timeEnd: number): Promise<SpectrogramMatrix> {
    if (!this.config.source) throw new Error('Cannot compute tile without an AudioSource');
    const key = createTileKey({
      sourceId: this.config.source.id,
      channel,
      timeStart,
      timeEnd,
      stftHash: stableHash(this.config.stft),
      transformHash: stableHash(this.config.transforms.map((transform) => ({ name: transform.name, version: transform.version, config: transform.config }))),
    });
    const cached = this.cache.get(key);
    if (cached) return cached;
    const raw = await this.backend.computeTile({ source: this.config.source, channel, timeStart, timeEnd, stft: this.config.stft });
    const transformed = await applyTransforms(raw, this.config.transforms, {
      requestedTimeStart: timeStart,
      requestedTimeEnd: timeEnd,
      sampleRate: this.config.source.sampleRate,
      stft: this.config.stft,
    });
    this.cache.set(key, transformed);
    this.events.emit('tileload', { tileId: key, timeStart, timeEnd, channel });
    return transformed;
  }
}
