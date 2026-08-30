import { describe, expect, it, vi } from "vitest";
import { createMicrophoneMonitor } from "./microphone-monitor";

function createCaptureDependencies() {
  const sourceNode = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const processorNode = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    onaudioprocess: null as ScriptProcessorNode["onaudioprocess"],
  };
  const gainNode = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 1 },
  };
  const context = {
    sampleRate: 1_000,
    state: "running",
    createMediaStreamSource: vi.fn(() => sourceNode),
    createScriptProcessor: vi.fn(() => processorNode),
    createGain: vi.fn(() => gainNode),
    destination: {},
  };
  const track = { stop: vi.fn() };
  const stream = { getTracks: vi.fn(() => [track]) };

  return {
    context: context as unknown as AudioContext,
    gainNode,
    processorNode,
    sourceNode,
    stream: stream as unknown as MediaStream,
    track,
  };
}

describe("MicrophoneMonitor", () => {
  it("uses a fixed source duration and safely stops the ScriptProcessor fallback", async () => {
    const dependencies = createCaptureDependencies();
    const monitor = await createMicrophoneMonitor({
      historySeconds: 0.005,
      audioContext: dependencies.context,
      mediaStream: dependencies.stream,
    });
    const append = monitor as unknown as {
      appendChunk(channels: Float32Array[]): void;
    };

    append.appendChunk([new Float32Array([1, 2, 3])]);

    expect(monitor.isRecording).toBe(true);
    expect(monitor.capturedSeconds).toBe(0.003);
    expect(monitor.source.duration).toBe(0.005);
    expect(
      Array.from(
        await monitor.source.read({ channel: 0, startTime: 0, endTime: 0.005 }),
      ),
    ).toEqual([0, 0, 1, 2, 3]);

    monitor.stop();

    expect(dependencies.processorNode.onaudioprocess).toBeNull();
    expect(dependencies.sourceNode.disconnect).toHaveBeenCalledOnce();
    expect(dependencies.processorNode.disconnect).toHaveBeenCalledOnce();
    expect(dependencies.gainNode.disconnect).toHaveBeenCalledOnce();
    expect(dependencies.track.stop).not.toHaveBeenCalled();
  });

  it("ignores incoming audio while paused", async () => {
    const dependencies = createCaptureDependencies();
    const monitor = await createMicrophoneMonitor({
      historySeconds: 0.005,
      audioContext: dependencies.context,
      mediaStream: dependencies.stream,
    });
    const append = monitor as unknown as {
      appendChunk(channels: Float32Array[]): void;
    };

    append.appendChunk([new Float32Array([1, 2])]);
    monitor.pause();
    append.appendChunk([new Float32Array([3, 4])]);
    monitor.resume();
    append.appendChunk([new Float32Array([5, 6])]);

    expect(monitor.capturedSeconds).toBe(0.004);
    expect(
      Array.from(
        await monitor.source.read({ channel: 0, startTime: 0, endTime: 0.005 }),
      ),
    ).toEqual([0, 1, 2, 5, 6]);

    monitor.destroy();
  });

  it("keeps a stable source and advances the visible capture window", async () => {
    vi.useFakeTimers();
    const dependencies = createCaptureDependencies();
    const monitor = await createMicrophoneMonitor({
      historySeconds: 0.005,
      refreshRate: 20,
      audioContext: dependencies.context,
      mediaStream: dependencies.stream,
    });
    const scope = {
      setSource: vi.fn(),
      setViewport: vi.fn(),
      getViewportController: vi.fn(() => ({ setTimeBounds: vi.fn() })),
    };
    const privateMonitor = monitor as unknown as {
      appendChunk(channels: Float32Array[]): void;
      scope: typeof scope | undefined;
      spectrogram: { destroy(): void } | undefined;
    };
    privateMonitor.scope = scope;
    privateMonitor.spectrogram = { destroy: vi.fn() };
    const source = monitor.source;

    privateMonitor.appendChunk([new Float32Array([1, 2, 3, 4, 5, 6, 7])]);
    await vi.advanceTimersByTimeAsync(50);

    expect(scope.setSource).toHaveBeenCalledWith(source);
    expect(scope.setViewport).toHaveBeenCalledWith(
      { startTime: 0.002, endTime: 0.007 },
      "microphone-follow",
    );
    expect(monitor.source).toBe(source);

    privateMonitor.scope = undefined;
    privateMonitor.spectrogram = undefined;
    monitor.destroy();
    vi.useRealTimers();
  });

  it("keeps an initial history window fixed while new audio arrives", async () => {
    vi.useFakeTimers();
    const dependencies = createCaptureDependencies();
    const monitor = await createMicrophoneMonitor({
      historySeconds: 0.005,
      refreshRate: 20,
      audioContext: dependencies.context,
      mediaStream: dependencies.stream,
    });
    const scope = {
      setSource: vi.fn(),
      setViewport: vi.fn(),
      getViewportController: vi.fn(() => ({ setTimeBounds: vi.fn() })),
    };
    const spectrogram = {
      destroy: vi.fn(),
      requestRender: vi.fn(),
    };
    const privateMonitor = monitor as unknown as {
      appendChunk(channels: Float32Array[]): void;
      scope: typeof scope | undefined;
      spectrogram: typeof spectrogram | undefined;
    };
    privateMonitor.scope = scope;
    privateMonitor.spectrogram = spectrogram;
    const originalSourceId = monitor.source.id;

    privateMonitor.appendChunk([new Float32Array([1, 2, 3])]);
    await vi.advanceTimersByTimeAsync(50);

    expect(monitor.source.duration).toBe(0.005);
    expect(monitor.source.id).not.toBe(originalSourceId);
    expect(spectrogram.requestRender).not.toHaveBeenCalled();
    expect(scope.setSource).toHaveBeenCalledWith(monitor.source);
    expect(scope.setViewport).toHaveBeenCalledWith(
      { startTime: 0, endTime: 0.005 },
      "microphone-follow",
    );

    privateMonitor.scope = undefined;
    privateMonitor.spectrogram = undefined;
    monitor.destroy();
    vi.useRealTimers();
  });
});
