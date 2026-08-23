import type {
  ComputeTileRequest,
  SpectrogramComputeBackend,
  SpectrogramMatrix,
} from "../model";
import { computeStftMatrix } from "./stft";

export type { ComputeTileRequest, SpectrogramComputeBackend } from "../model";

export class MainThreadComputeBackend implements SpectrogramComputeBackend {
  async computeTile(request: ComputeTileRequest): Promise<SpectrogramMatrix> {
    const compute = async () => {
      const samples = request.profile
        ? await request.profile.measureAsync(
            "tile.source.read",
            {
              channel: request.channel,
              timeStart: request.timeStart,
              timeEnd: request.timeEnd,
            },
            async () =>
              await request.source.read({
                channel: request.channel,
                startTime: request.timeStart,
                endTime: request.timeEnd,
              }),
          )
        : await request.source.read({
            channel: request.channel,
            startTime: request.timeStart,
            endTime: request.timeEnd,
          });

      return request.profile
        ? request.profile.measure(
            "tile.stft.compute",
            {
              channel: request.channel,
              samples: samples.length,
              fftSize: request.stft.fftSize,
            },
            () =>
              computeStftMatrix(samples, {
                channel: request.channel,
                timeStart: request.timeStart,
                sampleRate: request.source.sampleRate,
                stft: request.stft,
              }),
          )
        : computeStftMatrix(samples, {
            channel: request.channel,
            timeStart: request.timeStart,
            sampleRate: request.source.sampleRate,
            stft: request.stft,
          });
    };

    return request.profile
      ? request.profile.measureAsync(
          "tile.total",
          {
            channel: request.channel,
            timeStart: request.timeStart,
            timeEnd: request.timeEnd,
          },
          compute,
        )
      : compute();
  }
}
