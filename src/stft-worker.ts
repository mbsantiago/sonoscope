import { computeStftMatrix } from './stft';
import type { SpectrogramMatrix, StftConfig } from './types';

type WorkerGlobal = {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

const workerSelf = self as unknown as WorkerGlobal;

type WorkerRequest = {
  id: number;
  channel: number;
  timeStart: number;
  sampleRate: number;
  stft: StftConfig;
  samples: Float32Array;
};

function transfer(buffer: ArrayBufferLike): Transferable {
  return buffer as ArrayBuffer;
}

function matrixTransferables(matrix: SpectrogramMatrix): Transferable[] {
  return [
    transfer(matrix.times.buffer),
    transfer(matrix.frequencies.buffer),
    transfer(matrix.magnitude.buffer),
    ...(matrix.power ? [transfer(matrix.power.buffer)] : []),
    ...(matrix.db ? [transfer(matrix.db.buffer)] : []),
    ...(matrix.normalized ? [transfer(matrix.normalized.buffer)] : []),
  ];
}

workerSelf.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const start = performance.now();
  try {
    const request = event.data;
    const matrix = computeStftMatrix(request.samples, {
      channel: request.channel,
      timeStart: request.timeStart,
      sampleRate: request.sampleRate,
      stft: request.stft,
    });
    const computeDuration = performance.now() - start;
    workerSelf.postMessage({ id: request.id, matrix, computeDuration }, matrixTransferables(matrix));
  } catch (error) {
    workerSelf.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : String(error) });
  }
};
