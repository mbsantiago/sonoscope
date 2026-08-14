export type WavInfo = {
  format: number;
  channelCount: number;
  sampleRate: number;
  bitsPerSample: number;
  blockAlign: number;
  dataOffset: number;
  dataSize: number;
  duration: number;
};
export declare function isWavBytes(bytes: Uint8Array): boolean;
export declare function parseWavHeader(bytes: Uint8Array): WavInfo;
export declare function wavTimeToByteRange(
  info: WavInfo,
  startTime: number,
  endTime: number,
): {
  start: number;
  end: number;
};
export declare function decodeWavPcm(
  bytes: Uint8Array,
  info: WavInfo,
  byteOffset?: number,
  target?: Float32Array[],
  targetOffset?: number,
): Float32Array[];
//# sourceMappingURL=wav.d.ts.map
