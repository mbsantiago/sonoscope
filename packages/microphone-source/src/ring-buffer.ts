export type AudioReadOptions = {
  channel: number;
  startTime: number;
  endTime: number;
};

export class AudioRingBuffer {
  readonly duration: number;
  readonly sampleRate: number;

  private readonly capacityFrames: number;
  private readonly channels: Float32Array[];
  private writeFrame = 0;
  private storedFrames = 0;
  private totalFrames = 0;

  constructor(options: {
    sampleRate: number;
    channelCount: number;
    duration: number;
  }) {
    if (!Number.isFinite(options.sampleRate) || options.sampleRate <= 0) {
      throw new Error("sampleRate must be a positive number");
    }
    if (
      !Number.isSafeInteger(options.channelCount) ||
      options.channelCount < 1
    ) {
      throw new Error("channelCount must be a positive integer");
    }
    if (!Number.isFinite(options.duration) || options.duration <= 0) {
      throw new Error("duration must be a positive number");
    }

    this.duration = options.duration;
    this.sampleRate = options.sampleRate;
    this.capacityFrames = Math.max(
      1,
      Math.ceil(options.duration * options.sampleRate),
    );
    this.channels = Array.from(
      { length: options.channelCount },
      () => new Float32Array(this.capacityFrames),
    );
  }

  append(input: Float32Array[]): void {
    const frameCount = input[0]?.length ?? 0;
    if (frameCount === 0) return;

    for (let frame = 0; frame < frameCount; frame++) {
      for (let channel = 0; channel < this.channels.length; channel++) {
        const destination = this.channels[channel]!;
        const source = input[channel] ?? input[0]!;
        destination[this.writeFrame] = source[frame] ?? 0;
      }
      this.writeFrame = (this.writeFrame + 1) % this.capacityFrames;
    }
    this.storedFrames = Math.min(
      this.capacityFrames,
      this.storedFrames + frameCount,
    );
    this.totalFrames += frameCount;
  }

  get endTime(): number {
    return this.totalFrames / this.sampleRate;
  }

  get startTime(): number {
    return (this.totalFrames - this.storedFrames) / this.sampleRate;
  }

  read(options: AudioReadOptions): Float32Array {
    const channel = this.channels[options.channel];
    if (!channel) throw new Error(`Invalid channel ${options.channel}`);

    const startFrame = Math.floor(options.startTime * this.sampleRate + 1e-6);
    const endFrame = Math.max(
      startFrame,
      Math.ceil(options.endTime * this.sampleRate - 1e-6),
    );
    const output = new Float32Array(Math.max(0, endFrame - startFrame));
    const firstStoredFrame = this.totalFrames - this.storedFrames;

    for (
      let frame = Math.max(startFrame, firstStoredFrame);
      frame < Math.min(endFrame, this.totalFrames);
      frame++
    ) {
      const offset = frame - firstStoredFrame;
      const sourceFrame =
        (this.writeFrame - this.storedFrames + offset + this.capacityFrames) %
        this.capacityFrames;
      output[frame - startFrame] = channel[sourceFrame]!;
    }

    return output;
  }
}
