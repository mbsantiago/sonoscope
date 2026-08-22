import type { AudioSource } from "../types";

export class ArrayAudioSource implements AudioSource {
  readonly sampleRate: number;
  readonly duration: number;
  readonly channelCount: number;
  readonly id: string;
  private readonly channels: Float32Array[];

  constructor(
    data: Float32Array | Float32Array[] | number[] | number[][],
    sampleRate: number,
    id?: string,
  ) {
    if (!sampleRate || sampleRate <= 0 || !Number.isFinite(sampleRate)) {
      throw new Error(`Invalid sample rate: ${sampleRate}`);
    }
    this.sampleRate = sampleRate;

    if (
      Array.isArray(data) &&
      data.length > 0 &&
      (Array.isArray(data[0]) || data[0] instanceof Float32Array)
    ) {
      this.channels = (data as Array<Float32Array | number[]>).map((ch) =>
        ch instanceof Float32Array ? ch : new Float32Array(ch),
      );
    } else if (data instanceof Float32Array) {
      this.channels = [data];
    } else if (Array.isArray(data)) {
      this.channels = [new Float32Array(data as number[])];
    } else {
      throw new Error("Invalid audio array data");
    }

    this.channelCount = this.channels.length;
    const length = this.channels[0]?.length ?? 0;
    this.duration = length / this.sampleRate;
    this.id = id ?? `array:${this.sampleRate}:${length}:${this.channelCount}`;
  }

  read(options: {
    channel: number;
    startTime: number;
    endTime: number;
  }): Float32Array {
    if (options.channel < 0 || options.channel >= this.channelCount) {
      throw new Error(`Invalid channel ${options.channel}`);
    }
    const channelData = this.channels[options.channel];
    if (!channelData) {
      throw new Error(`Invalid channel ${options.channel}`);
    }
    const start = Math.max(
      0,
      Math.floor(options.startTime * this.sampleRate + 1e-6),
    );
    const end = Math.min(
      channelData.length,
      Math.ceil(options.endTime * this.sampleRate - 1e-6),
    );
    return channelData.slice(start, end);
  }

  getChannelData(channel: number): Float32Array {
    if (channel < 0 || channel >= this.channelCount) {
      throw new Error(`Invalid channel ${channel}`);
    }
    const data = this.channels[channel];
    if (!data) {
      throw new Error(`Invalid channel ${channel}`);
    }
    return data;
  }
}
