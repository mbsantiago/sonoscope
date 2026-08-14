import type { AudioRange, AudioSource } from "../types";
import { type ByteStreamSource, type SeekableByteSource } from "./byte-source";
export declare class StreamingWavSource implements AudioSource {
  private readonly reader;
  private readonly info;
  private readonly seekable;
  readonly sampleRate: number;
  readonly duration: number;
  readonly channelCount: number;
  readonly id: string;
  private readonly decoded;
  private decodedUntilFrame;
  private readonly decodedRanges;
  private readonly pending;
  private readonly handlers;
  private isStreamDone;
  private requestedUntilFrame;
  private demandResolver;
  private constructor();
  static fromReader(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    initialChunks?: Uint8Array[],
    seekable?: SeekableByteSource,
    options?: {
      id?: string;
    },
  ): Promise<StreamingWavSource>;
  static fromByteSource(
    byteSource: ByteStreamSource,
    options?: {
      id?: string;
    },
  ): Promise<StreamingWavSource>;
  read(options: {
    channel: number;
    startTime: number;
    endTime: number;
  }): Float32Array | Promise<Float32Array>;
  private waitForRange;
  onRangeAvailable(handler: (range: AudioRange) => void): () => void;
  private waitForDemand;
  private requestFrames;
  private decodeSequentially;
  private processIncrementalChunk;
  private readSeekableRange;
  private resolveReadyPending;
  private addDecodedRange;
  private isRangeDecoded;
  private rejectPending;
  private emitRange;
}
//# sourceMappingURL=streaming-wav-source.d.ts.map
