import type { AudioRange, AudioSource } from "../types";
import {
  type ByteStreamSource,
  concatChunks,
  isSeekableByteSource,
  type SeekableByteSource,
} from "./byte-source";
import {
  decodeWavPcm,
  parseWavHeader,
  type WavInfo,
  wavTimeToByteRange,
} from "./wav";

type PendingRead = {
  channel: number;
  startFrame: number;
  endFrame: number;
  resolve: (samples: Float32Array) => void;
  reject: (error: Error) => void;
};

type DecodedRange = { startFrame: number; endFrame: number };

const HEADER_READ_LIMIT = 4096;

export class StreamingWavSource implements AudioSource {
  readonly sampleRate: number;
  readonly duration: number;
  readonly channelCount: number;
  readonly id: string;
  private readonly decoded: Float32Array[];
  private decodedUntilFrame = 0;
  private readonly decodedRanges: DecodedRange[] = [];
  private readonly pending: PendingRead[] = [];
  private readonly handlers = new Set<(range: AudioRange) => void>();
  private isStreamDone = false;

  private requestedUntilFrame = 0;
  private demandResolver: (() => void) | undefined;

  private constructor(
    private readonly reader: ReadableStreamDefaultReader<Uint8Array>,
    private readonly info: WavInfo,
    private readonly seekable: SeekableByteSource | undefined,
    initialDataBytes: Uint8Array | undefined,
    options?: { id?: string },
  ) {
    this.sampleRate = info.sampleRate;
    this.duration = info.duration;
    this.channelCount = info.channelCount;
    this.id =
      options?.id ??
      `streaming-wav:${info.sampleRate}:${info.dataSize}:${info.channelCount}`;
    this.decoded = Array.from(
      { length: info.channelCount },
      () => new Float32Array(Math.floor(info.dataSize / info.blockAlign)),
    );

    this.requestedUntilFrame = Math.max(
      1024 * 10,
      Math.ceil(Math.min(30, info.duration) * info.sampleRate),
    );

    void this.decodeSequentially(initialDataBytes).catch((error) =>
      this.rejectPending(
        error instanceof Error ? error : new Error(String(error)),
      ),
    );
  }

  static async fromReader(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    initialChunks: Uint8Array[] = [],
    seekable?: SeekableByteSource,
    options?: { id?: string },
  ): Promise<StreamingWavSource> {
    const chunks: Uint8Array[] = [...initialChunks];
    let total = chunks.reduce((acc, c) => acc + c.length, 0);

    while (total < HEADER_READ_LIMIT) {
      if (chunks.length > 0) {
        try {
          const headerBytes = concatChunks(chunks);
          const info = parseWavHeader(headerBytes);
          const initialDataBytes =
            headerBytes.length > info.dataOffset
              ? headerBytes.subarray(info.dataOffset)
              : undefined;
          return new StreamingWavSource(
            reader,
            info,
            seekable,
            initialDataBytes,
            options,
          );
        } catch (error) {
          if (error instanceof Error && !shouldContinueHeaderRead(error)) {
            reader.releaseLock();
            throw error;
          }
        }
      }

      const result = await reader.read();
      if (result.done) break;
      chunks.push(result.value);
      total += result.value.length;
    }

    try {
      const headerBytes = concatChunks(chunks);
      const info = parseWavHeader(headerBytes);
      const initialDataBytes =
        headerBytes.length > info.dataOffset
          ? headerBytes.subarray(info.dataOffset)
          : undefined;
      return new StreamingWavSource(
        reader,
        info,
        seekable,
        initialDataBytes,
        options,
      );
    } catch (error) {
      reader.releaseLock();
      throw error;
    }
  }

  static async fromByteSource(
    byteSource: ByteStreamSource,
    options?: { id?: string },
  ): Promise<StreamingWavSource> {
    const reader = byteSource.stream().getReader();
    return StreamingWavSource.fromReader(
      reader,
      [],
      isSeekableByteSource(byteSource) ? byteSource : undefined,
      options,
    );
  }

