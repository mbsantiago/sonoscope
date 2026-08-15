import { afterEach, describe, expect, it, vi } from "vitest";
import { Sonoscope } from "./sonoscope";
import type { AudioSource } from "./types";
import { SpectrogramViewer } from "./viewer";
import { WaveformViewer } from "./waveform/viewer";

type AudioFixture = HTMLAudioElement & {
  paused: boolean;
  emit(name: string): void;
  listenerCount(): number;
};

function createMockAudio(): AudioFixture {
  const listeners = new Map<string, Array<() => void>>();
  return {
    currentTime: 0,
    duration: 10,
    src: "fixture.wav",
    currentSrc: "fixture.wav",
    paused: true,
    addEventListener: (name: string, fn: () => void) => {
      const arr = listeners.get(name) ?? [];
      arr.push(fn);
      listeners.set(name, arr);
    },
    removeEventListener: (name: string, fn: () => void) => {
      const arr = listeners.get(name) ?? [];
      const index = arr.indexOf(fn);
      if (index >= 0) arr.splice(index, 1);
    },
    emit: (name: string) => {
      for (const fn of listeners.get(name) ?? []) fn();
    },
    listenerCount: () => {
      let count = 0;
      for (const arr of listeners.values()) count += arr.length;
      return count;
    },
  } as unknown as AudioFixture;
}

function createMockCanvas(): HTMLCanvasElement {
  return {
    width: 100,
    height: 100,
    getBoundingClientRect: () => ({ width: 100, height: 100 }),
    getContext: () => ({
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      createImageData: (w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      }),
      putImageData: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    }),
  } as unknown as HTMLCanvasElement;
}

const source: AudioSource = {
  id: "s",
  sampleRate: 100,
  duration: 10,
  channelCount: 1,
  read: () => new Float32Array(100),
};

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as Partial<typeof globalThis>).requestAnimationFrame;
  delete (globalThis as Partial<typeof globalThis>).cancelAnimationFrame;
});

describe("playback sync", () => {
  it("Sonoscope updates viewport when follow is enabled and seeked fires", () => {
    const audio = createMockAudio();
    const scope = new Sonoscope({
      source,
      audio,
      startTime: 0,
      endTime: 2,
      followPlayback: "page",
    });

    audio.currentTime = 5;
    audio.emit("seeked");

    expect(scope.getViewport().startTime).toBeGreaterThanOrEqual(4);
  });

  it("Sonoscope emits timeupdate when seeking on scope", () => {
    const audio = createMockAudio();
    const scope = new Sonoscope({
      source,
      audio,
      startTime: 0,
      endTime: 5,
    });

    const timeUpdates: number[] = [];
    scope.on("timeupdate", (e) => timeUpdates.push(e.currentTime));

    scope.seek(3.5);
    expect(audio.currentTime).toBe(3.5);
    expect(timeUpdates).toContain(3.5);
  });

  it("Sonoscope starts animation frame loop on play and stops on pause", () => {
    const audio = createMockAudio();
    let frame: FrameRequestCallback | undefined;
    globalThis.requestAnimationFrame = (callback) => {
      frame = callback;
      return 1;
    };
    globalThis.cancelAnimationFrame = () => undefined;
    const cancelSpy = vi.spyOn(globalThis, "cancelAnimationFrame");

    const scope = new Sonoscope({ source, audio });
    const timeUpdates: number[] = [];
    scope.on("timeupdate", (e) => timeUpdates.push(e.currentTime));

    audio.currentTime = 1.0;
    audio.paused = false;
    audio.emit("play");

    frame?.(16);
    expect(timeUpdates.length).toBeGreaterThan(0);

    audio.paused = true;
    audio.emit("pause");
    expect(cancelSpy).toHaveBeenCalledWith(1);
  });

  it("SpectrogramViewer and WaveformViewer react to Sonoscope timeupdate and viewport changes", async () => {
    const audio = createMockAudio();
    const scope = new Sonoscope({
      source,
      audio,
      startTime: 0,
      endTime: 2,
      followPlayback: "page",
    });

    const specCanvas = createMockCanvas();
    const waveCanvas = createMockCanvas();

    const spec = new SpectrogramViewer(scope, specCanvas);
    const wave = new WaveformViewer(scope, waveCanvas);

    const specRenderSpy = vi.spyOn(spec, "requestRender");
    const waveRenderSpy = vi.spyOn(wave, "requestRender");

    // Audio progress within page triggers timeupdate without shifting viewport
    audio.currentTime = 0.5;
    audio.emit("timeupdate");
    expect(waveRenderSpy).toHaveBeenCalled();

    // Audio progress past viewport shifts page and triggers render on both viewers
    audio.currentTime = 3.0;
    audio.emit("timeupdate");
    expect(scope.getViewport().startTime).toBe(3);
    expect(specRenderSpy).toHaveBeenCalled();
  });

  it("coalesces repeated requested renders on viewer", async () => {
    const scope = Sonoscope.fromSource(source);
    const viewer = new SpectrogramViewer(scope, createMockCanvas());
    const render = vi.spyOn(viewer, "render").mockResolvedValue();

    viewer.requestRender();
    viewer.requestRender();
    await Promise.resolve();

    expect(render).toHaveBeenCalledTimes(1);
  });

  it("removes playback listeners when Sonoscope is destroyed", () => {
    const audio = createMockAudio();
    const scope = new Sonoscope({ source, audio });

    expect(audio.listenerCount()).toBeGreaterThan(0);
    scope.destroy();
    expect(audio.listenerCount()).toBe(0);
  });

  it("detaches audio cleanly from Sonoscope", () => {
    const audio = createMockAudio();
    const scope = new Sonoscope({ source, audio });
    const spec = new SpectrogramViewer(scope, createMockCanvas());
    const wave = new WaveformViewer(scope, createMockCanvas());

    expect(scope.getAudio()).toBe(audio);
    expect(spec.getScope().getAudio()).toBe(audio);
    expect(wave.getScope().getAudio()).toBe(audio);

    scope.detachAudio();
    expect(scope.getAudio()).toBeUndefined();
    expect(spec.getScope().getAudio()).toBeUndefined();
    expect(wave.getScope().getAudio()).toBeUndefined();
    expect(audio.listenerCount()).toBe(0);
  });
});
