import type { AudioSource } from "../types";
export declare class DecodedAudioSource implements AudioSource {
  private readonly buffer;
  readonly id: string;
  readonly sampleRate: number;
  readonly duration: number;
  readonly channelCount: number;
  constructor(buffer: AudioBuffer, id?: string);
  static fromUrl(
    url: string,
    options?:
      | AudioContextLike
      | {
          audioContext?: AudioContextLike;
          sampleRate?: number;
        },
  ): Promise<DecodedAudioSource>;
  read(options: {
    channel: number;
    startTime: number;
    endTime: number;
  }): Float32Array;
}
export declare function createAudioSourceFromUrl(
  url: string,
  options?:
    | AudioContextLike
    | {
        audioContext?: AudioContextLike;
        sampleRate?: number;
      },
): Promise<AudioSource>;
export type AudioContextLike = {
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
};
//# sourceMappingURL=source.d.ts.map