  read(options: {
    channel: number;
    startTime: number;
    endTime: number;
  }): Float32Array | Promise<Float32Array> {
    if (options.channel < 0 || options.channel >= this.channelCount)
      throw new Error(`Invalid channel ${options.channel}`);
    const channelData = this.decoded[options.channel];
    if (!channelData) throw new Error(`Channel ${options.channel} not found`);
    const startFrame = Math.max(
      0,
      Math.floor(options.startTime * this.sampleRate),
    );
    const endFrame = Math.min(
      channelData.length,
      Math.ceil(options.endTime * this.sampleRate),
    );

    this.requestFrames(endFrame);

    if (this.isRangeDecoded(startFrame, endFrame))
      return channelData.slice(startFrame, endFrame);
    if (this.isStreamDone)
      return channelData.slice(
        startFrame,
        Math.min(channelData.length, endFrame),
      );
    if (this.seekable) {
      return this.readSeekableRange(
        options.channel,
        options.startTime,
        options.endTime,
        startFrame,
        endFrame,
      ).catch(() => this.waitForRange(options.channel, startFrame, endFrame));
    }
    return this.waitForRange(options.channel, startFrame, endFrame);
  }

  private waitForRange(
    channel: number,
    startFrame: number,
    endFrame: number,
  ): Promise<Float32Array> {
    return new Promise((resolve, reject) => {
      this.pending.push({ channel, startFrame, endFrame, resolve, reject });
      this.resolveReadyPending();
    });
  }

