import {
  type ByteStreamSource,
  concatChunks,
  isSeekableByteSource,
} from "./byte-source";
import { findNextMp3Frame, type Mp3Info, parseMp3Info } from "./mp3";
import type { AudioRange, AudioSource } from "./types";
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

  private constructor(
    private readonly reader: ReadableStreamDefaultReader<Uint8Array>,
    private initialChunks: Uint8Array[],
    info: Mp3Info,
    private readonly decoder: Mp3Decoder,
    options?: { id?: string },
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

    void this.decodeSequentially().catch((error) =>
      this.rejectPending(
        error instanceof Error ? error : new Error(String(error)),
      ),
    );
  }

  static async isSupported(): Promise<boolean> {
    return isWebCodecsMp3Supported();
  }

  static async fromByteSource(
    byteSource: ByteStreamSource,
    options?: { id?: string; decoderFactory?: Mp3DecoderFactory },
  ): Promise<StreamingMp3Source> {
    const reader = byteSource.stream().getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    let info: Mp3Info | undefined;
    const totalBytes = isSeekableByteSource(byteSource)
      ? byteSource.size
      : undefined;

    while (total < INITIAL_READ_LIMIT) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(result.value);
      total += result.value.length;
      try {
        info = parseMp3Info(concatChunks(chunks), totalBytes);
        break;
      } catch {
        // Need more bytes to parse MP3 frame/ID3
      }
    }

    if (!info) {
      reader.releaseLock();
      throw new Error("Failed to parse MP3 metadata from byte stream");
    }

    const decoderFactory = options?.decoderFactory ?? createWebCodecsMp3Decoder;
    const decoder = await decoderFactory({
      sampleRate: info.sampleRate,
      channelCount: info.channelCount,
    });

    return new StreamingMp3Source(reader, chunks, info, decoder, options);
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
      Math.floor(options.startTime * this.sampleRate),
    );
    const endFrame = Math.max(
      startFrame,
      Math.ceil(options.endTime * this.sampleRate),
    );

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

  private async decodeSequentially(): Promise<void> {
    const unconsumed = concatChunks(this.initialChunks);
    this.initialChunks = [];

    await this.processBuffer(unconsumed, false);

    while (true) {
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
    const buffer =
      this.pendingBytes.length > 0
        ? concatChunks([this.pendingBytes, chunk])
        : chunk;

    let cursor = 0;

    while (cursor < buffer.length) {
      const next = findNextMp3Frame(buffer, cursor);
      if (!next) {
        // No frame found in remainder, keep up to last 4 bytes for next chunk
        this.pendingBytes = buffer.slice(Math.max(0, buffer.length - 4));
        return;
      }

      const frameOffset = next.offset;
      const frameLength = next.header.frameLength;

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
      const availableEnd = Math.min(this.decodedFrameCount, pending.endFrame);
      if (this.isRangeDecoded(pending.startFrame, pending.endFrame)) {
        this.pending.splice(index, 1);
        const channelData = this.decoded[pending.channel];
        if (channelData) {
          pending.resolve(
            channelData.slice(pending.startFrame, pending.endFrame),
          );
        }
      } else if (
        this.isStreamDone &&
        this.isRangeDecoded(pending.startFrame, availableEnd)
      ) {
        this.pending.splice(index, 1);
        const channelData = this.decoded[pending.channel];
        if (channelData) {
          pending.resolve(channelData.slice(pending.startFrame, availableEnd));
        }
      }
    }
  }

  private rejectPending(error: Error): void {
    while (this.pending.length > 0) this.pending.pop()?.reject(error);
  }

  private emitRange(startTime: number, endTime: number): void {
    const range = { startTime, endTime };
    for (const handler of this.handlers) handler(range);
  }
}
