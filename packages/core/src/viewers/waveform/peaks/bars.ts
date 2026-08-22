import type { AudioSource } from "../../../types";
import type { BarPeakBlock } from "../types";

interface BarLevelCache {
  min: Float32Array;
  max: Float32Array;
  computed: Uint8Array;
}

export class BarPeakPyramid {
  private cache = new Map<number, BarLevelCache>();

  constructor(
    private readonly source: AudioSource,
    private readonly channel = 0,
  ) {}

  async getBarPeaks(
    startTime: number,
    endTime: number,
    barDuration: number,
  ): Promise<BarPeakBlock> {
    const sampleRate = this.source.sampleRate;
    const totalDuration = this.source.duration;
    const timeSpan = endTime - startTime;

    if (timeSpan <= 0 || barDuration <= 0) {
      return {
        min: new Float32Array(0),
        max: new Float32Array(0),
        kStart: 0,
        kEnd: 0,
        barDuration: Math.max(0.001, barDuration),
      };
    }

    const totalBars = Math.max(1, Math.ceil(totalDuration / barDuration) + 2);
    const kStart = Math.max(
      0,
      Math.floor((startTime - barDuration) / barDuration),
    );
    const kEnd = Math.min(
      totalBars - 1,
      Math.ceil((endTime + barDuration) / barDuration),
    );
    const count = Math.max(0, kEnd - kStart + 1);

    if (count === 0) {
      return {
        min: new Float32Array(0),
        max: new Float32Array(0),
        kStart,
        kEnd,
        barDuration,
      };
    }

    // Cache key for this specific bar duration quantized to microsecond precision
    const cacheKey = Math.round(barDuration * 1e6);
    let level = this.cache.get(cacheKey);

    if (level && level.min.length >= totalBars) {
      // LRU refresh: promote key to newest position
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, level);
    } else {
      // Evict least-recently-used entry if exceeding max zoom levels (16 levels)
      const MAX_CACHED_LEVELS = 16;
      while (this.cache.size >= MAX_CACHED_LEVELS) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey !== undefined) {
          this.cache.delete(oldestKey);
        } else {
          break;
        }
      }

      level = {
        min: new Float32Array(totalBars),
        max: new Float32Array(totalBars),
        computed: new Uint8Array(totalBars),
      };
      this.cache.set(cacheKey, level);
    }

    // Find contiguous span of uncomputed bars in [kStart, kEnd]
    let missingStart = -1;
    let missingEnd = -1;

    for (let k = kStart; k <= kEnd; k++) {
      if (!level.computed[k]) {
        if (missingStart === -1) missingStart = k;
        missingEnd = k;
      }
    }

    if (missingStart !== -1 && missingEnd !== -1) {
      // Add extra margin of bars around the missing range to batch reads efficiently
      const fetchKStart = Math.max(0, missingStart - 20);
      const fetchKEnd = Math.min(totalBars - 1, missingEnd + 20);

      const readStart = fetchKStart * barDuration;
      const readEnd = Math.min(totalDuration, (fetchKEnd + 1) * barDuration);

      const startSampleIndex = Math.max(0, Math.floor(readStart * sampleRate));
      const endSampleIndex = Math.min(
        Math.round(totalDuration * sampleRate),
        Math.ceil(readEnd * sampleRate) + 4,
      );

      const samples = await this.source.read({
        channel: this.channel,
        startTime: (startSampleIndex + 0.0001) / sampleRate,
        endTime: (endSampleIndex + 0.9999) / sampleRate,
      });

      const len = samples.length;
      if (len > 0) {
        for (let k = fetchKStart; k <= fetchKEnd; k++) {
          if (level.computed[k]) continue;

          const targetS0 = Math.round(k * barDuration * sampleRate);
          const targetS1 = Math.round((k + 1) * barDuration * sampleRate);

          const s0 = Math.max(
            0,
            Math.min(len - 1, targetS0 - startSampleIndex),
          );
          const s1 = Math.max(
            s0 + 1,
            Math.min(len, targetS1 - startSampleIndex),
          );

          let minVal = samples[s0] ?? 0;
          let maxVal = samples[s0] ?? 0;

          for (let j = s0; j < s1; j++) {
            const val = samples[j]!;
            if (val < minVal) minVal = val;
            if (val > maxVal) maxVal = val;
          }

          level.min[k] = minVal;
          level.max[k] = maxVal;
          level.computed[k] = 1;
        }
      }
    }

    const min = new Float32Array(count);
    const max = new Float32Array(count);

    for (let k = kStart; k <= kEnd; k++) {
      const idx = k - kStart;
      min[idx] = level.min[k] ?? 0;
      max[idx] = level.max[k] ?? 0;
    }

    return { min, max, kStart, kEnd, barDuration };
  }

  clear(): void {
    this.cache.clear();
  }
}
