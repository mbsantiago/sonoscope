import type {
  AudioSource,
  ISpectrogramViewer,
  SpectrogramOptions,
} from "@sonoscope/core";
import { Sonoscope } from "@sonoscope/core";
import { AudioRingBuffer } from "./ring-buffer";
import {
  RECORDER_WORKLET_CODE,
  RECORDER_WORKLET_NAME,
} from "./worklet-processor";

let nextMonitorSourceId = 0;

export interface MicrophoneMonitorOptions {
  /** Seconds of recent audio shown in the monitor. Defaults to 10. */
  historySeconds?: number | undefined;
  /** Maximum visual refreshes per second. Defaults to 10. */
  refreshRate?: number | undefined;
  /** Number of requested input channels. Defaults to 1. */
  channelCount?: number | undefined;
  /** Specific audio input device ID from MediaDeviceInfo. */
  deviceId?: string | undefined;
  /** Existing AudioContext instance to reuse. */
  audioContext?: AudioContext | undefined;
  /** Existing MediaStream to reuse. */
  mediaStream?: MediaStream | undefined;
  /** Enable browser acoustic echo cancellation. Defaults to true. */
  echoCancellation?: boolean | undefined;
  /** Enable browser noise suppression. Defaults to false. */
  noiseSuppression?: boolean | undefined;
  /** Enable browser auto gain control. Defaults to false. */
  autoGainControl?: boolean | undefined;
}

class MonitorAudioSource implements AudioSource {
  readonly id: string;

  constructor(
    readonly sampleRate: number,
    readonly channelCount: number,
    private readonly buffer: AudioRingBuffer,
  ) {
    this.id = `microphone-monitor:${sampleRate}:${channelCount}:${nextMonitorSourceId++}`;
  }

  get duration(): number {
    return Math.max(this.buffer.duration, this.buffer.endTime);
  }

  read(options: {
    channel: number;
    startTime: number;
    endTime: number;
  }): Float32Array {
    // Before the history window fills, keep the newest samples at the right edge.
    const offset = Math.max(0, this.duration - this.buffer.endTime);
    return this.buffer.read({
      ...options,
      startTime: options.startTime - offset,
      endTime: options.endTime - offset,
    });
  }
}

export class MicrophoneMonitor {
  private readonly historySeconds: number;
  private readonly refreshIntervalMs: number;
  private readonly requestedChannelCount: number;
  private readonly options: MicrophoneMonitorOptions;
  private sourceValue: MonitorAudioSource | undefined;
  private buffer: AudioRingBuffer | undefined;
  private audioContext: AudioContext | undefined;
  private mediaStream: MediaStream | undefined;
  private sourceNode: MediaStreamAudioSourceNode | undefined;
  private processorNode: AudioNode | undefined;
  private workletNode: AudioWorkletNode | undefined;
  private scriptProcessor: ScriptProcessorNode | undefined;
  private silentGain: GainNode | undefined;
  private ownsAudioContext = false;
  private ownsMediaStream = false;
  private active = false;
  private paused = false;
  private destroyed = false;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private scope: Sonoscope | undefined;
  private spectrogram: ISpectrogramViewer | undefined;
  private elapsedSeconds = 0;
  private lastRms = 0;

  private constructor(options: MicrophoneMonitorOptions) {
    this.options = options;
    this.historySeconds = positiveNumber(
      options.historySeconds,
      10,
      "historySeconds",
    );
    this.refreshIntervalMs =
      1000 / positiveNumber(options.refreshRate, 10, "refreshRate");
    this.requestedChannelCount = positiveInteger(
      options.channelCount,
      1,
      "channelCount",
    );
    this.audioContext = options.audioContext;
    this.mediaStream = options.mediaStream;
  }

  static async create(
    options: MicrophoneMonitorOptions = {},
  ): Promise<MicrophoneMonitor> {
    const monitor = new MicrophoneMonitor(options);
    await monitor.start();
    return monitor;
  }

  get source(): AudioSource {
    if (!this.sourceValue) {
      throw new Error("MicrophoneMonitor has not started");
    }
    return this.sourceValue;
  }

  get volume(): number {
    return this.lastRms;
  }

  get capturedSeconds(): number {
    return this.elapsedSeconds;
  }

