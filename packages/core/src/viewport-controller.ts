import type { FrequencyScale } from "./types";
import { TypedEventEmitter } from "./events";

export function clampViewportTimes(
  startTime: number,
  endTime: number,
  sourceDuration: number,
  minDuration: number,
  maxDuration: number,
): { startTime: number; endTime: number } {
  const duration = Math.min(
    Math.max(endTime - startTime, minDuration),
    maxDuration,
    sourceDuration,
  );
  const clampedStart = Math.min(
    Math.max(0, startTime),
    Math.max(0, sourceDuration - duration),
  );
  return { startTime: clampedStart, endTime: clampedStart + duration };
}

export type FollowPlaybackMode = "page" | "smooth" | "off";

export type ViewportControllerConfig = {
  startTime?: number | undefined;
  endTime?: number | undefined;
  minFrequency?: number | undefined;
  maxFrequency?: number | undefined;
  frequencyScale?: FrequencyScale | undefined;
  totalDuration?: number | undefined;
  minDuration?: number | undefined;
  maxDuration?: number | undefined;
  followPlayback?: FollowPlaybackMode | undefined;
  smoothAnchor?: number | undefined;
  audio?: HTMLAudioElement | undefined;
};

export type ViewportState = {
  startTime: number;
  endTime: number;
  duration: number;
  totalDuration: number;
  minFrequency?: number | undefined;
  maxFrequency?: number | undefined;
  frequencyScale?: FrequencyScale | undefined;
};

export type ViewportControllerEvents = {
  change: { viewport: ViewportState; source?: string | undefined };
  followchange: { mode: FollowPlaybackMode };
};

export interface ITimeBoundViewer {
  getViewport(): {
    startTime: number;
    endTime: number;
    minFrequency?: number | undefined;
    maxFrequency?: number | undefined;
    frequencyScale?: FrequencyScale | undefined;
  };
  updateViewport(
    vp: Partial<{
      startTime: number | undefined;
      endTime: number | undefined;
      minFrequency: number | undefined;
      maxFrequency: number | undefined;
      frequencyScale: FrequencyScale | undefined;
    }>,
  ): void;
  on(
    event: "viewportchange",
    handler: (event: {
      viewport: {
        startTime: number;
        endTime: number;
        minFrequency?: number | undefined;
        maxFrequency?: number | undefined;
        frequencyScale?: FrequencyScale | undefined;
      };
    }) => void,
  ): () => void;
  getDuration?(): number;
}

export interface IViewportController {
  getViewport(): ViewportState;
  setViewport(
    vp: Partial<{
      startTime: number | undefined;
      endTime: number | undefined;
      minFrequency: number | undefined;
      maxFrequency: number | undefined;
      frequencyScale: FrequencyScale | undefined;
    }>,
    source?: string | undefined,
  ): void;
  updateViewport(
    vp: Partial<{
      startTime: number | undefined;
      endTime: number | undefined;
      minFrequency: number | undefined;
      maxFrequency: number | undefined;
      frequencyScale: FrequencyScale | undefined;
    }>,
    source?: string | undefined,
  ): void;
  bind(viewer: ITimeBoundViewer): () => void;
  unbind?(viewer: ITimeBoundViewer): void;
  on<Name extends keyof ViewportControllerEvents>(
    name: Name,
    handler: (event: ViewportControllerEvents[Name]) => void,
  ): () => void;

  zoom?(factor: number, centerTime?: number, source?: string): void;
  pan?(deltaSeconds: number, source?: string): void;
  panTo?(startTime: number, source?: string): void;
  getFollowPlayback?(): FollowPlaybackMode;
  setFollowPlayback?(mode: FollowPlaybackMode): void;
  attachAudio?(audio: HTMLAudioElement): void;
  detachAudio?(): void;
  destroy?(): void;
}

function safeRequestAnimationFrame(callback: () => void): number {
  if (typeof requestAnimationFrame !== "undefined") {
    return requestAnimationFrame(callback);
  }
  return setTimeout(callback, 16) as unknown as number;
}

