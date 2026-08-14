import {
  type ByteStreamSource,
  concatChunks,
  isSeekableByteSource,
  type SeekableByteSource,
} from "./byte-source";
import type { AudioRange, AudioSource } from "./types";
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

  private constructor(
    private readonly reader: ReadableStreamDefaultReader<Uint8Array>,
    private readonly chunks: Uint8Array[],
    private readonly info: WavInfo,
    private readonly seekable: SeekableByteSource | undefined,
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
    void this.decodeSequentially().catch((error) =>
      this.rejectPending(
        error instanceof Error ? error : new Error(String(error)),
      ),
    );
  }

  static async fromByteSource(
    byteSource: ByteStreamSource,
    options?: { id?: string },
  ): Promise<StreamingWavSource> {
    const reader = byteSource.stream().getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    while (total < HEADER_READ_LIMIT) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(result.value);
      total += result.value.length;
      try {
        return new StreamingWavSource(
          reader,
          chunks,
          parseWavHeader(concatChunks(chunks)),
          isSeekableByteSource(byteSource) ? byteSource : undefined,
          options,
        );
      } catch (error) {
        if (error instanceof Error && shouldContinueHeaderRead(error)) continue;
        reader.releaseLock();
        throw error;
      }
    }

    try {
      return new StreamingWavSource(
        reader,
        chunks,
        parseWavHeader(concatChunks(chunks)),
        isSeekableByteSource(byteSource) ? byteSource : undefined,
        options,
      );
    } catch (error) {
      reader.releaseLock();
      throw error;
    }
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
    if (this.isRangeDecoded(startFrame, endFrame))
      return channelData.slice(startFrame, endFrame);
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

  private async decodeSequentially(): Promise<void> {
    this.decodeAvailableChunks();
    const totalFrames = this.decoded[0]?.length ?? 0;
    while (this.decodedUntilFrame < totalFrames) {
      const result = await this.reader.read();
      if (result.done) break;
      this.chunks.push(result.value);
      this.decodeAvailableChunks();
    }
    this.reader.releaseLock();
    if (this.pending.length > 0)
      this.rejectPending(
        new Error("WAV stream ended before requested samples were available"),
      );
  }

  private decodeAvailableChunks(): void {
    const bytes = concatChunks(this.chunks);
    const totalFrames = this.decoded[0]?.length ?? 0;
    const completeFrameCount = Math.min(
      totalFrames,
      Math.max(
        0,
        Math.floor(
          (bytes.length - this.info.dataOffset) / this.info.blockAlign,
        ),
      ),
    );
    if (completeFrameCount <= this.decodedUntilFrame) return;
    const startFrame = this.decodedUntilFrame;
    const startByte = this.info.dataOffset + startFrame * this.info.blockAlign;
    const endByte =
      this.info.dataOffset + completeFrameCount * this.info.blockAlign;
    this.copyDecoded(bytes.slice(startByte, endByte), startByte, startFrame);
  }

  private copyDecoded(
    bytes: Uint8Array,
    byteOffset: number,
    startFrame: number,
  ): void {
    const decoded = decodeWavPcm(bytes, this.info, byteOffset);
    for (let channel = 0; channel < this.channelCount; channel++)
      this.decoded[channel]?.set(decoded[channel]!, startFrame);
    const firstDecoded = decoded[0];
    const endFrame = startFrame + (firstDecoded ? firstDecoded.length : 0);
    this.addDecodedRange(startFrame, endFrame);
    if (endFrame > startFrame)
      this.emitRange(startFrame / this.sampleRate, endFrame / this.sampleRate);
    this.resolveReadyPending();
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
    this.copyDecoded(bytes, range.start, startFrame);
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
      if (!this.isRangeDecoded(pending.startFrame, pending.endFrame)) continue;
      this.pending.splice(index, 1);
      const channelData = this.decoded[pending.channel];
      if (channelData) {
        pending.resolve(
          channelData.slice(pending.startFrame, pending.endFrame),
        );
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
