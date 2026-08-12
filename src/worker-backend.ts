import type { ComputeTileRequest, SpectrogramComputeBackend } from './backend';
import type { PerformanceProfiler } from './performance';
import type { SpectrogramMatrix, StftConfig } from './types';

export type SpectrogramWorkerLike = {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
};

export type WorkerComputeBackendOptions = {
  workerCount?: number;
  workerUrl?: URL | string;
  createWorker?: () => SpectrogramWorkerLike;
};

type WorkerRequest = {
  id: number;
  channel: number;
  timeStart: number;
  sampleRate: number;
  stft: StftConfig;
  samples: Float32Array;
};

type WorkerResponse = { id: number; matrix: SpectrogramMatrix; computeDuration: number } | { id: number; error: string };

type Job = {
  id: number;
  request: ComputeTileRequest;
  queuedAt: number;
  resolve: (matrix: SpectrogramMatrix) => void;
  reject: (error: Error) => void;
};

type WorkerSlot = {
  worker: SpectrogramWorkerLike;
  job: Job | undefined;
};

export function createDefaultWorker(workerUrl: URL | string = new URL('./stft-worker.ts', import.meta.url)): SpectrogramWorkerLike {
  return new Worker(workerUrl, { type: 'module' });
}

function defaultWorkerCount(): number {
  const cores = globalThis.navigator?.hardwareConcurrency ?? 2;
  return Math.max(1, Math.min(4, cores - 1 || 1));
}

export class WorkerComputeBackend implements SpectrogramComputeBackend {
  private nextId = 1;
  private destroyed = false;
  private readonly queue: Job[] = [];
  private readonly slots: WorkerSlot[];

  constructor(options: WorkerComputeBackendOptions = {}) {
    const createWorker = options.createWorker ?? (() => createDefaultWorker(options.workerUrl));
    const count = Math.max(1, options.workerCount ?? defaultWorkerCount());
    this.slots = Array.from({ length: count }, () => {
      const slot: WorkerSlot = { worker: createWorker(), job: undefined };
      slot.worker.onmessage = (event) => this.handleMessage(slot, event.data as WorkerResponse);
      slot.worker.onerror = (event) => this.handleWorkerError(slot, new Error(event.message || 'Worker compute failed'));
      return slot;
    });
  }

  computeTile(request: ComputeTileRequest): Promise<SpectrogramMatrix> {
    if (this.destroyed) return Promise.reject(new Error('WorkerComputeBackend has been destroyed'));

    const enqueue = () =>
      new Promise<SpectrogramMatrix>((resolve, reject) => {
        this.queue.push({ id: this.nextId++, request, queuedAt: performance.now(), resolve, reject });
        void this.pump();
      });

    return request.profile
      ? request.profile.measureAsync('tile.total', { channel: request.channel, timeStart: request.timeStart, timeEnd: request.timeEnd }, enqueue)
      : enqueue();
  }

  destroy(): void {
    this.destroyed = true;
    const error = new Error('WorkerComputeBackend has been destroyed');
    for (const job of this.queue.splice(0)) job.reject(error);
    for (const slot of this.slots) {
      if (slot.job) slot.job.reject(error);
      slot.job = undefined;
      slot.worker.terminate();
    }
  }

  private async pump(): Promise<void> {
    if (this.destroyed) return;

    for (const slot of this.slots) {
      if (slot.job) continue;
      const job = this.queue.shift();
      if (!job) return;
      slot.job = job;
      await this.startJob(slot, job);
    }
  }

  private async startJob(slot: WorkerSlot, job: Job): Promise<void> {
    const profile = job.request.profile;
    const start = performance.now();
    profile?.record('tile.queue.wait', job.queuedAt, start - job.queuedAt, { channel: job.request.channel });

    try {
      const samples = await readSamples(job.request, profile);
      if (this.destroyed || slot.job !== job) return;
      const message: WorkerRequest = {
        id: job.id,
        channel: job.request.channel,
        timeStart: job.request.timeStart,
        sampleRate: job.request.source.sampleRate,
        stft: job.request.stft,
        samples,
      };
      slot.worker.postMessage(message, [samples.buffer as ArrayBuffer]);
    } catch (error) {
      if (slot.job === job) slot.job = undefined;
      job.reject(error instanceof Error ? error : new Error(String(error)));
      void this.pump();
    }
  }

  private handleMessage(slot: WorkerSlot, response: WorkerResponse): void {
    const job = slot.job;
    if (!job || job.id !== response.id) return;

    slot.job = undefined;
    if ('error' in response) {
      job.reject(new Error(response.error));
    } else {
      job.request.profile?.record('tile.stft.compute', performance.now() - response.computeDuration, response.computeDuration, {
        channel: job.request.channel,
        fftSize: job.request.stft.fftSize,
      });
      job.resolve(response.matrix);
    }
    void this.pump();
  }

  private handleWorkerError(slot: WorkerSlot, error: Error): void {
    const job = slot.job;
    slot.job = undefined;
    job?.reject(error);
    void this.pump();
  }
}

async function readSamples(request: ComputeTileRequest, profile: PerformanceProfiler | undefined): Promise<Float32Array> {
  const read = () => Promise.resolve(request.source.read({ channel: request.channel, startTime: request.timeStart, endTime: request.timeEnd }));
  return profile
    ? profile.measureAsync('tile.source.read', { channel: request.channel, timeStart: request.timeStart, timeEnd: request.timeEnd }, read)
    : read();
}