function safeCancelAnimationFrame(id: number): void {
  if (typeof cancelAnimationFrame !== "undefined") {
    cancelAnimationFrame(id);
  } else {
    clearTimeout(id);
  }
}

export class ViewportController implements IViewportController {
  private readonly events = new TypedEventEmitter<ViewportControllerEvents>();
  private startTime: number;
  private endTime: number;
  private minFrequency: number | undefined;
  private maxFrequency: number | undefined;
  private frequencyScale: FrequencyScale | undefined;
  private totalDuration: number;
  private minDuration: number;
  private maxDuration: number;
  private followPlayback: FollowPlaybackMode;
  private smoothAnchor: number;
  private audioElement: HTMLAudioElement | undefined;
  private audioCleanup: Array<() => void> = [];
  private animationFrame: number | undefined;
  private boundViewers = new Map<ITimeBoundViewer, () => void>();
  private isBroadcasting = false;

  constructor(config: ViewportControllerConfig = {}) {
    this.totalDuration = Math.max(0.01, config.totalDuration ?? 10);
    this.minDuration = Math.max(0.001, config.minDuration ?? 0.05);
    this.maxDuration = Math.max(
      this.minDuration,
      config.maxDuration ?? Math.min(30, this.totalDuration),
    );
    this.followPlayback = config.followPlayback ?? "page";
    this.smoothAnchor = Math.max(0, Math.min(1, config.smoothAnchor ?? 0.5));
    this.minFrequency = config.minFrequency;
    this.maxFrequency = config.maxFrequency;
    this.frequencyScale = config.frequencyScale;

    const initialStart = config.startTime ?? 0;
    const initialEnd = config.endTime ?? Math.min(10, this.totalDuration);
    const clamped = clampViewportTimes(
      initialStart,
      initialEnd,
      this.totalDuration,
      this.minDuration,
      this.maxDuration,
    );
    this.startTime = clamped.startTime;
    this.endTime = clamped.endTime;

    if (config.audio) {
      this.attachAudio(config.audio);
    }
  }

  getViewport(): ViewportState {
    return {
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.endTime - this.startTime,
      totalDuration: this.totalDuration,
      minFrequency: this.minFrequency,
      maxFrequency: this.maxFrequency,
      frequencyScale: this.frequencyScale,
    };
  }

  setViewport(
    vp: Partial<{
      startTime: number | undefined;
      endTime: number | undefined;
      minFrequency: number | undefined;
      maxFrequency: number | undefined;
      frequencyScale: FrequencyScale | undefined;
    }>,
    source?: string | undefined,
  ): void {
    let changed = false;

    if (vp.startTime !== undefined || vp.endTime !== undefined) {
      const targetStart = Number.isFinite(vp.startTime)
        ? (vp.startTime as number)
        : this.startTime;
      const targetEnd = Number.isFinite(vp.endTime)
        ? (vp.endTime as number)
        : this.endTime;
      const clamped = clampViewportTimes(
        targetStart,
        targetEnd,
        this.totalDuration,
        this.minDuration,
        this.maxDuration,
      );

      if (
        Math.abs(clamped.startTime - this.startTime) >= 1e-6 ||
        Math.abs(clamped.endTime - this.endTime) >= 1e-6
      ) {
        this.startTime = clamped.startTime;
        this.endTime = clamped.endTime;
        changed = true;
      }
    }

    if (
      vp.minFrequency !== undefined &&
      (this.minFrequency === undefined ||
        Math.abs(this.minFrequency - vp.minFrequency) >= 1e-6)
    ) {
      this.minFrequency = vp.minFrequency;
      changed = true;
    }

    if (
      vp.maxFrequency !== undefined &&
      (this.maxFrequency === undefined ||
        Math.abs(this.maxFrequency - vp.maxFrequency) >= 1e-6)
    ) {
      this.maxFrequency = vp.maxFrequency;
      changed = true;
    }

    if (
      vp.frequencyScale !== undefined &&
      this.frequencyScale !== vp.frequencyScale
    ) {
      this.frequencyScale = vp.frequencyScale;
      changed = true;
    }

    if (changed) {
      this.broadcast(source);
    }
  }

