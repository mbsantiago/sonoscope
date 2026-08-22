import type { AudioRange, AudioSource } from "../types";
import {
  type ByteStreamSource,
  concatChunks,
  isSeekableByteSource,
} from "./byte-source";
import {
  findNextMp3Frame,
  type Mp3Info,
  parseMp3FrameHeader,
  parseMp3Info,
} from "./mp3";
import {
  createWebCodecsMp3Decoder,
  isWebCodecsMp3Supported,
  type Mp3Decoder,
  type Mp3DecoderFactory,
} from "./webcodecs-mp3-decoder";

type PendingRead = {
  channel: number;
  startFrame: number;
  endFrame: number;
  resolve: (samples: Float32Array) => void;
  reject: (error: Error) => void;
};

type DecodedRange = { startFrame: number; endFrame: number };

const INITIAL_READ_LIMIT = 65536;

export class StreamingMp3Source implements AudioSource {
  readonly sampleRate: number;
  duration: number;
  readonly channelCount: number;
  readonly id: string;

  private decoded: Float32Array[];
  private decodedFrameCount = 0;
  private readonly decodedRanges: DecodedRange[] = [];
  private readonly pending: PendingRead[] = [];
  private readonly handlers = new Set<(range: AudioRange) => void>();
  private isStreamDone = false;
  private decoder: Mp3Decoder | undefined;

  private requestedUntilFrame = 0;
  private demandResolver: (() => void) | undefined;

  private constructor(
    private readonly reader: ReadableStreamDefaultReader<Uint8Array>,
    private initialChunks: Uint8Array[],
    info: Mp3Info,
    options?: { id?: string; decoderFactory?: Mp3DecoderFactory },
  ) {
    this.sampleRate = info.sampleRate;
    this.duration = info.duration;
    this.channelCount = info.channelCount;
    this.id =
      options?.id ??
      `streaming-mp3:${info.sampleRate}:${info.duration}:${info.channelCount}`;

    const initialCapacity = Math.max(
      1152,
      Math.ceil(info.duration * info.sampleRate),
    );
    this.decoded = Array.from(
      { length: info.channelCount },
      () => new Float32Array(initialCapacity),
    );

    this.requestedUntilFrame = Math.max(
      1152 * 10,
      Math.ceil(Math.min(30, info.duration) * info.sampleRate),
    );

    const decoderFactory = options?.decoderFactory ?? createWebCodecsMp3Decoder;
    void this.initAndDecode(decoderFactory).catch((error) =>
      this.rejectPending(
        error instanceof Error ? error : new Error(String(error)),
      ),
    );
  }

  static async isSupported(): Promise<boolean> {
    return isWebCodecsMp3Supported();
  }

  static async fromReader(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    initialChunks: Uint8Array[] = [],
    totalBytes?: number,
    options?: { id?: string; decoderFactory?: Mp3DecoderFactory },
  ): Promise<StreamingMp3Source> {
    const chunks: Uint8Array[] = [...initialChunks];
    let total = chunks.reduce((acc, c) => acc + c.length, 0);
    let info: Mp3Info | undefined;

    while (total < INITIAL_READ_LIMIT) {
      if (chunks.length > 0) {
        try {
          info = parseMp3Info(concatChunks(chunks), totalBytes);
          break;
        } catch {
          // Need more bytes to parse MP3 frame/ID3
        }
      }

      const result = await reader.read();
      if (result.done) break;
      chunks.push(result.value);
      total += result.value.length;
    }

    if (!info) {
      reader.releaseLock();
      throw new Error("Failed to parse MP3 metadata from byte stream");
    }

    return new StreamingMp3Source(reader, chunks, info, options);
  }

  static async fromByteSource(
    byteSource: ByteStreamSource,
    options?: { id?: string; decoderFactory?: Mp3DecoderFactory },
  ): Promise<StreamingMp3Source> {
    const reader = byteSource.stream().getReader();
    const totalBytes = isSeekableByteSource(byteSource)
      ? byteSource.size
      : undefined;
    return StreamingMp3Source.fromReader(reader, [], totalBytes, options);
  }

  read(options: {
    channel: number;
    startTime: number;
    endTime: number;
  }): Float32Array | Promise<Float32Array> {
    if (options.channel < 0 || options.channel >= this.channelCount) {
      throw new Error(`Invalid channel ${options.channel}`);
    }

    const startFrame = Math.max(
      0,
      Math.floor(options.startTime * this.sampleRate + 1e-6),
    );
    const endFrame = Math.max(
      startFrame,
      Math.ceil(options.endTime * this.sampleRate - 1e-6),
    );

    this.requestFrames(endFrame);

    if (this.isRangeDecoded(startFrame, endFrame)) {
      const channelData = this.decoded[options.channel];
      if (!channelData) throw new Error(`Channel ${options.channel} not found`);
      return channelData.slice(startFrame, endFrame);
    }

    if (this.isStreamDone) {
      const channelData = this.decoded[options.channel];
      if (!channelData) throw new Error(`Channel ${options.channel} not found`);
      const availableEnd = Math.min(this.decodedFrameCount, endFrame);
      return channelData.slice(startFrame, availableEnd);
    }

    return this.waitForRange(options.channel, startFrame, endFrame);
  }

