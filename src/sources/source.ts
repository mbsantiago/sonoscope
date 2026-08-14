import type { AudioSource } from "../types";
import { FetchByteSource, readPrefix } from "./byte-source";
import { isMp3Bytes } from "./mp3";
import { StreamingMp3Source } from "./streaming-mp3-source";
import { StreamingWavSource } from "./streaming-wav-source";
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
      | AudioContextLike
      | { audioContext?: AudioContextLike; sampleRate?: number },
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
  options?:
    | AudioContextLike
    | { audioContext?: AudioContextLike; sampleRate?: number },
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

  if (isMp3Bytes(prefix) && (await StreamingMp3Source.isSupported())) {
    try {
      return await StreamingMp3Source.fromByteSource(byteSource, { id: url });
    } catch {
      return DecodedAudioSource.fromUrl(url, options);
    }
  }

  return DecodedAudioSource.fromUrl(url, options);
}

export type AudioContextLike = {
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
};

function getSharedDecodeContext(sampleRate?: number): AudioContextLike {
  if (typeof OfflineAudioContext !== "undefined") {
    try {
      return new OfflineAudioContext(1, 1, sampleRate ?? 44100);
    } catch {
      return new OfflineAudioContext(1, 1, 44100);
    }
  }

  if (typeof AudioContext !== "undefined") {
    return new AudioContext(
      sampleRate === undefined ? undefined : { sampleRate },
    );
  }

  throw new Error("Web Audio API is not supported in this environment");
}

function resolveAudioContext(
  data: ArrayBuffer,
  options?:
    | AudioContextLike
    | { audioContext?: AudioContextLike; sampleRate?: number },
): AudioContextLike {
  if (isAudioContext(options)) return options;
  if (options && "audioContext" in options && options.audioContext)
    return options.audioContext;
  const sampleRate =
    options && "sampleRate" in options
      ? (options.sampleRate ?? readWavSampleRate(data))
      : readWavSampleRate(data);
  return getSharedDecodeContext(sampleRate);
}

function isAudioContext(value: unknown): value is AudioContextLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "decodeAudioData" in value &&
    typeof (value as AudioContextLike).decodeAudioData === "function"
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
