import type { AudioRange, AudioSource } from "../types";
import { TypedEventEmitter } from "../events";

/**
 * Clip boundaries in seconds.
 */
export type ClipBounds = {
  /** Start time of the clip in seconds. */
  clipStart?: number | undefined;
  /** End time of the clip in seconds. */
  clipEnd?: number | undefined;
};

export type ClippedSourceEvents = {
  clipchange: { clipStart: number; clipEnd: number };
  rangeavailable: AudioRange;
};

/**
 * Wraps an underlying AudioSource to restrict sample reads and visualization to a bounded time window.
 */
export class ClippedAudioSource implements AudioSource {
  readonly sampleRate: number;
  readonly channelCount: number;

  get id(): string {
    return `clipped:${this.underlyingSource.id}:${this._clipStart}:${this._clipEnd}`;
  }

  private _clipStart: number;
  private _clipEnd: number;
  private readonly events = new TypedEventEmitter<ClippedSourceEvents>();
  private underlyingRangeCleanup?: (() => void) | undefined;

  constructor(
    readonly underlyingSource: AudioSource,
    bounds: ClipBounds = {},
  ) {
    this.sampleRate = underlyingSource.sampleRate;
    this.channelCount = underlyingSource.channelCount;

    const maxDuration = underlyingSource.duration;
    this._clipStart = Math.max(0, bounds.clipStart ?? 0);
    this._clipEnd = Math.min(
      maxDuration,
      Math.max(this._clipStart, bounds.clipEnd ?? maxDuration),
    );

    if (underlyingSource.onRangeAvailable) {
      this.underlyingRangeCleanup = underlyingSource.onRangeAvailable(
        (range) => {
          const start = Math.max(this._clipStart, range.startTime);
          const end = Math.min(this._clipEnd, range.endTime);
          if (end > start) {
            this.events.emit("rangeavailable", {
              startTime: start,
              endTime: end,
            });
          }
        },
      );
    }
  }

  get duration(): number {
    return this.underlyingSource.duration;
  }

  get clipStart(): number {
    return this._clipStart;
  }

  get clipEnd(): number {
    return this._clipEnd;
  }

  get clipDuration(): number {
    return Math.max(0, this._clipEnd - this._clipStart);
  }

  getClipBounds(): { clipStart: number; clipEnd: number } {
    return { clipStart: this._clipStart, clipEnd: this._clipEnd };
  }

  setClipBounds(bounds: ClipBounds): void {
    const maxDuration = this.underlyingSource.duration;
    const newStart = Math.max(0, bounds.clipStart ?? this._clipStart);
    const newEnd = Math.min(
      maxDuration,
      Math.max(newStart, bounds.clipEnd ?? this._clipEnd),
    );

    if (newStart !== this._clipStart || newEnd !== this._clipEnd) {
      this._clipStart = newStart;
      this._clipEnd = newEnd;
      this.events.emit("clipchange", {
        clipStart: newStart,
        clipEnd: newEnd,
      });
    }
  }

  read(options: {
    channel: number;
    startTime: number;
    endTime: number;
  }): Float32Array | Promise<Float32Array> {
    const requestedStart = options.startTime;
    const requestedEnd = options.endTime;

    const clampedStart = Math.max(this._clipStart, requestedStart);
    const clampedEnd = Math.min(this._clipEnd, requestedEnd);

    if (clampedEnd <= clampedStart) {
      const sampleCount = Math.max(
        0,
        Math.floor((requestedEnd - requestedStart) * this.sampleRate),
      );
      return new Float32Array(sampleCount);
    }

    const raw = this.underlyingSource.read({
      channel: options.channel,
      startTime: clampedStart,
      endTime: clampedEnd,
    });

    if (raw instanceof Promise) {
      return raw.then((samples) => {
        return this.padSamplesIfNeeded(
          samples,
          requestedStart,
          requestedEnd,
          clampedStart,
          clampedEnd,
        );
      });
    }

    return this.padSamplesIfNeeded(
      raw,
      requestedStart,
      requestedEnd,
      clampedStart,
      clampedEnd,
    );
  }

  private padSamplesIfNeeded(
    samples: Float32Array,
    requestedStart: number,
    requestedEnd: number,
    clampedStart: number,
    clampedEnd: number,
  ): Float32Array {
    if (requestedStart === clampedStart && requestedEnd === clampedEnd) {
      return samples;
    }
    const totalExpectedSamples = Math.max(
      0,
      Math.floor((requestedEnd - requestedStart) * this.sampleRate),
    );
    const result = new Float32Array(totalExpectedSamples);
    const leadZeros = Math.max(
      0,
      Math.floor((clampedStart - requestedStart) * this.sampleRate),
    );
    result.set(samples, leadZeros);
    return result;
  }

  onRangeAvailable(handler: (range: AudioRange) => void): () => void {
    return this.events.on("rangeavailable", handler);
  }

  on<K extends keyof ClippedSourceEvents>(
    event: K,
    handler: (e: ClippedSourceEvents[K]) => void,
  ): () => void {
    return this.events.on(event, handler);
  }

  destroy(): void {
    if (this.underlyingRangeCleanup) {
      this.underlyingRangeCleanup();
      this.underlyingRangeCleanup = undefined;
    }
    this.events.clear();
  }
}

export function clipAudioSource(
  source: AudioSource,
  bounds: ClipBounds,
): ClippedAudioSource {
  if (source instanceof ClippedAudioSource) {
    return new ClippedAudioSource(source.underlyingSource, bounds);
  }
  return new ClippedAudioSource(source, bounds);
}
