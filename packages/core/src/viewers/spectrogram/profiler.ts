import type {
  ISpectrogramViewer,
  SpectrogramProfileEvent,
  SpectrogramProfilerOptions,
  SpectrogramProfileStats,
} from "./types";
import { TypedEventEmitter } from "../../events";
import { type FrameStats, now } from "../../performance";

export type SpectrogramProfilerEvents = {
  profile: SpectrogramProfileEvent;
  stats: SpectrogramProfileStats;
};

export class SpectrogramProfiler {
  private readonly unsubs: Array<() => void> = [];
  private readonly events = new TypedEventEmitter<SpectrogramProfilerEvents>();
  private readonly clock: () => number;
  private readonly durations: number[] = [];
  private readonly maxSamples: number;
  private destroyed = false;
  private readonly pendingStartTimes = new Map<string, number>();
  private cacheHits = 0;
  private cacheMisses = 0;
  private lastPlaybackStats: FrameStats | undefined;
  private lastStats: SpectrogramProfileStats = {
    renderCount: 0,
    lastDurationMs: 0,
    minDurationMs: 0,
    maxDurationMs: 0,
    avgDurationMs: 0,
    totalTilesLoaded: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cacheHitRatio: 0,
  };

  constructor(
    private readonly viewer: ISpectrogramViewer,
    options: SpectrogramProfilerOptions = {},
  ) {
    this.clock = options.clock ?? now;
    this.maxSamples = options.sampleSize ?? 60;

    const unsubStart = this.viewer.on("renderstart", (e) => {
      this.pendingStartTimes.set(e.requestId, this.clock());
    });

    const unsubTile = this.viewer.on("tileload", (e) => {
      if (e.cacheHit) {
        this.cacheHits += 1;
      } else {
        this.cacheMisses += 1;
      }
    });

    const unsubPlayback = this.viewer.on("playbackprofile", (e) => {
      this.lastPlaybackStats = e;
    });

    const unsubComplete = this.viewer.on("rendercomplete", (e) => {
      const startTime = this.pendingStartTimes.get(e.requestId);
      this.pendingStartTimes.delete(e.requestId);
      const computedDuration =
        startTime !== undefined ? Math.max(0, this.clock() - startTime) : 0;
      const durationMs = e.durationMs ?? computedDuration;

      this.durations.push(durationMs);
      if (this.durations.length > this.maxSamples) {
        this.durations.shift();
      }

      const sum = this.durations.reduce((a, b) => a + b, 0);
      const min = Math.min(...this.durations);
      const max = Math.max(...this.durations);
      const avg = sum / this.durations.length;
      const totalTiles = this.cacheHits + this.cacheMisses;
      const hitRatio = totalTiles > 0 ? this.cacheHits / totalTiles : 0;
      const fps = avg > 0 ? 1000 / avg : undefined;
      const cache =
        typeof this.viewer.getCacheStats === "function"
          ? this.viewer.getCacheStats()
          : undefined;

      this.lastStats = {
        renderCount: this.lastStats.renderCount + 1,
        lastDurationMs: durationMs,
        minDurationMs: min,
        maxDurationMs: max,
        avgDurationMs: avg,
        totalTilesLoaded: totalTiles,
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses,
        cacheHitRatio: hitRatio,
        ...(fps !== undefined ? { fps } : {}),
        ...(cache ? { cache } : {}),
        ...(this.lastPlaybackStats ? { playback: this.lastPlaybackStats } : {}),
      };

      const event: SpectrogramProfileEvent = {
        requestId: e.requestId,
        durationMs,
        renderedTiles: e.renderedTiles,
        missingTiles: e.missingTiles,
        timestamp: this.clock(),
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses,
        cacheHitRatio: hitRatio,
        ...(cache ? { cache } : {}),
      };

      this.events.emit("profile", event);
      this.events.emit("stats", this.lastStats);
    });

    this.unsubs.push(unsubStart, unsubTile, unsubPlayback, unsubComplete);
  }

  on<K extends keyof SpectrogramProfilerEvents>(
    event: K,
    handler: (data: SpectrogramProfilerEvents[K]) => void,
  ): () => void {
    return this.events.on(event, handler);
  }

  getStats(): SpectrogramProfileStats {
    return { ...this.lastStats };
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
    this.pendingStartTimes.clear();
    this.events.clear();
  }
}
