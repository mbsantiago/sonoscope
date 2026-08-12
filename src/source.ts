import type { AudioSource } from './types';

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

  static async fromUrl(url: string, audioContext = new AudioContext()): Promise<DecodedAudioSource> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch audio source: ${response.status}`);
    const data = await response.arrayBuffer();
    return new DecodedAudioSource(await audioContext.decodeAudioData(data), url);
  }

  read(options: { channel: number; startTime: number; endTime: number }): Float32Array {
    if (options.channel < 0 || options.channel >= this.channelCount) throw new Error(`Invalid channel ${options.channel}`);
    const start = Math.max(0, Math.floor(options.startTime * this.sampleRate));
    const end = Math.min(this.buffer.length, Math.ceil(options.endTime * this.sampleRate));
    return this.buffer.getChannelData(options.channel).slice(start, end);
  }
}
