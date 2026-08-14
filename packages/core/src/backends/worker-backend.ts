import type { PerformanceProfiler } from "../performance";
import type { SpectrogramMatrix, StftConfig } from "../types";
import type { ComputeTileRequest, SpectrogramComputeBackend } from "./backend";

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

type WorkerResponse =
  | { id: number; matrix: SpectrogramMatrix; computeDuration: number }
  | { id: number; error: string };

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

function getStftWorkerScript(): string {
  return `
function createWindow(name, size) {
  const window = new Float32Array(size);
  for (let n = 0; n < size; n++) {
    if (name === "rectangular") {
      window[n] = 1;
    } else if (name === "hann") {
      window[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (size - 1)));
    } else if (name === "hamming") {
      window[n] = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (size - 1));
    } else {
      window[n] = 0.42 - 0.5 * Math.cos((2 * Math.PI * n) / (size - 1)) + 0.08 * Math.cos((4 * Math.PI * n) / (size - 1));
    }
  }
  return window;
}

function fftMagnitudes(realInput) {
  const n = realInput.length;
  const real = new Float64Array(realInput);
  const imag = new Float64Array(n);

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = real[i]; real[i] = real[j]; real[j] = tr;
      const ti = imag[i]; imag[i] = imag[j]; imag[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wLenReal = Math.cos(angle);
    const wLenImag = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let wReal = 1;
      let wImag = 0;
      for (let j = 0; j < len / 2; j++) {
        const oddIdx = i + j + len / 2;
        const evenIdx = i + j;
        const oddReal = real[oddIdx] * wReal - imag[oddIdx] * wImag;
        const oddImag = real[oddIdx] * wImag + imag[oddIdx] * wReal;
        real[oddIdx] = real[evenIdx] - oddReal;
        imag[oddIdx] = evenImag - oddImag;
        real[evenIdx] += oddReal;
        imag[evenIdx] += oddImag;
        const nextReal = wReal * wLenReal - wImag * wLenImag;
        wImag = wReal * wLenImag + wImag * wLenReal;
        wReal = nextReal;
      }
    }
  }

  const out = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    out[i] = Math.hypot(real[i], imag[i]) / n;
  }
  return out;
}

self.onmessage = (event) => {
  const start = performance.now();
  const req = event.data;
  try {
    const { channel, timeStart, sampleRate, stft, samples } = req;
    const frameCount = Math.max(0, Math.floor((samples.length - stft.windowSize) / stft.hopSize) + 1);
    const binCount = Math.floor(stft.fftSize / 2);
    const window = createWindow(stft.window, stft.windowSize);
    const magnitude = new Float32Array(frameCount * binCount);
    const power = new Float32Array(frameCount * binCount);
    const db = new Float32Array(frameCount * binCount);
    const frame = new Float32Array(stft.fftSize);

    for (let f = 0; f < frameCount; f++) {
      frame.fill(0);
      const offset = f * stft.hopSize;
      const copyLen = Math.min(stft.windowSize, stft.fftSize);
      for (let i = 0; i < copyLen; i++) {
        frame[i] = samples[offset + i] * window[i];
      }
      const mags = fftMagnitudes(frame);
      const magOffset = f * binCount;
      for (let b = 0; b < binCount; b++) {
        const m = mags[b];
        magnitude[magOffset + b] = m;
        power[magOffset + b] = m * m;
        db[magOffset + b] = 20 * Math.log10(Math.max(1e-12, m));
      }
    }

    const times = new Float32Array(frameCount);
    for (let i = 0; i < frameCount; i++) {
      times[i] = timeStart + (i * stft.hopSize) / sampleRate;
    }
    const frequencies = new Float32Array(binCount);
    for (let i = 0; i < binCount; i++) {
      frequencies[i] = (i * sampleRate) / stft.fftSize;
    }

    const matrix = {
      channel,
      timeStart,
      timeEnd: timeStart + samples.length / sampleRate,
      frameStart: Math.round((timeStart * sampleRate) / stft.hopSize),
      frameCount,
      binCount,
      sampleRate,
      times,
      frequencies,
      magnitude,
      power,
      db,
    };

    const computeDuration = performance.now() - start;
    self.postMessage(
      { id: req.id, matrix, computeDuration },
      [times.buffer, frequencies.buffer, magnitude.buffer, power.buffer, db.buffer]
    );
  } catch (error) {
    self.postMessage({
      id: req.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
`;
}

