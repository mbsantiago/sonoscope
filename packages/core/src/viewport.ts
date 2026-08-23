import type {
  IViewportController,
  ViewportConfig,
  ViewportControllerOptions,
  ViewportEvents,
  ViewportState,
} from "./types";
import { TypedEventEmitter } from "./events";
import {
  attachNavigation,
  type FrequencyBounds,
  type NavigableViewer,
  type NavigationOptions,
  panViewportFrequency,
  panViewportTime,
  type TimeBounds,
  zoomViewportFrequency,
  zoomViewportTime,
} from "./navigation";
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
  private minTime: number;
  private maxTime: number;
  private minDuration: number;
  private maxDuration: number;
  private baseMinFrequency: number;
  private baseMaxFrequency: number;

  private readonly initialStartTime: number;
  private readonly initialEndTime: number;
  private readonly initialMinFrequency: number;
  private readonly initialMaxFrequency: number;

  private readonly events = new TypedEventEmitter<ViewportEvents>();
  private navigationCleanups: Array<() => void> = [];

  constructor(options: ViewportControllerOptions = {}) {
    this.minTime = Math.max(0, options.minTime ?? 0);
    this.maxTime =
      options.maxTime !== undefined
        ? Math.max(this.minTime + 0.001, options.maxTime)
        : options.totalDuration !== undefined
          ? Math.max(this.minTime + 0.001, options.totalDuration)
          : Infinity;

    this.totalDuration = Number.isFinite(this.maxTime)
      ? this.maxTime
      : options.totalDuration !== undefined
        ? Math.max(0.001, options.totalDuration)
        : Infinity;

    this.minDuration = Math.max(0.001, options.minDuration ?? 0.001);
    this.maxDuration = Math.max(
      this.minDuration,
      options.maxDuration ??
        (Number.isFinite(this.maxTime)
          ? this.maxTime - this.minTime
          : this.totalDuration),
    );

    this.baseMinFrequency = options.minFrequency ?? 0;
    this.baseMaxFrequency = Math.max(
      this.baseMinFrequency + 1,
      options.maxFrequency ?? 24000,
    );

    const initialStart = options.startTime ?? this.minTime;
    const initialEnd =
      options.endTime ??
      (Number.isFinite(this.maxTime)
        ? Math.min(this.minTime + 10, this.maxTime)
        : this.minTime + 10);

    const clamped = Number.isFinite(this.maxTime)
      ? clampViewportTimes(
          initialStart,
          initialEnd,
          this.maxTime,
          this.minDuration,
          this.maxDuration,
          this.minTime,
        )
      : {
          startTime: Math.max(this.minTime, initialStart),
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

  setTimeBounds(minTime: number, maxTime: number): void {
    this.minTime = Math.max(0, minTime);
    this.maxTime = Math.max(this.minTime + 0.001, maxTime);
    const duration = Math.min(
      this.endTime - this.startTime,
      this.maxTime - this.minTime,
    );
    const clampedStart = clamp(
      this.startTime,
      this.minTime,
      Math.max(this.minTime, this.maxTime - duration),
    );
    this.setViewport({
      startTime: clampedStart,
      endTime: clampedStart + duration,
    });
  }

  getTimeBounds(): { minTime: number; maxTime: number } {
    return { minTime: this.minTime, maxTime: this.maxTime };
  }

  setViewport(patch: Partial<ViewportConfig>, source?: string): void {
    let changed = false;

    if (patch.startTime !== undefined || patch.endTime !== undefined) {
      const requestedStart = patch.startTime ?? this.startTime;
      const requestedEnd = patch.endTime ?? this.endTime;

      const clamped = Number.isFinite(this.maxTime)
        ? clampViewportTimes(
            requestedStart,
            requestedEnd,
            this.maxTime,
            this.minDuration,
            this.maxDuration,
            this.minTime,
          )
        : {
            startTime: Math.max(this.minTime, requestedStart),
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
    this.setViewport(
      panViewportTime(this.viewportConfig(), this.timeBounds(), deltaSeconds),
      source,
    );
  }

  pan(deltaSeconds: number, source?: string): void {
    this.panTime(deltaSeconds, source);
  }

  panTo(startTime: number, source?: string): void {
    if (!Number.isFinite(startTime)) return;
    const viewport = this.viewportConfig();
    this.setViewport(
      panViewportTime(
        viewport,
        this.timeBounds(),
        startTime - viewport.startTime,
      ),
      source,
    );
  }

  zoomTime(factor: number, centerTime?: number, source?: string): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const viewport = this.viewportConfig();
    const center =
      centerTime !== undefined && Number.isFinite(centerTime)
        ? centerTime
        : viewport.startTime + (viewport.endTime - viewport.startTime) / 2;
    this.setViewport(
      zoomViewportTime(viewport, this.timeBounds(), center, factor),
      source,
    );
  }

  zoom(factor: number, centerTime?: number, source?: string): void {
    this.zoomTime(factor, centerTime, source);
  }

  panFrequency(deltaHz: number, source?: string): void {
    if (!Number.isFinite(deltaHz)) return;
    this.setViewport(
      panViewportFrequency(
        this.viewportConfig(),
        this.frequencyBounds(),
        deltaHz,
      ),
      source,
    );
  }

  zoomFrequency(
    factor: number,
    centerFrequency?: number,
    source?: string,
  ): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const viewport = this.viewportConfig();
    const center =
      centerFrequency !== undefined && Number.isFinite(centerFrequency)
        ? centerFrequency
        : viewport.minFrequency +
          (viewport.maxFrequency - viewport.minFrequency) / 2;
    this.setViewport(
      zoomViewportFrequency(viewport, this.frequencyBounds(), center, factor),
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

    const viewport = this.viewportConfig();
    const currentDuration = viewport.endTime - viewport.startTime;
    const currentSpan = viewport.maxFrequency - viewport.minFrequency;
    const centerT = center?.time ?? viewport.startTime + currentDuration / 2;
    const centerF =
      center?.frequency ?? viewport.minFrequency + currentSpan / 2;

    const afterTime = zoomViewportTime(
      viewport,
      this.timeBounds(),
      centerT,
      timeFactor,
    );
    const afterZoom = zoomViewportFrequency(
      afterTime,
      this.frequencyBounds(),
      centerF,
      freqFactor,
    );

    this.setViewport(
      {
        startTime: afterZoom.startTime,
        endTime: afterZoom.endTime,
        minFrequency: afterZoom.minFrequency,
        maxFrequency: afterZoom.maxFrequency,
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

  attachNavigation(
    container: HTMLElement,
    options?: NavigationOptions,
  ): () => void {
    if (
      (typeof HTMLElement !== "undefined" &&
        container instanceof HTMLElement) ||
      (typeof container === "object" &&
        container !== null &&
        "addEventListener" in container)
    ) {
      const adapter: NavigableViewer = {
        getViewport: () => {
          const vp = this.getViewport();
          return {
            startTime: vp.startTime,
            endTime: vp.endTime,
            minFrequency: vp.minFrequency,
            maxFrequency: vp.maxFrequency,
          };
        },
        setViewport: (vp) => {
          this.setViewport(vp, "navigation");
        },
        requestRender: () => {},
        getCanvas: () => container,
        getConfig: () => ({
          canvas: container,
          minViewportDuration: this.minDuration,
          maxViewportDuration: this.maxDuration,
          minFrequency: this.baseMinFrequency,
          maxFrequency: this.baseMaxFrequency,
        }),
        getTimeBounds: () => ({
          startTime: this.minTime,
          endTime: Number.isFinite(this.maxTime) ? this.maxTime : 1e9,
          minDurationSeconds: this.minDuration,
          maxDurationSeconds: Math.min(
            this.maxDuration,
            Number.isFinite(this.maxTime)
              ? this.maxTime - this.minTime
              : this.maxDuration,
          ),
        }),
        getFrequencyBounds: () => ({
          minFrequency: this.baseMinFrequency,
          maxFrequency: this.baseMaxFrequency,
          minSpanHz: 20,
        }),
      };

      const cleanup = attachNavigation(adapter, container, options);
      this.navigationCleanups.push(cleanup);
      return () => {
        const idx = this.navigationCleanups.indexOf(cleanup);
        if (idx !== -1) this.navigationCleanups.splice(idx, 1);
        cleanup();
      };
    }

    throw new Error(
      "Invalid navigation target: expected DOM container element",
    );
  }

  destroy(): void {
    for (const cleanup of this.navigationCleanups) {
      cleanup();
    }
    this.navigationCleanups = [];
    this.events.emit("destroy", undefined);
    this.events.clear();
  }

  private emitChange(source?: string): void {
    this.events.emit("viewportchange", {
      viewport: this.getViewport(),
      source,
    });
  }

  private viewportConfig(): {
    startTime: number;
    endTime: number;
    minFrequency: number;
    maxFrequency: number;
  } {
    return {
      startTime: this.startTime,
      endTime: this.endTime,
      minFrequency: this.minFrequency,
      maxFrequency: this.maxFrequency,
    };
  }

  private timeBounds(): TimeBounds {
    const finite = Number.isFinite(this.maxTime);
    return {
      startTime: this.minTime,
      endTime: finite ? this.maxTime : Number.MAX_VALUE,
      minDurationSeconds: this.minDuration,
      maxDurationSeconds: finite
        ? Math.min(this.maxDuration, this.maxTime - this.minTime)
        : this.maxDuration,
    };
  }

  private frequencyBounds(): FrequencyBounds {
    return {
      minFrequency: this.baseMinFrequency,
      maxFrequency: this.baseMaxFrequency,
      minSpanHz: 10,
    };
  }
}
