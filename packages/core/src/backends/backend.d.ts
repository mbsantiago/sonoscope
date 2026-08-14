import type { PerformanceProfiler } from "../performance";
import type { AudioSource, SpectrogramMatrix, StftConfig } from "../types";
export type ComputeTileRequest = {
  source: AudioSource;
  channel: number;
  timeStart: number;
  timeEnd: number;
  stft: StftConfig;
  profile?: PerformanceProfiler;
};
export interface SpectrogramComputeBackend {
  computeTile(request: ComputeTileRequest): Promise<SpectrogramMatrix>;
  destroy?(): void;
}
export declare class MainThreadComputeBackend
  implements SpectrogramComputeBackend
{
  computeTile(request: ComputeTileRequest): Promise<SpectrogramMatrix>;
}
//# sourceMappingURL=backend.d.ts.map
