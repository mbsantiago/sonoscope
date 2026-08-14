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
export declare function now(): number;
export declare class PerformanceProfiler {
  private readonly clock;
  private readonly entries;
  constructor(clock?: () => number);
  record(
    name: string,
    start: number,
    duration: number,
    detail?: PerformanceDetail,
  ): void;
  measure<T>(
    name: string,
    detail: PerformanceDetail | undefined,
    fn: () => T,
  ): T;
  measureAsync<T>(
    name: string,
    detail: PerformanceDetail | undefined,
    fn: () => Promise<T>,
  ): Promise<T>;
  measures(): PerformanceMeasure[];
}
export declare class FrameMeter {
  private readonly sampleFrames;
  private lastTime;
  private frames;
  private elapsedMs;
  private workMs;
  private maxWorkMs;
  private minFrameMs;
  private maxFrameMs;
  constructor(sampleFrames?: number);
  reset(): void;
  tick(time: number, workMs?: number): FrameStats | undefined;
}
//# sourceMappingURL=performance.d.ts.map