  onRangeAvailable(handler: (range: AudioRange) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
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

  private waitForDemand(): Promise<void> {
    if (
      this.decodedFrameCount < this.requestedUntilFrame ||
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

  private async initAndDecode(
    decoderFactory: Mp3DecoderFactory,
  ): Promise<void> {
    this.decoder = await decoderFactory({
      sampleRate: this.sampleRate,
      channelCount: this.channelCount,
      onOutput: (pcm) => this.appendPcm(pcm),
    });
    await this.decodeSequentially();
  }

  private async decodeSequentially(): Promise<void> {
    if (!this.decoder) return;
    const unconsumed = concatChunks(this.initialChunks);
    this.initialChunks = [];

    await this.processBuffer(unconsumed, false);

    while (true) {
      if (this.decodedFrameCount >= this.requestedUntilFrame) {
        await this.waitForDemand();
      }

      const result = await this.reader.read();
      if (result.done) break;
      await this.processBuffer(result.value, false);
    }

    this.reader.releaseLock();

    // Flush decoder
    const flushedChannels = await this.decoder.flush();
    if (flushedChannels.length > 0 && flushedChannels[0]!.length > 0) {
      this.appendPcm(flushedChannels);
    }

    this.isStreamDone = true;
    this.duration = Math.max(
      this.duration,
      this.decodedFrameCount / this.sampleRate,
    );
    this.decoder.close();
    this.resolveReadyPending();

    if (this.pending.length > 0) {
      this.rejectPending(
        new Error("MP3 stream ended before requested samples were available"),
      );
    }
  }

  private pendingBytes: Uint8Array = new Uint8Array(0);

  private async processBuffer(
    chunk: Uint8Array,
    _isLast: boolean,
  ): Promise<void> {
    if (!this.decoder) return;
    const buffer =
      this.pendingBytes.length > 0
        ? concatChunks([this.pendingBytes, chunk])
        : chunk;

    let cursor = 0;

    while (cursor < buffer.length) {
      let frameOffset = cursor;
      let header = parseMp3FrameHeader(buffer, cursor);
      if (!header || header.sampleRate !== this.sampleRate) {
        const next = findNextMp3Frame(buffer, cursor);
        if (!next) {
          // No frame found in remainder, keep up to last 4 bytes for next chunk
          this.pendingBytes = buffer.slice(Math.max(0, buffer.length - 4));
          return;
        }
        frameOffset = next.offset;
        header = next.header;
      }

      const frameLength = header.frameLength;

      if (frameOffset + frameLength > buffer.length) {
        // Incomplete frame, wait for more data
        this.pendingBytes = buffer.slice(frameOffset);
        return;
      }

      const frameBytes = buffer.subarray(
        frameOffset,
        frameOffset + frameLength,
      );
      const timestampUs =
        (this.decodedFrameCount * 1_000_000) / this.sampleRate;

      const pcmChannels = await this.decoder.decode(frameBytes, timestampUs);
      if (pcmChannels.length > 0 && pcmChannels[0]!.length > 0) {
        this.appendPcm(pcmChannels);
      }

      cursor = frameOffset + frameLength;
    }

    this.pendingBytes = new Uint8Array(0);
  }

  private appendPcm(pcmChannels: Float32Array[]): void {
    const frameCount = pcmChannels[0]!.length;
    if (frameCount === 0) return;

    const startFrame = this.decodedFrameCount;
    const endFrame = startFrame + frameCount;

    this.ensureCapacity(endFrame);

    for (let c = 0; c < this.channelCount; c++) {
      const sourceChannel = pcmChannels[c] ?? pcmChannels[0]!;
      this.decoded[c]!.set(sourceChannel, startFrame);
    }

    this.decodedFrameCount = endFrame;
    this.addDecodedRange(startFrame, endFrame);

    if (endFrame > startFrame) {
      this.emitRange(startFrame / this.sampleRate, endFrame / this.sampleRate);
    }

    this.resolveReadyPending();
  }

  private ensureCapacity(requiredFrames: number): void {
    const currentCapacity = this.decoded[0]?.length ?? 0;
    if (requiredFrames <= currentCapacity) return;

    const newCapacity = Math.max(requiredFrames, currentCapacity * 2);
    for (let c = 0; c < this.channelCount; c++) {
      const expanded = new Float32Array(newCapacity);
      if (this.decoded[c]) {
        expanded.set(this.decoded[c]!);
      }
      this.decoded[c] = expanded;
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
  }

  private isRangeDecoded(startFrame: number, endFrame: number): boolean {
    if (endFrame <= startFrame) return true;
    return this.decodedRanges.some(
      (range) => range.startFrame <= startFrame && range.endFrame >= endFrame,
    );
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
          const availableEnd = Math.min(
            this.decodedFrameCount,
            pending.endFrame,
          );
          pending.resolve(channelData.slice(pending.startFrame, availableEnd));
        }
      }
    }
  }

  private rejectPending(error: Error): void {
    while (this.pending.length > 0) {
      const pending = this.pending.pop();
      pending?.reject(error);
    }
  }

  private emitRange(startTime: number, endTime: number): void {
    const range: AudioRange = { startTime, endTime };
    for (const handler of this.handlers) {
      handler(range);
    }
  }
}
