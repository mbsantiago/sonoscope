export type PerformanceDetail = Record<string, string | number | boolean>;

export type PerformanceMeasure = {
  name: string;
  start: number;
  duration: number;
  detail?: PerformanceDetail;
};

export type FrameStats = {
  frames: number;
  elapsedMs: number;
  fps: number;
  minFrameMs: number;
  maxFrameMs: number;
  averageFrameMs: number;
  maxWorkMs?: number;
  averageWorkMs?: number;
};

export function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

export class PerformanceProfiler {
  private readonly entries: PerformanceMeasure[] = [];

  constructor(private readonly clock: () => number = now) {}

  record(
    name: string,
    start: number,
    duration: number,
    detail?: PerformanceDetail,
  ): void {
    this.entries.push({ name, start, duration, ...(detail ? { detail } : {}) });
  }

  measure<T>(
    name: string,
    detail: PerformanceDetail | undefined,
    fn: () => T,
  ): T {
    const start = this.clock();
    try {
      return fn();
    } finally {
      this.record(name, start, this.clock() - start, detail);
    }
  }

  async measureAsync<T>(
    name: string,
    detail: PerformanceDetail | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    const start = this.clock();
    try {
      return await fn();
    } finally {
      this.record(name, start, this.clock() - start, detail);
    }
  }

  measures(): PerformanceMeasure[] {
    return this.entries.map((entry) => ({
      ...entry,
      ...(entry.detail ? { detail: { ...entry.detail } } : {}),
    }));
  }
}

export class FrameMeter {
  private lastTime: number | undefined;
  private frames = 0;
  private elapsedMs = 0;
  private workMs = 0;
  private maxWorkMs = 0;
  private minFrameMs = Number.POSITIVE_INFINITY;
  private maxFrameMs = 0;

  constructor(private readonly sampleFrames = 30) {}

  reset(): void {
    this.lastTime = undefined;
    this.frames = 0;
    this.elapsedMs = 0;
    this.workMs = 0;
    this.maxWorkMs = 0;
    this.minFrameMs = Number.POSITIVE_INFINITY;
    this.maxFrameMs = 0;
  }

  tick(time: number, workMs = 0): FrameStats | undefined {
    if (this.lastTime === undefined) {
      this.lastTime = time;
      return undefined;
    }
    const delta = Math.max(0, time - this.lastTime);
    this.lastTime = time;
    this.frames += 1;
    this.elapsedMs += delta;
    this.workMs += workMs;
    this.maxWorkMs = Math.max(this.maxWorkMs, workMs);
    this.minFrameMs = Math.min(this.minFrameMs, delta);
    this.maxFrameMs = Math.max(this.maxFrameMs, delta);
    if (this.frames < this.sampleFrames || this.elapsedMs <= 0)
      return undefined;
    const stats = {
      frames: this.frames,
      elapsedMs: this.elapsedMs,
      fps: (this.frames / this.elapsedMs) * 1000,
      minFrameMs: this.minFrameMs,
      maxFrameMs: this.maxFrameMs,
      averageFrameMs: this.elapsedMs / this.frames,
      maxWorkMs: this.maxWorkMs,
      averageWorkMs: this.workMs / this.frames,
    };
    this.reset();
    this.lastTime = time;
    return stats;
  }
}