export function createDefaultWorker(
  workerUrl?: URL | string,
): SpectrogramWorkerLike {
  if (workerUrl) {
    return new Worker(workerUrl, { type: "module" });
  }
  if (
    typeof Blob !== "undefined" &&
    typeof URL?.createObjectURL === "function"
  ) {
    const blob = new Blob([getStftWorkerScript()], {
      type: "application/javascript",
    });
    const blobUrl = URL.createObjectURL(blob);
    return new Worker(blobUrl);
  }
  return new Worker(new URL("./stft-worker.ts", import.meta.url), {
    type: "module",
  });
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
    const createWorker =
      options.createWorker ?? (() => createDefaultWorker(options.workerUrl));
    const count = Math.max(1, options.workerCount ?? defaultWorkerCount());
    this.slots = Array.from({ length: count }, () => {
      const slot: WorkerSlot = { worker: createWorker(), job: undefined };
      slot.worker.onmessage = (event) =>
        this.handleMessage(slot, event.data as WorkerResponse);
      slot.worker.onerror = (event: ErrorEvent) => {
        const message =
          event.message ||
          (event.error instanceof Error ? event.error.message : "") ||
          "Worker compute failed";
        this.handleWorkerError(slot, new Error(message));
      };
      return slot;
    });
  }

  computeTile(request: ComputeTileRequest): Promise<SpectrogramMatrix> {
    if (this.destroyed)
      return Promise.reject(
        new Error("WorkerComputeBackend has been destroyed"),
      );

    const enqueue = () =>
      new Promise<SpectrogramMatrix>((resolve, reject) => {
        this.queue.push({
          id: this.nextId++,
          request,
          queuedAt: performance.now(),
          resolve,
          reject,
        });
        void this.pump();
      });

    return request.profile
      ? request.profile.measureAsync(
          "tile.total",
          {
            channel: request.channel,
            timeStart: request.timeStart,
            timeEnd: request.timeEnd,
          },
          enqueue,
        )
      : enqueue();
  }

  destroy(): void {
    this.destroyed = true;
    const error = new Error("WorkerComputeBackend has been destroyed");
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
    profile?.record("tile.queue.wait", job.queuedAt, start - job.queuedAt, {
      channel: job.request.channel,
    });

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

      const canTransfer =
        samples.byteOffset === 0 &&
        samples.buffer &&
        samples.buffer.byteLength === samples.byteLength;
      const transferList = canTransfer ? [samples.buffer as ArrayBuffer] : [];

      slot.worker.postMessage(message, transferList);
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
    if ("error" in response) {
      job.reject(new Error(response.error));
    } else {
      job.request.profile?.record(
        "tile.stft.compute",
        performance.now() - response.computeDuration,
        response.computeDuration,
        {
          channel: job.request.channel,
          fftSize: job.request.stft.fftSize,
        },
      );
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

async function readSamples(
  request: ComputeTileRequest,
  profile: PerformanceProfiler | undefined,
): Promise<Float32Array> {
  const readOptions = {
    channel: request.channel,
    startTime: request.timeStart,
    endTime: request.timeEnd,
  };
  return profile
    ? await profile.measureAsync(
        "tile.source.read",
        {
          channel: request.channel,
          timeStart: request.timeStart,
          timeEnd: request.timeEnd,
        },
        async () => await request.source.read(readOptions),
      )
    : await request.source.read(readOptions);
}
