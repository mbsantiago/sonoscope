import { computeStftMatrix } from './stft';
import type { AudioSource, SpectrogramMatrix, StftConfig } from './types';

export type ComputeTileRequest = {
  source: AudioSource;
  channel: number;
  timeStart: number;
  timeEnd: number;
  stft: StftConfig;
};

export interface SpectrogramComputeBackend {
  computeTile(request: ComputeTileRequest): Promise<SpectrogramMatrix>;
  destroy?(): void;
}

export class MainThreadComputeBackend implements SpectrogramComputeBackend {
  async computeTile(request: ComputeTileRequest): Promise<SpectrogramMatrix> {
    const samples = await request.source.read({ channel: request.channel, startTime: request.timeStart, endTime: request.timeEnd });
    return computeStftMatrix(samples, {
      channel: request.channel,
      timeStart: request.timeStart,
      sampleRate: request.source.sampleRate,
      stft: request.stft,
    });
  }
}
