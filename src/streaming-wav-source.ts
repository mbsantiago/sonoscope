import { concatChunks, type ByteStreamSource } from './byte-source';
import type { AudioRange, AudioSource } from './types';
import { decodeWavPcm, parseWavHeader, type WavInfo } from './wav';

type PendingRead = {
  channel: number;
  startFrame: number;
  endFrame: number;
  resolve: (samples: Float32Array) => void;
  reject: (error: Error) => void;
};

const HEADER_READ_LIMIT = 4096;

export class StreamingWavSource implements AudioSource {
  readonly sampleRate: number;
  readonly duration: number;
  readonly channelCount: number;
  readonly id: string;
  private readonly decoded: Float32Array[];
  private decodedUntilFrame = 0;
  private readonly pending: PendingRead[] = [];
  private readonly handlers = new Set<(range: AudioRange) => void>();

  private constructor(
    private readonly reader: ReadableStreamDefaultReader<Uint8Array>,
    private readonly chunks: Uint8Array[],
    private readonly info: WavInfo,
    options?: { id?: string },
  ) {
    this.sampleRate = info.sampleRate;
    this.duration = info.duration;
    this.channelCount = info.channelCount;
    this.id = options?.id ?? `streaming-wav:${info.sampleRate}:${info.dataSize}:${info.channelCount}`;
    this.decoded = Array.from({ length: info.channelCount }, () => new Float32Array(Math.floor(info.dataSize / info.blockAlign)));
    void this.decodeSequentially().catch((error) => this.rejectPending(error instanceof Error ? error : new Error(String(error))));
  }

  static async fromByteSource(byteSource: ByteStreamSource, options?: { id?: string }): Promise<StreamingWavSource> {
    const reader = byteSource.stream().getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    while (total < HEADER_READ_LIMIT) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(result.value);
      total += result.value.length;
      try {
        return new StreamingWavSource(reader, chunks, parseWavHeader(concatChunks(chunks)), options);
      } catch (error) {
        if (error instanceof Error && shouldContinueHeaderRead(error)) continue;
        reader.releaseLock();
        throw error;
      }
    }

    try {
      return new StreamingWavSource(reader, chunks, parseWavHeader(concatChunks(chunks)), options);
    } catch (error) {
      reader.releaseLock();
      throw error;
    }
  }

  read(options: { channel: number; startTime: number; endTime: number }): Float32Array | Promise<Float32Array> {
    if (options.channel < 0 || options.channel >= this.channelCount) throw new Error(`Invalid channel ${options.channel}`);
    const startFrame = Math.max(0, Math.floor(options.startTime * this.sampleRate));
    const endFrame = Math.min(this.decoded[options.channel]!.length, Math.ceil(options.endTime * this.sampleRate));
    if (endFrame <= this.decodedUntilFrame) return this.decoded[options.channel]!.slice(startFrame, endFrame);
    return new Promise((resolve, reject) => {
      this.pending.push({ channel: options.channel, startFrame, endFrame, resolve, reject });
      this.resolveReadyPending();
    });
  }

  onRangeAvailable(handler: (range: AudioRange) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private async decodeSequentially(): Promise<void> {
    this.decodeAvailableChunks();
    while (this.decodedUntilFrame < this.decoded[0]!.length) {
      const result = await this.reader.read();
      if (result.done) break;
      this.chunks.push(result.value);
      this.decodeAvailableChunks();
    }
    this.reader.releaseLock();
    if (this.pending.length > 0) this.rejectPending(new Error('WAV stream ended before requested samples were available'));
  }

  private decodeAvailableChunks(): void {
    const bytes = concatChunks(this.chunks);
    const completeFrameCount = Math.min(
      this.decoded[0]!.length,
      Math.max(0, Math.floor((bytes.length - this.info.dataOffset) / this.info.blockAlign)),
    );
    if (completeFrameCount <= this.decodedUntilFrame) return;
    const startFrame = this.decodedUntilFrame;
    const startByte = this.info.dataOffset + startFrame * this.info.blockAlign;
    const endByte = this.info.dataOffset + completeFrameCount * this.info.blockAlign;
    this.copyDecoded(bytes.slice(startByte, endByte), startByte, startFrame);
  }

  private copyDecoded(bytes: Uint8Array, byteOffset: number, startFrame: number): void {
    const decoded = decodeWavPcm(bytes, this.info, byteOffset);
    for (let channel = 0; channel < this.channelCount; channel++) this.decoded[channel]!.set(decoded[channel]!, startFrame);
    const previous = this.decodedUntilFrame;
    this.decodedUntilFrame = Math.max(this.decodedUntilFrame, startFrame + decoded[0]!.length);
    if (this.decodedUntilFrame > previous) this.emitRange(previous / this.sampleRate, this.decodedUntilFrame / this.sampleRate);
    this.resolveReadyPending();
  }

  private resolveReadyPending(): void {
    for (let index = this.pending.length - 1; index >= 0; index--) {
      const pending = this.pending[index]!;
      if (pending.endFrame > this.decodedUntilFrame) continue;
      this.pending.splice(index, 1);
      pending.resolve(this.decoded[pending.channel]!.slice(pending.startFrame, pending.endFrame));
    }
  }

  private rejectPending(error: Error): void {
    while (this.pending.length > 0) this.pending.pop()!.reject(error);
  }

  private emitRange(startTime: number, endTime: number): void {
    const range = { startTime, endTime };
    for (const handler of this.handlers) handler(range);
  }
}

function shouldContinueHeaderRead(error: Error): boolean {
  return /Invalid WAV header|Invalid WAV fmt chunk|WAV fmt chunk not found|WAV data chunk not found/.test(error.message);
}