  updateViewport(
    vp: Partial<{
      startTime: number | undefined;
      endTime: number | undefined;
      minFrequency: number | undefined;
      maxFrequency: number | undefined;
      frequencyScale: FrequencyScale | undefined;
    }>,
    source?: string | undefined,
  ): void {
    this.setViewport(vp, source);
  }

  zoom(factor: number, centerTime?: number, source?: string): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const duration = this.endTime - this.startTime;
    const center = Number.isFinite(centerTime)
      ? (centerTime as number)
      : (this.startTime + this.endTime) / 2;
    const targetDuration = Math.max(
      this.minDuration,
      Math.min(this.maxDuration, this.totalDuration, duration * factor),
    );

    if (Math.abs(targetDuration - duration) < 1e-9) return;

    const ratio = (center - this.startTime) / (duration || 1);
    const startTime = Math.max(
      0,
      Math.min(
        this.totalDuration - targetDuration,
        center - targetDuration * ratio,
      ),
    );

    this.setViewport(
      { startTime, endTime: startTime + targetDuration },
      source,
    );
  }

  pan(deltaSeconds: number, source?: string): void {
    if (!Number.isFinite(deltaSeconds)) return;
    const duration = this.endTime - this.startTime;
    const nextStart = Math.max(
      0,
      Math.min(this.totalDuration - duration, this.startTime + deltaSeconds),
    );
    this.setViewport(
      { startTime: nextStart, endTime: nextStart + duration },
      source,
    );
  }

  panTo(startTime: number, source?: string): void {
    if (!Number.isFinite(startTime)) return;
    const duration = this.endTime - this.startTime;
    const nextStart = Math.max(
      0,
      Math.min(this.totalDuration - duration, startTime),
    );
    this.setViewport(
      { startTime: nextStart, endTime: nextStart + duration },
      source,
    );
  }

  zoomFrequency(
    factor: number,
    centerFrequency?: number,
    source?: string,
  ): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const minFreq = this.minFrequency ?? 0;
    const maxFreq = this.maxFrequency ?? 20000;
    const currentSpan = maxFreq - minFreq;
    const minSpan = 10;
    const maxSpan = 48000;
    const targetSpan = Math.max(
      minSpan,
      Math.min(maxSpan, currentSpan * factor),
    );
    if (Math.abs(targetSpan - currentSpan) < 1e-9) return;

    const center = Number.isFinite(centerFrequency)
      ? (centerFrequency as number)
      : (minFreq + maxFreq) / 2;
    const ratio = currentSpan <= 0 ? 0.5 : (center - minFreq) / currentSpan;
    const newMin = Math.max(0, center - targetSpan * ratio);
    const newMax = newMin + targetSpan;

    this.setViewport(
      { minFrequency: newMin, maxFrequency: newMax },
      source,
    );
  }

  panFrequency(deltaHz: number, source?: string): void {
    if (!Number.isFinite(deltaHz) || deltaHz === 0) return;
    const minFreq = this.minFrequency ?? 0;
    const maxFreq = this.maxFrequency ?? 20000;
    const span = maxFreq - minFreq;
    const newMin = Math.max(0, minFreq + deltaHz);
    this.setViewport(
      { minFrequency: newMin, maxFrequency: newMin + span },
      source,
    );
  }

  getFollowPlayback(): FollowPlaybackMode {
    return this.followPlayback;
  }

  setFollowPlayback(mode: FollowPlaybackMode): void {
    if (this.followPlayback === mode) return;
    this.followPlayback = mode;
    this.events.emit("followchange", { mode });
    if (mode !== "off" && this.audioElement) {
      this.checkPlaybackFollow(this.audioElement.currentTime);
    }
  }

  setTotalDuration(totalDuration: number): void {
    if (!Number.isFinite(totalDuration) || totalDuration <= 0) return;
    this.totalDuration = Math.max(0.01, totalDuration);
    this.setViewport({ startTime: this.startTime, endTime: this.endTime });
  }

  attachAudio(audio: HTMLAudioElement): void {
    this.detachAudio();
    this.audioElement = audio;

    const onPlay = () => this.startPlaybackLoop();
    const onPause = () => this.stopPlaybackLoop();
    const onSeek = () => this.checkPlaybackFollow(audio.currentTime);

    audio.addEventListener("play", onPlay);
    audio.addEventListener("playing", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("seeking", onSeek);
    audio.addEventListener("seeked", onSeek);
    audio.addEventListener("timeupdate", onSeek);

    this.audioCleanup.push(() => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("playing", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("seeking", onSeek);
      audio.removeEventListener("seeked", onSeek);
      audio.removeEventListener("timeupdate", onSeek);
    });

    if (!audio.paused) this.startPlaybackLoop();
    this.checkPlaybackFollow(audio.currentTime);
  }

  detachAudio(): void {
    this.stopPlaybackLoop();
    for (const cleanup of this.audioCleanup) cleanup();
    this.audioCleanup = [];
    this.audioElement = undefined;
  }

  bind(viewer: ITimeBoundViewer): () => void {
    if (this.boundViewers.has(viewer)) {
      return this.boundViewers.get(viewer)!;
    }

    if (viewer.getDuration && this.totalDuration === 10) {
      const dur = viewer.getDuration();
      if (dur > 0) this.setTotalDuration(dur);
    }

    // Immediately push current controller viewport to viewer
    viewer.updateViewport({
      startTime: this.startTime,
      endTime: this.endTime,
      minFrequency: this.minFrequency,
      maxFrequency: this.maxFrequency,
      frequencyScale: this.frequencyScale,
    });

    // Listen to changes from the viewer and forward to controller
    const unlistenViewer = viewer.on("viewportchange", (event) => {
      if (this.isBroadcasting) return;
      const vp = event.viewport;
      if (vp) {
        this.setViewport(
          {
            startTime: vp.startTime,
            endTime: vp.endTime,
            minFrequency: vp.minFrequency,
            maxFrequency: vp.maxFrequency,
            frequencyScale: vp.frequencyScale,
          },
          "viewer",
        );
      }
    });

    const unbind = () => {
      unlistenViewer();
      this.boundViewers.delete(viewer);
    };

    this.boundViewers.set(viewer, unbind);
    return unbind;
  }

  unbind(viewer: ITimeBoundViewer): void {
    const unbind = this.boundViewers.get(viewer);
    if (unbind) unbind();
  }

  on<Name extends keyof ViewportControllerEvents>(
    name: Name,
    handler: (event: ViewportControllerEvents[Name]) => void,
  ): () => void {
    return this.events.on(name, handler);
  }

  destroy(): void {
    this.stopPlaybackLoop();
    this.detachAudio();
    for (const [_, unbind] of this.boundViewers) {
      unbind();
    }
    this.boundViewers.clear();
    this.events.clear();
  }

  private broadcast(source?: string): void {
    if (this.isBroadcasting) return;
    this.isBroadcasting = true;
    const viewport = this.getViewport();
    this.events.emit("change", { viewport, source });

    const snapshot = Array.from(this.boundViewers.keys());
    for (const viewer of snapshot) {
      if (this.boundViewers.has(viewer)) {
        viewer.updateViewport({
          startTime: this.startTime,
          endTime: this.endTime,
          minFrequency: this.minFrequency,
          maxFrequency: this.maxFrequency,
          frequencyScale: this.frequencyScale,
        });
      }
    }
    this.isBroadcasting = false;
  }

  private checkPlaybackFollow(currentTime: number): void {
    if (this.followPlayback === "off") return;
    const duration = this.endTime - this.startTime;

    if (this.followPlayback === "page") {
      // If playhead crosses right edge or moves before left edge
      if (currentTime >= this.endTime || currentTime < this.startTime) {
        const nextStart = Math.max(
          0,
          Math.min(this.totalDuration - duration, currentTime),
        );
        this.setViewport(
          { startTime: nextStart, endTime: nextStart + duration },
          "playback",
        );
      }
    } else if (this.followPlayback === "smooth") {
      // Center playhead or align to smoothAnchor ratio
      const targetStart = currentTime - duration * this.smoothAnchor;
      const nextStart = Math.max(
        0,
        Math.min(this.totalDuration - duration, targetStart),
      );
      this.setViewport(
        { startTime: nextStart, endTime: nextStart + duration },
        "playback",
      );
    }
  }

  private startPlaybackLoop(): void {
    if (this.animationFrame !== undefined) return;
    const tick = () => {
      if (this.audioElement && !this.audioElement.paused) {
        this.checkPlaybackFollow(this.audioElement.currentTime);
        this.animationFrame = safeRequestAnimationFrame(tick);
      } else {
        this.animationFrame = undefined;
      }
    };
    this.animationFrame = safeRequestAnimationFrame(tick);
  }

  private stopPlaybackLoop(): void {
    if (this.animationFrame !== undefined) {
      safeCancelAnimationFrame(this.animationFrame);
      this.animationFrame = undefined;
    }
  }
}

