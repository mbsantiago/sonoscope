export type Mp3FrameHeader = {
  version: number;
  layer: number;
  sampleRate: number;
  channelCount: number;
  bitrate: number;
  padding: number;
  samplesPerFrame: number;
  frameLength: number;
  hasCrc: boolean;
};
export type Mp3Info = {
  sampleRate: number;
  channelCount: number;
  duration: number;
  firstFrameOffset: number;
  isVbr: boolean;
  totalFrames?: number;
  totalBytes?: number;
};
export declare function parseId3Header(bytes: Uint8Array): {
  id3Size: number;
} | null;
export declare function parseMp3FrameHeader(
  bytes: Uint8Array,
  offset?: number,
): Mp3FrameHeader | null;
export declare function findNextMp3Frame(
  bytes: Uint8Array,
  startOffset?: number,
): {
  offset: number;
  header: Mp3FrameHeader;
} | null;
export declare function isMp3Bytes(bytes: Uint8Array): boolean;
export declare function parseXingHeader(
  bytes: Uint8Array,
  frameOffset: number,
  header: Mp3FrameHeader,
): {
  frameCount?: number;
  byteCount?: number;
  isVbr: boolean;
} | null;
export declare function parseMp3Info(
  bytes: Uint8Array,
  totalBytes?: number,
): Mp3Info;
//# sourceMappingURL=mp3.d.ts.map
