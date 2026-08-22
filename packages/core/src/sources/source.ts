import type { AudioSource } from "../types";
import {
  BlobByteSource,
  BufferByteSource,
  FetchByteSource,
  readPrefix,
  type SeekableByteSource,
} from "./byte-source";
import { ClippedAudioSource } from "./clipped-source";
import { isMp3Bytes, parseMp3Info } from "./mp3";
import { StreamingMp3Source } from "./streaming-mp3-source";
import { StreamingWavSource } from "./streaming-wav-source";
import { isWavBytes } from "./wav";

export type AudioSourceOptions =
  | AudioContextLike
  | {
      audioContext?: AudioContextLike | undefined;
      sampleRate?: number | undefined;
      preferStreaming?: boolean | undefined;
      preferDecoded?: boolean | undefined;
      clipStart?: number | undefined;
      clipEnd?: number | undefined;
    }
  | undefined;

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
      | {
          audioContext?: AudioContextLike | undefined;
          sampleRate?: number | undefined;
        }
      | undefined,
  ): Promise<DecodedAudioSource> {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Failed to fetch audio source: ${response.status}`);
    const data = await response.arrayBuffer();
    return DecodedAudioSource.fromBuffer(data, options, url);
  }

  static async fromBlob(
    blob: Blob,
    options?:
      | AudioContextLike
      | {
          audioContext?: AudioContextLike | undefined;
          sampleRate?: number | undefined;
        }
      | undefined,
    id?: string,
  ): Promise<DecodedAudioSource> {
    const data = await blob.arrayBuffer();
    return DecodedAudioSource.fromBuffer(data, options, id);
  }

  static async fromBuffer(
    buffer: ArrayBuffer | Uint8Array,
    options?:
      | AudioContextLike
      | {
          audioContext?: AudioContextLike | undefined;
          sampleRate?: number | undefined;
        }
      | undefined,
    id?: string,
  ): Promise<DecodedAudioSource> {
    const arrayBuffer: ArrayBuffer =
      buffer instanceof ArrayBuffer
        ? buffer
        : (buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength,
          ) as ArrayBuffer);
    const audioContext = resolveAudioContext(arrayBuffer, options);
    try {
      const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      return new DecodedAudioSource(decoded, id);
    } catch (err) {
      if (
        typeof AudioContext !== "undefined" &&
        !(audioContext instanceof AudioContext)
      ) {
        try {
          const fallbackCtx = new AudioContext();
          const decoded = await fallbackCtx.decodeAudioData(
            arrayBuffer.slice(0),
          );
          return new DecodedAudioSource(decoded, id);
        } catch {
          // fall through to original error
        }
      }
      throw err;
    }
  }

  read(options: {
    channel: number;
    startTime: number;
    endTime: number;
  }): Float32Array {
    if (options.channel < 0 || options.channel >= this.channelCount)
      throw new Error(`Invalid channel ${options.channel}`);
    const start = Math.max(
      0,
      Math.floor(options.startTime * this.sampleRate + 1e-6),
    );
    const end = Math.min(
      this.buffer.length,
      Math.ceil(options.endTime * this.sampleRate - 1e-6),
    );
    return this.buffer.getChannelData(options.channel).slice(start, end);
  }
}

async function createAudioSourceFromByteSource(
  byteSource: SeekableByteSource,
  options: AudioSourceOptions,
  sourceId?: string,
  fallbackDecode?: () => Promise<AudioSource>,
): Promise<AudioSource> {
  const isDecodedPreferred =
    Boolean(options && "preferDecoded" in options && options.preferDecoded) ||
    Boolean(
      options &&
        "preferStreaming" in options &&
        options.preferStreaming === false,
    );

  if (isDecodedPreferred && fallbackDecode) {
    const raw = await fallbackDecode();
    return wrapClippedIfNeeded(raw, options);
  }

  const prefix = await readPrefix(byteSource, 64);

  if (isWavBytes(prefix)) {
    try {
      const wavOpts = sourceId !== undefined ? { id: sourceId } : undefined;
      const raw = await StreamingWavSource.fromByteSource(byteSource, wavOpts);
      return wrapClippedIfNeeded(raw, options);
    } catch {
      if (fallbackDecode) {
        const raw = await fallbackDecode();
        return wrapClippedIfNeeded(raw, options);
      }
    }
  }

  if (isMp3Bytes(prefix)) {
    if (await StreamingMp3Source.isSupported()) {
      try {
        const mp3Opts = sourceId !== undefined ? { id: sourceId } : undefined;
        const raw = await StreamingMp3Source.fromByteSource(
          byteSource,
          mp3Opts,
        );
        return wrapClippedIfNeeded(raw, options);
      } catch {
        if (fallbackDecode) {
          const raw = await fallbackDecode();
          return wrapClippedIfNeeded(raw, options);
        }
      }
    }
    if (fallbackDecode) {
      const raw = await fallbackDecode();
      return wrapClippedIfNeeded(raw, options);
    }
  }

  if (fallbackDecode) {
    const raw = await fallbackDecode();
    return wrapClippedIfNeeded(raw, options);
  }

  throw new Error("Unsupported audio byte source and no fallback provided");
}

export function wrapClippedIfNeeded(
  source: AudioSource,
  options?: AudioSourceOptions,
): AudioSource {
  if (
    options &&
    typeof options === "object" &&
    ("clipStart" in options || "clipEnd" in options) &&
    (options.clipStart !== undefined || options.clipEnd !== undefined)
  ) {
    return new ClippedAudioSource(source, {
      clipStart: options.clipStart,
      clipEnd: options.clipEnd,
    });
  }
  return source;
}

/**
 * Creates an AudioSource from an audio URL.
 *
 * Defaults to streaming sources (`StreamingWavSource`, `StreamingMp3Source`) for instant first-tile rendering.
 * Falls back to `DecodedAudioSource` (native `AudioContext.decodeAudioData`) if streaming is unavailable
 * or when `preferDecoded: true` / `preferStreaming: false` is specified.
 */
export async function createAudioSourceFromUrl(
  url: string,
  options?: AudioSourceOptions,
): Promise<AudioSource> {
  const byteSource = FetchByteSource.fromUrl(url);
  return createAudioSourceFromByteSource(byteSource, options, url, () =>
    DecodedAudioSource.fromUrl(url, options),
  );
}

/**
 * Creates an AudioSource from a Blob or File.
 *
 * Defaults to streaming sources for instant first-tile rendering.
 * Falls back to `DecodedAudioSource` if streaming is unavailable.
 */
export async function createAudioSourceFromBlob(
  blob: Blob,
  options?: AudioSourceOptions,
  id?: string,
): Promise<AudioSource> {
  const byteSource = new BlobByteSource(blob);
  return createAudioSourceFromByteSource(byteSource, options, id, () =>
    DecodedAudioSource.fromBlob(blob, options, id),
  );
}

/**
 * Creates an AudioSource from an ArrayBuffer or Uint8Array.
 *
 * Defaults to streaming sources for instant first-tile rendering.
 * Falls back to `DecodedAudioSource` if streaming is unavailable.
 */
export async function createAudioSourceFromBuffer(
  buffer: ArrayBuffer | Uint8Array,
  options?: AudioSourceOptions,
  id?: string,
): Promise<AudioSource> {
  const byteSource = new BufferByteSource(buffer);
  return createAudioSourceFromByteSource(byteSource, options, id, () =>
    DecodedAudioSource.fromBuffer(buffer, options, id),
  );
}

export type AudioContextLike = {
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
};

function getSharedDecodeContext(sampleRate?: number): AudioContextLike {
  if (typeof AudioContext !== "undefined") {
    try {
      return new AudioContext(
        sampleRate === undefined ? undefined : { sampleRate },
      );
    } catch {
      return new AudioContext();
    }
  }

  if (typeof OfflineAudioContext !== "undefined") {
    try {
      return new OfflineAudioContext(1, 1, sampleRate ?? 44100);
    } catch {
      return new OfflineAudioContext(1, 1, 44100);
    }
  }

  throw new Error("Web Audio API is not supported in this environment");
}

function resolveAudioContext(
  data: ArrayBuffer,
  options?:
    | AudioContextLike
    | {
        audioContext?: AudioContextLike | undefined;
        sampleRate?: number | undefined;
      }
    | undefined,
): AudioContextLike {
  if (isAudioContext(options)) return options;
  if (options && "audioContext" in options && options.audioContext)
    return options.audioContext;
  const sampleRate =
    options && "sampleRate" in options
      ? (options.sampleRate ?? readSampleRateFromBuffer(data))
      : readSampleRateFromBuffer(data);
  return getSharedDecodeContext(sampleRate);
}

function readSampleRateFromBuffer(data: ArrayBuffer): number | undefined {
  return readWavSampleRate(data) ?? readMp3SampleRate(data);
}

function readMp3SampleRate(data: ArrayBuffer): number | undefined {
  try {
    const bytes = new Uint8Array(data);
    const frame = isMp3Bytes(bytes);
    if (!frame) return undefined;
    const info = parseMp3Info(bytes);
    return info.sampleRate;
  } catch {
    return undefined;
  }
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
