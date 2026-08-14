import { FetchByteSource, readPrefix } from "./byte-source";
import { StreamingWavSource } from "./streaming-wav-source";
import type { AudioSource } from "./types";
import { isWavBytes } from "./wav";

export class DecodedAudioSource implements AudioSource {
  readonly sampleRate: number;
  readonly duration: number;
  readonly channelCount: number;

  constructor(
    private readonly buffer: AudioBuffer,
    readonly id = `decoded:${buffer.sampleRate}:${buffer.length}:${buffer.numberOfChannels}`,
  ) {
    this.sampleRate = buffer.sampleRate;
    this.duration = buffer.duration;
    this.channelCount = buffer.numberOfChannels;
  }

  static async fromUrl(
    url: string,
    options?:
      | AudioContext
      | { audioContext?: AudioContext; sampleRate?: number },
  ): Promise<DecodedAudioSource> {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Failed to fetch audio source: ${response.status}`);
    const data = await response.arrayBuffer();
    const audioContext = resolveAudioContext(data, options);
    return new DecodedAudioSource(
      await audioContext.decodeAudioData(data),
      url,
    );
  }

  read(options: {
    channel: number;
    startTime: number;
    endTime: number;
  }): Float32Array {
    if (options.channel < 0 || options.channel >= this.channelCount)
      throw new Error(`Invalid channel ${options.channel}`);
    const start = Math.max(0, Math.floor(options.startTime * this.sampleRate));
    const end = Math.min(
      this.buffer.length,
      Math.ceil(options.endTime * this.sampleRate),
    );
    return this.buffer.getChannelData(options.channel).slice(start, end);
  }
}

export async function createAudioSourceFromUrl(
  url: string,
  options?: AudioContext | { audioContext?: AudioContext; sampleRate?: number },
): Promise<AudioSource> {
  const byteSource = FetchByteSource.fromUrl(url);
  const prefix = await readPrefix(byteSource, 64);
  if (isWavBytes(prefix)) {
    try {
      return await StreamingWavSource.fromByteSource(byteSource, { id: url });
    } catch {
      return DecodedAudioSource.fromUrl(url, options);
    }
  }
  return DecodedAudioSource.fromUrl(url, options);
}

function resolveAudioContext(
  data: ArrayBuffer,
  options?: AudioContext | { audioContext?: AudioContext; sampleRate?: number },
): AudioContext {
  if (isAudioContext(options)) return options;
  if (options && "audioContext" in options && options.audioContext)
    return options.audioContext;
  const sampleRate =
    options && "sampleRate" in options
      ? (options.sampleRate ?? readWavSampleRate(data))
      : readWavSampleRate(data);
  return new AudioContext(
    sampleRate === undefined ? undefined : { sampleRate },
  );
}

function isAudioContext(value: unknown): value is AudioContext {
  return (
    typeof value === "object" && value !== null && "decodeAudioData" in value
  );
}

function readWavSampleRate(data: ArrayBuffer): number | undefined {
  if (data.byteLength < 28) return undefined;
  const view = new DataView(data);
  if (text(data, 0, 4) !== "RIFF" || text(data, 8, 4) !== "WAVE")
    return undefined;
  let offset = 12;
  while (offset + 8 <= data.byteLength) {
    const id = text(data, offset, 4);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt " && offset + 16 <= data.byteLength)
      return view.getUint32(offset + 12, true);
    offset += 8 + size + (size % 2);
  }
  return undefined;
}

function text(data: ArrayBuffer, offset: number, length: number): string {
  return String.fromCharCode(...new Uint8Array(data, offset, length));
}