  get isRecording(): boolean {
    return this.active && !this.paused;
  }

  async start(): Promise<void> {
    if (this.destroyed) throw new Error("MicrophoneMonitor has been destroyed");
    if (this.active) return;
    if (this.sourceValue) {
      throw new Error(
        "A stopped MicrophoneMonitor cannot be restarted; create a new monitor instead",
      );
    }

    try {
      await this.prepareCapture();
      const context = this.audioContext;
      const stream = this.mediaStream;
      if (!context || !stream)
        throw new Error("Microphone capture was not initialized");

      this.buffer = new AudioRingBuffer({
        sampleRate: context.sampleRate,
        channelCount: this.requestedChannelCount,
        duration: this.historySeconds,
      });
      this.sourceValue = this.createDisplaySource();
      this.sourceNode = context.createMediaStreamSource(stream);
      this.active = true;
      this.paused = false;
      await this.connectProcessor(context);
    } catch (error) {
      this.stop();
      this.sourceValue = undefined;
      this.buffer = undefined;
      throw error;
    }
  }

  pause(): void {
    if (this.active) this.paused = true;
  }

  resume(): void {
    if (this.active) this.paused = false;
  }

  stop(): void {
    this.active = false;
    this.paused = false;
    this.cancelRefresh();
    this.disconnectProcessor();

    if (this.ownsMediaStream && this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) track.stop();
      this.mediaStream = undefined;
    }
    if (this.ownsAudioContext && this.audioContext) {
      void this.audioContext.close();
      this.audioContext = undefined;
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    this.spectrogram?.destroy();
    this.spectrogram = undefined;
    this.scope?.destroy();
    this.scope = undefined;
  }

  attachSpectrogram(
    canvas: HTMLCanvasElement,
    options?: Partial<SpectrogramOptions>,
  ): ISpectrogramViewer {
    if (this.destroyed) throw new Error("MicrophoneMonitor has been destroyed");
    if (this.spectrogram) {
      throw new Error("MicrophoneMonitor already has an attached spectrogram");
    }

    this.scope = new Sonoscope({
      source: this.source,
      ...this.visibleTimeRange(),
      minDuration: Math.min(0.05, this.historySeconds),
      maxDuration: this.historySeconds,
    });
    this.spectrogram = this.scope.createSpectrogram(canvas, {
      ...options,
      loading: options?.loading ?? "none",
    });
    this.scope.attachNavigation(canvas);
    return this.spectrogram;
  }

  private async prepareCapture(): Promise<void> {
    if (!this.mediaStream) {
      const getUserMedia = globalThis.navigator?.mediaDevices?.getUserMedia;
      if (!getUserMedia) {
        throw new Error(
          "navigator.mediaDevices.getUserMedia is not supported in this environment",
        );
      }
      this.mediaStream = await getUserMedia.call(
        globalThis.navigator.mediaDevices,
        {
          audio: {
            channelCount: this.requestedChannelCount,
            echoCancellation: this.options.echoCancellation ?? true,
            noiseSuppression: this.options.noiseSuppression ?? false,
            autoGainControl: this.options.autoGainControl ?? false,
            ...(this.options.deviceId
              ? { deviceId: { exact: this.options.deviceId } }
              : {}),
          },
          video: false,
        },
      );
      this.ownsMediaStream = true;
    }

    if (!this.audioContext) {
      const AudioContextConstructor =
        globalThis.AudioContext ??
        (
          globalThis as typeof globalThis & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;
      if (!AudioContextConstructor) {
        throw new Error("Web Audio API is not supported in this environment");
      }
      this.audioContext = new AudioContextConstructor();
      this.ownsAudioContext = true;
    }
    if (this.audioContext.state === "suspended")
      await this.audioContext.resume();
  }

  private async connectProcessor(context: AudioContext): Promise<void> {
    if (!this.sourceNode)
      throw new Error("Microphone source node is unavailable");

    if (context.audioWorklet) {
      try {
        const blob = new Blob([RECORDER_WORKLET_CODE], {
          type: "application/javascript",
        });
        const workletUrl = URL.createObjectURL(blob);
        try {
          await context.audioWorklet.addModule(workletUrl);
        } finally {
          URL.revokeObjectURL(workletUrl);
        }
        const processor = new AudioWorkletNode(context, RECORDER_WORKLET_NAME, {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: this.requestedChannelCount,
        });
        processor.port.onmessage = (
          event: MessageEvent<{ channels: Float32Array[] }>,
        ) => {
          this.appendChunk(event.data.channels);
        };
        this.processorNode = processor;
        this.workletNode = processor;
      } catch (error) {
        console.warn(
          "AudioWorklet initialization failed; falling back to ScriptProcessor",
          error,
        );
      }
    }

    if (!this.processorNode) {
      const processor = context.createScriptProcessor(
        512,
        this.requestedChannelCount,
        this.requestedChannelCount,
      );
      processor.onaudioprocess = (event) => {
        const channels: Float32Array[] = [];
        for (let channel = 0; channel < this.requestedChannelCount; channel++) {
          channels.push(
            new Float32Array(
              event.inputBuffer.getChannelData(
                Math.min(channel, event.inputBuffer.numberOfChannels - 1),
              ),
            ),
          );
        }
        this.appendChunk(channels);
      };
      this.processorNode = processor;
      this.scriptProcessor = processor;
    }

    this.silentGain = context.createGain();
    this.silentGain.gain.value = 0;
    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.silentGain);
    this.silentGain.connect(context.destination);
  }

