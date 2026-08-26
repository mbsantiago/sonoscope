import type {
  ComputeTileRequest,
  SpectrogramComputeBackend,
  SpectrogramMatrix,
} from "../model";
import { computeStftMatrix } from "./stft";

export type { ComputeTileRequest, SpectrogramComputeBackend } from "../model";

export class MainThreadComputeBackend implements SpectrogramComputeBackend {
  async computeTile(request: ComputeTileRequest): Promise<SpectrogramMatrix> {
    const samples = await request.source.read({
      channel: request.channel,
      startTime: request.timeStart,
      endTime: request.timeEnd,
    });

    return computeStftMatrix(samples, {
      channel: request.channel,
      timeStart: request.timeStart,
      sampleRate: request.source.sampleRate,
      stft: request.stft,
    });
  }
}
