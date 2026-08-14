import type {
  AudioSource,
  ResolvedSpectrogramConfig,
  SpectrogramConfig,
} from "./types";
export declare function resolveConfig(
  input: SpectrogramConfig & {
    source: AudioSource;
  },
): ResolvedSpectrogramConfig;
export declare function stableHash(value: unknown): string;
//# sourceMappingURL=config.d.ts.map