  private disconnectProcessor(): void {
    if (this.workletNode) this.workletNode.port.onmessage = null;
    if (this.scriptProcessor) this.scriptProcessor.onaudioprocess = null;
    this.sourceNode?.disconnect();
    this.processorNode?.disconnect();
    this.silentGain?.disconnect();
    this.sourceNode = undefined;
    this.processorNode = undefined;
    this.workletNode = undefined;
    this.scriptProcessor = undefined;
    this.silentGain = undefined;
  }

  private appendChunk(channels: Float32Array[]): void {
    if (!this.active || this.paused || !this.buffer || !this.sourceValue)
      return;
    const firstChannel = channels[0];
    if (!firstChannel?.length) return;

    let sumSquares = 0;
    for (const sample of firstChannel) sumSquares += sample * sample;
    this.lastRms = Math.sqrt(sumSquares / firstChannel.length);
    this.elapsedSeconds += firstChannel.length / this.sourceValue.sampleRate;
    this.buffer.append(channels);
    this.scheduleRefresh();
  }

  private scheduleRefresh(): void {
    if (!this.spectrogram || this.refreshTimer !== undefined) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      if (!this.active || !this.spectrogram || !this.buffer) return;
      if (this.buffer.endTime <= this.historySeconds) {
        // The fixed initial viewport contains newly recorded samples each refresh.
        const source = this.createDisplaySource();
        this.sourceValue = source;
        this.scope?.setSource(source);
        this.followCaptureWindow();
        return;
      }
      const source = this.source;
      // Keep absolute tile coordinates stable so completed history remains cached.
      this.scope?.setSource(source);
      this.followCaptureWindow();
    }, this.refreshIntervalMs);
  }

  private cancelRefresh(): void {
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
  }

  private createDisplaySource(): MonitorAudioSource {
    const context = this.audioContext;
    const buffer = this.buffer;
    if (!context || !buffer)
      throw new Error("Microphone monitor buffer is unavailable");
    const source = new MonitorAudioSource(
      context.sampleRate,
      this.requestedChannelCount,
      buffer,
    );
    return source;
  }

  private visibleTimeRange(): { startTime: number; endTime: number } {
    const endTime = this.sourceValue?.duration ?? 0;
    return {
      startTime: Math.max(0, endTime - this.historySeconds),
      endTime,
    };
  }

  private followCaptureWindow(): void {
    const range = this.visibleTimeRange();
    this.scope
      ?.getViewportController()
      .setTimeBounds(range.startTime, range.endTime);
    this.scope?.setViewport(range, "microphone-follow");
  }
}

export async function createMicrophoneMonitor(
  options?: MicrophoneMonitorOptions,
): Promise<MicrophoneMonitor> {
  return MicrophoneMonitor.create(options);
}

function positiveNumber(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return resolved;
}

function positiveInteger(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return resolved;
}
