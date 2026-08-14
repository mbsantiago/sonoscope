export interface Mp3Decoder {
  decode(chunk: Uint8Array, timestampUs: number): Promise<Float32Array[]>;
  flush(): Promise<Float32Array[]>;
  close(): void;
}
export type Mp3DecoderConfig = {
  sampleRate: number;
  channelCount: number;
  onOutput?: (pcmChannels: Float32Array[]) => void;
};
export type Mp3DecoderFactory = (
  config: Mp3DecoderConfig,
) => Promise<Mp3Decoder>;
export declare function isWebCodecsMp3Supported(): Promise<boolean>;
export declare function createWebCodecsMp3Decoder(
  config: Mp3DecoderConfig,
): Promise<Mp3Decoder>;
export declare function mergeChannelChunks(
  chunks: Float32Array[][],
  channelCount: number,
): Float32Array[];
//# sourceMappingURL=webcodecs-mp3-decoder.d.ts.map
