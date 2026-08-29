export type AudioReadOptions = {
  channel: number;
  startTime: number;
  endTime: number;
};

export class AudioRingBuffer {
  readonly duration: number;

  private readonly capacityFrames: number;
  private readonly channels: Float32Array[];
  private writeFrame = 0;
  private storedFrames = 0;

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
  }

  read(options: AudioReadOptions & { sampleRate: number }): Float32Array {
    const channel = this.channels[options.channel];
    if (!channel) throw new Error(`Invalid channel ${options.channel}`);

    const startFrame = Math.max(
      0,
      Math.floor(options.startTime * options.sampleRate + 1e-6),
    );
    const endFrame = Math.min(
      this.capacityFrames,
      Math.ceil(options.endTime * options.sampleRate - 1e-6),
    );
    const output = new Float32Array(Math.max(0, endFrame - startFrame));
    const firstDisplayFrame = this.capacityFrames - this.storedFrames;

    for (
      let displayFrame = Math.max(startFrame, firstDisplayFrame);
      displayFrame < endFrame;
      displayFrame++
    ) {
      const offset = displayFrame - firstDisplayFrame;
      const sourceFrame =
        (this.writeFrame - this.storedFrames + offset + this.capacityFrames) %
        this.capacityFrames;
      output[displayFrame - startFrame] = channel[sourceFrame]!;
    }

    return output;
  }
}
