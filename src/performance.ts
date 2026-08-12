export type PerformanceDetail = Record<string, string | number | boolean>;

export type PerformanceMeasure = {
  name: string;
  start: number;
  duration: number;
  detail?: PerformanceDetail;
};

export function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

export class PerformanceProfiler {
  private readonly entries: PerformanceMeasure[] = [];

  constructor(private readonly clock: () => number = now) {}

  record(name: string, start: number, duration: number, detail?: PerformanceDetail): void {
    this.entries.push({ name, start, duration, ...(detail ? { detail } : {}) });
  }

  measure<T>(name: string, detail: PerformanceDetail | undefined, fn: () => T): T {
    const start = this.clock();
    try {
      return fn();
    } finally {
      this.record(name, start, this.clock() - start, detail);
    }
  }

  async measureAsync<T>(name: string, detail: PerformanceDetail | undefined, fn: () => Promise<T>): Promise<T> {
    const start = this.clock();
    try {
      return await fn();
    } finally {
      this.record(name, start, this.clock() - start, detail);
    }
  }

  measures(): PerformanceMeasure[] {
    return this.entries.map((entry) => ({ ...entry, ...(entry.detail ? { detail: { ...entry.detail } } : {}) }));
  }
}