  onRangeAvailable(handler: (range: AudioRange) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private waitForDemand(): Promise<void> {
    if (
      this.decodedUntilFrame < this.requestedUntilFrame ||
      this.isStreamDone
    ) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.demandResolver = resolve;
    });
  }

  private requestFrames(endFrame: number): void {
    const target = endFrame + this.sampleRate * 15;
    if (target > this.requestedUntilFrame) {
      this.requestedUntilFrame = target;
      if (this.demandResolver) {
        const resolve = this.demandResolver;
        this.demandResolver = undefined;
        resolve();
      }
    }
  }

  private async decodeSequentially(
    initialDataBytes?: Uint8Array,
  ): Promise<void> {
    const totalFrames = this.decoded[0]?.length ?? 0;
    let leftover: Uint8Array | undefined = initialDataBytes;

    if (leftover && leftover.length > 0) {
      leftover = this.processIncrementalChunk(leftover, totalFrames);
    }

    while (this.decodedUntilFrame < totalFrames) {
      if (this.decodedUntilFrame >= this.requestedUntilFrame) {
        await this.waitForDemand();
      }

      const result = await this.reader.read();
      if (result.done) break;
      const chunk = result.value;
      if (chunk.length === 0) continue;

      let combined: Uint8Array;
      if (leftover && leftover.length > 0) {
        combined = new Uint8Array(leftover.length + chunk.length);
        combined.set(leftover, 0);
        combined.set(chunk, leftover.length);
        leftover = undefined;
      } else {
        combined = chunk;
      }

      leftover = this.processIncrementalChunk(combined, totalFrames);
    }

    this.reader.releaseLock();
    this.isStreamDone = true;
    this.resolveReadyPending();
    if (this.pending.length > 0) {
      this.rejectPending(
        new Error("WAV stream ended before requested samples were available"),
      );
    }
  }

  private processIncrementalChunk(
    bytes: Uint8Array,
    totalFrames: number,
  ): Uint8Array | undefined {
    const availableFrames = Math.floor(bytes.length / this.info.blockAlign);
    const framesToDecode = Math.min(
      availableFrames,
      totalFrames - this.decodedUntilFrame,
    );
    if (framesToDecode > 0) {
      const byteLength = framesToDecode * this.info.blockAlign;
      decodeWavPcm(
        bytes.subarray(0, byteLength),
        this.info,
        this.info.dataOffset + this.decodedUntilFrame * this.info.blockAlign,
        this.decoded,
        this.decodedUntilFrame,
      );
      const startFrame = this.decodedUntilFrame;
      const endFrame = startFrame + framesToDecode;
      this.addDecodedRange(startFrame, endFrame);
      this.emitRange(startFrame / this.sampleRate, endFrame / this.sampleRate);
      this.resolveReadyPending();
    }
    const remainder = bytes.subarray(framesToDecode * this.info.blockAlign);
    return remainder.length > 0 ? remainder.slice() : undefined;
  }

  private async readSeekableRange(
    channel: number,
    startTime: number,
    endTime: number,
    startFrame: number,
    endFrame: number,
  ): Promise<Float32Array> {
    if (!this.seekable) throw new Error("Seekable source not available");
    const range = wavTimeToByteRange(this.info, startTime, endTime);
    const bytes = await this.seekable.readRange(range.start, range.end);
    if (!bytes) throw new Error("No bytes returned from seekable range");
    if (bytes.length > range.end - range.start)
      throw new Error("Seekable WAV range returned more bytes than requested");

    const expectedFrames = Math.floor(bytes.length / this.info.blockAlign);
    decodeWavPcm(bytes, this.info, range.start, this.decoded, startFrame);
    const decodedEndFrame = startFrame + expectedFrames;
    this.addDecodedRange(startFrame, decodedEndFrame);
    if (decodedEndFrame > startFrame) {
      this.emitRange(
        startFrame / this.sampleRate,
        decodedEndFrame / this.sampleRate,
      );
    }
    this.resolveReadyPending();

    if (!this.isRangeDecoded(startFrame, endFrame))
      throw new Error(
        "Seekable WAV range ended before requested samples were available",
      );
    const channelData = this.decoded[channel];
    if (!channelData) throw new Error(`Channel ${channel} not found`);
    return channelData.slice(startFrame, endFrame);
  }

  private resolveReadyPending(): void {
    for (let index = this.pending.length - 1; index >= 0; index--) {
      const pending = this.pending[index]!;
      if (this.isRangeDecoded(pending.startFrame, pending.endFrame)) {
        this.pending.splice(index, 1);
        const channelData = this.decoded[pending.channel];
        if (channelData) {
          pending.resolve(
            channelData.slice(pending.startFrame, pending.endFrame),
          );
        }
      } else if (this.isStreamDone) {
        this.pending.splice(index, 1);
        const channelData = this.decoded[pending.channel];
        if (channelData) {
          pending.resolve(
            channelData.slice(
              pending.startFrame,
              Math.min(channelData.length, pending.endFrame),
            ),
          );
        }
      }
    }
  }

  private addDecodedRange(startFrame: number, endFrame: number): void {
    if (endFrame <= startFrame) return;
    this.decodedRanges.push({ startFrame, endFrame });
    this.decodedRanges.sort(
      (left, right) => left.startFrame - right.startFrame,
    );

    const merged: DecodedRange[] = [];
    for (const range of this.decodedRanges) {
      const previous = merged[merged.length - 1];
      if (!previous || range.startFrame > previous.endFrame) {
        merged.push({ ...range });
      } else {
        previous.endFrame = Math.max(previous.endFrame, range.endFrame);
      }
    }

    this.decodedRanges.splice(0, this.decodedRanges.length, ...merged);
    this.decodedUntilFrame =
      this.decodedRanges[0]?.startFrame === 0
        ? this.decodedRanges[0].endFrame
        : 0;
  }

  private isRangeDecoded(startFrame: number, endFrame: number): boolean {
    if (endFrame <= startFrame) return true;
    return this.decodedRanges.some(
      (range) => range.startFrame <= startFrame && range.endFrame >= endFrame,
    );
  }

  private rejectPending(error: Error): void {
    while (this.pending.length > 0) this.pending.pop()?.reject(error);
  }

  private emitRange(startTime: number, endTime: number): void {
    const range = { startTime, endTime };
    for (const handler of this.handlers) handler(range);
  }
}

function shouldContinueHeaderRead(error: Error): boolean {
  return /Invalid WAV header|Invalid WAV fmt chunk|WAV fmt chunk not found|WAV data chunk not found/.test(
    error.message,
  );
}
