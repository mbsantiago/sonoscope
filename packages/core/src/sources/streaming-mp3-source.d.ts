import type { AudioRange, AudioSource } from "../types";
import { type ByteStreamSource } from "./byte-source";
import { type Mp3DecoderFactory } from "./webcodecs-mp3-decoder";
export declare class StreamingMp3Source implements AudioSource {
  private readonly reader;
  private initialChunks;
  readonly sampleRate: number;
  duration: number;
  readonly channelCount: number;
  readonly id: string;
  private decoded;
  private decodedFrameCount;
  private readonly decodedRanges;
  private readonly pending;
  private readonly handlers;
  private isStreamDone;
  private decoder;
  private requestedUntilFrame;
  private demandResolver;
  private constructor();
  static isSupported(): Promise<boolean>;
  static fromReader(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    initialChunks?: Uint8Array[],
    totalBytes?: number,
    options?: {
      id?: string;
      decoderFactory?: Mp3DecoderFactory;
    },
  ): Promise<StreamingMp3Source>;
  static fromByteSource(
    byteSource: ByteStreamSource,
    options?: {
      id?: string;
      decoderFactory?: Mp3DecoderFactory;
    },
  ): Promise<StreamingMp3Source>;
  read(options: {
    channel: number;
    startTime: number;
    endTime: number;
  }): Float32Array | Promise<Float32Array>;
  onRangeAvailable(handler: (range: AudioRange) => void): () => void;
  private waitForRange;
  private waitForDemand;
  private requestFrames;
  private initAndDecode;
  private decodeSequentially;
  private pendingBytes;
  private processBuffer;
  private appendPcm;
  private ensureCapacity;
  private addDecodedRange;
  private isRangeDecoded;
  private resolveReadyPending;
  private rejectPending;
  private emitRange;
}
//# sourceMappingURL=streaming-mp3-source.d.ts.map