export function linkViewports(
  viewers: ITimeBoundViewer[],
  options: ViewportControllerConfig = {},
): { controller: ViewportController; unlink: () => void } {
  const controller = new ViewportController(options);
  const unbinds = viewers.map((v) => controller.bind(v));

  return {
    controller,
    unlink: () => {
      for (const unbind of unbinds) unbind();
      controller.destroy();
    },
  };
}

export type CustomViewportStore = {
  getViewport: () => {
    startTime: number;
    endTime: number;
    totalDuration?: number;
  };
  setViewport: (
    viewport: { startTime: number; endTime: number },
    source?: string,
  ) => void;
  subscribe: (
    callback: (viewport: { startTime: number; endTime: number }) => void,
  ) => () => void;
};

export function createCustomViewportController(
  store: CustomViewportStore,
): IViewportController {
  const events = new TypedEventEmitter<ViewportControllerEvents>();
  const boundViewers = new Set<ITimeBoundViewer>();
  let isBroadcasting = false;

  const getFullState = (): ViewportState => {
    const vp = store.getViewport();
    const duration = vp.endTime - vp.startTime;
    return {
      startTime: vp.startTime,
      endTime: vp.endTime,
      duration,
      totalDuration: vp.totalDuration ?? Math.max(vp.endTime, 10),
    };
  };

  const unsubscribe = store.subscribe((vp) => {
    if (isBroadcasting) return;
    const full = getFullState();
    events.emit("change", { viewport: full, source: "store" });
    for (const viewer of boundViewers) {
      viewer.updateViewport({ startTime: vp.startTime, endTime: vp.endTime });
    }
  });

  return {
    getViewport: getFullState,
    setViewport(vp, source) {
      const current = getFullState();
      const next = {
        startTime: vp.startTime ?? current.startTime,
        endTime: vp.endTime ?? current.endTime,
      };
      store.setViewport(next, source);
    },
    updateViewport(vp, source) {
      this.setViewport(vp, source);
    },
    bind(viewer) {
      boundViewers.add(viewer);
      const vp = getFullState();
      viewer.updateViewport({ startTime: vp.startTime, endTime: vp.endTime });

      const unlisten = viewer.on("viewportchange", (event) => {
        if (isBroadcasting) return;
        const v = event.viewport;
        if (
          v &&
          typeof v.startTime === "number" &&
          typeof v.endTime === "number"
        ) {
          isBroadcasting = true;
          store.setViewport(
            { startTime: v.startTime, endTime: v.endTime },
            "viewer",
          );
          isBroadcasting = false;
        }
      });

      return () => {
        unlisten();
        boundViewers.delete(viewer);
      };
    },
    unbind(viewer) {
      boundViewers.delete(viewer);
    },
    on(name, handler) {
      return events.on(name, handler);
    },
    destroy() {
      unsubscribe();
      boundViewers.clear();
      events.clear();
    },
  };
}
