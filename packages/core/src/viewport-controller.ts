import { clampViewportTimes } from "./config";
import { TypedEventEmitter } from "./events";

export type FollowPlaybackMode = "page" | "smooth" | "off";

export type ViewportControllerConfig = {
  startTime?: number | undefined;
  endTime?: number | undefined;
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
};

export type ViewportControllerEvents = {
  change: { viewport: ViewportState; source?: string | undefined };
  followchange: { mode: FollowPlaybackMode };
};

export interface ITimeBoundViewer {
  getViewport(): { startTime: number; endTime: number };
  updateViewport(vp: Partial<{ startTime: number; endTime: number }>): void;
  on(
    event: "viewportchange",
    handler: (event: {
      viewport: { startTime: number; endTime: number };
    }) => void,
  ): () => void;
  getDuration?(): number;
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

export class ViewportController {
  private readonly events = new TypedEventEmitter<ViewportControllerEvents>();
  private startTime: number;
  private endTime: number;
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
    this.followPlayback = config.followPlayback ?? "off";
    this.smoothAnchor = Math.max(0, Math.min(1, config.smoothAnchor ?? 0.5));

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
    };
  }

  setViewport(
    vp: Partial<{ startTime: number; endTime: number }>,
    source?: string,
  ): void {
    const targetStart = vp.startTime ?? this.startTime;
    const targetEnd = vp.endTime ?? this.endTime;
    const clamped = clampViewportTimes(
      targetStart,
      targetEnd,
      this.totalDuration,
      this.minDuration,
      this.maxDuration,
    );

    if (
      Math.abs(clamped.startTime - this.startTime) < 1e-6 &&
      Math.abs(clamped.endTime - this.endTime) < 1e-6
    ) {
      return;
    }

    this.startTime = clamped.startTime;
    this.endTime = clamped.endTime;
    this.broadcast(source);
  }

  updateViewport(
    vp: Partial<{ startTime: number; endTime: number }>,
    source?: string,
  ): void {
    this.setViewport(vp, source);
  }

  zoom(factor: number, centerTime?: number, source?: string): void {
    const duration = this.endTime - this.startTime;
    const center = centerTime ?? (this.startTime + this.endTime) / 2;
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
    audio.addEventListener("pause", onPause);
    audio.addEventListener("seeked", onSeek);
    audio.addEventListener("timeupdate", onSeek);

    this.audioCleanup.push(() => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
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
    });

    // Listen to changes from the viewer and forward to controller
    const unlistenViewer = viewer.on("viewportchange", (event) => {
      if (this.isBroadcasting) return;
      const vp = event.viewport;
      if (
        vp &&
        typeof vp.startTime === "number" &&
        typeof vp.endTime === "number"
      ) {
        this.setViewport(
          { startTime: vp.startTime, endTime: vp.endTime },
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
    this.isBroadcasting = true;
    const viewport = this.getViewport();
    this.events.emit("change", { viewport, source });

    for (const [viewer] of this.boundViewers) {
      viewer.updateViewport({
        startTime: this.startTime,
        endTime: this.endTime,
      });
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
