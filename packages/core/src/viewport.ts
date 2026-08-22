import type {
  IViewportController,
  ViewportConfig,
  ViewportControllerOptions,
  ViewportEvents,
  ViewportState,
} from "./types";
import { TypedEventEmitter } from "./events";
import { clampViewportTimes } from "./viewport-math";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export class ViewportController implements IViewportController {
  private startTime: number;
  private endTime: number;
  private minFrequency: number;
  private maxFrequency: number;
  private totalDuration: number;
  private minDuration: number;
  private maxDuration: number;
  private baseMinFrequency: number;
  private baseMaxFrequency: number;

  private readonly initialStartTime: number;
  private readonly initialEndTime: number;
  private readonly initialMinFrequency: number;
  private readonly initialMaxFrequency: number;

  private readonly events = new TypedEventEmitter<ViewportEvents>();

  constructor(options: ViewportControllerOptions = {}) {
    this.totalDuration =
      options.totalDuration !== undefined
        ? Math.max(0.001, options.totalDuration)
        : Infinity;
    this.minDuration = Math.max(0.001, options.minDuration ?? 0.001);
    this.maxDuration = Math.max(
      this.minDuration,
      options.maxDuration ?? this.totalDuration,
    );

    this.baseMinFrequency = options.minFrequency ?? 0;
    this.baseMaxFrequency = Math.max(
      this.baseMinFrequency + 1,
      options.maxFrequency ?? 24000,
    );

    const initialStart = options.startTime ?? 0;
    const initialEnd =
      options.endTime ??
      (Number.isFinite(this.totalDuration)
        ? Math.min(10, this.totalDuration)
        : 10);

    const clamped = Number.isFinite(this.totalDuration)
      ? clampViewportTimes(
          initialStart,
          initialEnd,
          this.totalDuration,
          this.minDuration,
          this.maxDuration,
        )
      : {
          startTime: Math.max(0, initialStart),
          endTime: Math.max(initialStart + this.minDuration, initialEnd),
        };

    this.startTime = clamped.startTime;
    this.endTime = clamped.endTime;
    this.minFrequency = this.baseMinFrequency;
    this.maxFrequency = this.baseMaxFrequency;

    this.initialStartTime = this.startTime;
    this.initialEndTime = this.endTime;
    this.initialMinFrequency = this.minFrequency;
    this.initialMaxFrequency = this.maxFrequency;
  }

  getViewport(): ViewportState {
    return {
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.endTime - this.startTime,
      totalDuration: this.totalDuration,
      minFrequency: this.minFrequency,
      maxFrequency: this.maxFrequency,
    };
  }

  setViewport(patch: Partial<ViewportConfig>, source?: string): void {
    let changed = false;

    if (patch.startTime !== undefined || patch.endTime !== undefined) {
      const requestedStart = patch.startTime ?? this.startTime;
      const requestedEnd = patch.endTime ?? this.endTime;

      const clamped = Number.isFinite(this.totalDuration)
        ? clampViewportTimes(
            requestedStart,
            requestedEnd,
            this.totalDuration,
            this.minDuration,
            this.maxDuration,
          )
        : {
            startTime: Math.max(0, requestedStart),
            endTime: Math.max(requestedStart + this.minDuration, requestedEnd),
          };

      if (
        clamped.startTime !== this.startTime ||
        clamped.endTime !== this.endTime
      ) {
        this.startTime = clamped.startTime;
        this.endTime = clamped.endTime;
        changed = true;
      }
    }

    if (patch.minFrequency !== undefined || patch.maxFrequency !== undefined) {
      const minF = Math.max(
        this.baseMinFrequency,
        patch.minFrequency ?? this.minFrequency,
      );
      const maxF = Math.min(
        this.baseMaxFrequency,
        patch.maxFrequency ?? this.maxFrequency,
      );

      if (
        maxF > minF &&
        (minF !== this.minFrequency || maxF !== this.maxFrequency)
      ) {
        this.minFrequency = minF;
        this.maxFrequency = maxF;
        changed = true;
      }
    }

    if (changed) {
      this.emitChange(source);
    }
  }

  setTotalDuration(totalDuration: number): void {
    if (!Number.isFinite(totalDuration) || totalDuration <= 0) return;
    this.totalDuration = totalDuration;
    this.setViewport({});
  }

  setBaseFrequencyBounds(minFrequency: number, maxFrequency: number): void {
    if (!Number.isFinite(minFrequency) || !Number.isFinite(maxFrequency))
      return;
    this.baseMinFrequency = Math.max(0, minFrequency);
    this.baseMaxFrequency = Math.max(this.baseMinFrequency + 10, maxFrequency);
    this.setViewport({});
  }

  updateViewport(patch: Partial<ViewportConfig>, source?: string): void {
    this.setViewport(patch, source);
  }

  panTime(deltaSeconds: number, source?: string): void {
    if (!Number.isFinite(deltaSeconds)) return;
    const duration = this.endTime - this.startTime;
    const newStart = clamp(
      this.startTime + deltaSeconds,
      0,
      Math.max(0, this.totalDuration - duration),
    );
    this.setViewport(
      { startTime: newStart, endTime: newStart + duration },
      source,
    );
  }

  pan(deltaSeconds: number, source?: string): void {
    this.panTime(deltaSeconds, source);
  }

  panTo(startTime: number, source?: string): void {
    if (!Number.isFinite(startTime)) return;
    const duration = this.endTime - this.startTime;
    const newStart = clamp(
      startTime,
      0,
      Math.max(0, this.totalDuration - duration),
    );
    this.setViewport(
      { startTime: newStart, endTime: newStart + duration },
      source,
    );
  }

  zoomTime(factor: number, centerTime?: number, source?: string): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const currentDuration = this.endTime - this.startTime;
    const center =
      centerTime !== undefined && Number.isFinite(centerTime)
        ? centerTime
        : this.startTime + currentDuration / 2;
    const targetDuration = clamp(
      currentDuration * factor,
      this.minDuration,
      this.maxDuration,
    );

    if (Math.abs(targetDuration - currentDuration) < 1e-9) return;

    const ratio =
      currentDuration <= 0 ? 0.5 : (center - this.startTime) / currentDuration;

    const newStart = clamp(
      center - targetDuration * ratio,
      0,
      Math.max(0, this.totalDuration - targetDuration),
    );

    this.setViewport(
      { startTime: newStart, endTime: newStart + targetDuration },
      source,
    );
  }

  zoom(factor: number, centerTime?: number, source?: string): void {
    this.zoomTime(factor, centerTime, source);
  }

  panFrequency(deltaHz: number, source?: string): void {
    if (!Number.isFinite(deltaHz)) return;
    const span = this.maxFrequency - this.minFrequency;
    const newMin = clamp(
      this.minFrequency + deltaHz,
      this.baseMinFrequency,
      Math.max(this.baseMinFrequency, this.baseMaxFrequency - span),
    );
    this.setViewport(
      { minFrequency: newMin, maxFrequency: newMin + span },
      source,
    );
  }

  zoomFrequency(
    factor: number,
    centerFrequency?: number,
    source?: string,
  ): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const currentSpan = this.maxFrequency - this.minFrequency;
    const center =
      centerFrequency !== undefined && Number.isFinite(centerFrequency)
        ? centerFrequency
        : this.minFrequency + currentSpan / 2;
    const targetSpan = clamp(
      currentSpan * factor,
      10,
      this.baseMaxFrequency - this.baseMinFrequency,
    );

    if (Math.abs(targetSpan - currentSpan) < 1e-9) return;

    const ratio =
      currentSpan <= 0 ? 0.5 : (center - this.minFrequency) / currentSpan;

    const newMin = clamp(
      center - targetSpan * ratio,
      this.baseMinFrequency,
      Math.max(this.baseMinFrequency, this.baseMaxFrequency - targetSpan),
    );

    this.setViewport(
      { minFrequency: newMin, maxFrequency: newMin + targetSpan },
      source,
    );
  }

  zoomFreq(factor: number, centerFrequency?: number, source?: string): void {
    this.zoomFrequency(factor, centerFrequency, source);
  }

  zoomBoth(
    factor: number | { time: number; frequency: number },
    center?: { time?: number; frequency?: number },
    source?: string,
  ): void {
    const timeFactor = typeof factor === "number" ? factor : factor?.time;
    const freqFactor = typeof factor === "number" ? factor : factor?.frequency;

    if (
      !Number.isFinite(timeFactor) ||
      timeFactor <= 0 ||
      !Number.isFinite(freqFactor) ||
      freqFactor <= 0
    ) {
      return;
    }

    const currentDuration = this.endTime - this.startTime;
    const centerT = center?.time ?? this.startTime + currentDuration / 2;
    const targetDuration = clamp(
      currentDuration * timeFactor,
      this.minDuration,
      Math.min(this.maxDuration, this.totalDuration),
    );
    const ratioT =
      currentDuration <= 0 ? 0.5 : (centerT - this.startTime) / currentDuration;
    const newStart = clamp(
      centerT - targetDuration * ratioT,
      0,
      Math.max(0, this.totalDuration - targetDuration),
    );

    const currentSpan = this.maxFrequency - this.minFrequency;
    const centerF = center?.frequency ?? this.minFrequency + currentSpan / 2;
    const targetSpan = clamp(
      currentSpan * freqFactor,
      10,
      this.baseMaxFrequency - this.baseMinFrequency,
    );
    const ratioF =
      currentSpan <= 0 ? 0.5 : (centerF - this.minFrequency) / currentSpan;
    const newMin = clamp(
      centerF - targetSpan * ratioF,
      this.baseMinFrequency,
      Math.max(this.baseMinFrequency, this.baseMaxFrequency - targetSpan),
    );

    this.setViewport(
      {
        startTime: newStart,
        endTime: newStart + targetDuration,
        minFrequency: newMin,
        maxFrequency: newMin + targetSpan,
      },
      source,
    );
  }

  reset(): void {
    this.setViewport({
      startTime: this.initialStartTime,
      endTime: this.initialEndTime,
      minFrequency: this.initialMinFrequency,
      maxFrequency: this.initialMaxFrequency,
    });
  }

  on<K extends keyof ViewportEvents>(
    event: K,
    handler: (e: ViewportEvents[K]) => void,
  ): () => void {
    return this.events.on(event, handler);
  }

  destroy(): void {
    this.events.emit("destroy", undefined);
    this.events.clear();
  }

  private emitChange(source?: string): void {
    this.events.emit("viewportchange", {
      viewport: this.getViewport(),
      source,
    });
  }
}
