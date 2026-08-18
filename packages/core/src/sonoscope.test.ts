import type { AudioSource } from "./types";
import { describe, expect, it, vi } from "vitest";
import { Sonoscope } from "./sonoscope";
import * as sourceModule from "./sources/source";
import { DecodedAudioSource } from "./sources/source";

type AudioFixture = HTMLAudioElement & {
  paused: boolean;
  emit(name: string): void;
  listenerCount(): number;
};

function createMockAudio(src = "fixture.wav"): AudioFixture {
  const listeners = new Map<string, () => void>();
  return {
    currentTime: 0,
    duration: 10,
    src,
    currentSrc: src,
    paused: true,
    addEventListener: (name: string, fn: () => void) => listeners.set(name, fn),
    removeEventListener: (name: string) => listeners.delete(name),
    emit: (name: string) => listeners.get(name)?.(),
    listenerCount: () => listeners.size,
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

function createMockBuffer(
  duration = 10,
  sampleRate = 44100,
  numberOfChannels = 1,
): AudioBuffer {
  const channelData = new Float32Array(Math.floor(duration * sampleRate));
  return {
    duration,
    sampleRate,
    numberOfChannels,
    length: channelData.length,
    getChannelData: () => channelData,
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  } as unknown as AudioBuffer;
}

function createMockSource(duration = 20, sampleRate = 48000): AudioSource {
  return {
    id: `mock-source-${duration}-${sampleRate}`,
    duration,
    sampleRate,
    channelCount: 2,
    read: () => new Float32Array(100),
  };
}

describe("Sonoscope", () => {
  it("constructs directly with an AudioSource", () => {
    const source = createMockSource(15, 44100);
    const scope = new Sonoscope(source);

    expect(scope.source).toBe(source);
    expect(scope.getDuration()).toBe(15);
    expect(scope.getSampleRate()).toBe(44100);
    expect(scope.getViewport()).toEqual({
      startTime: 0,
      endTime: 10,
      duration: 10,
      totalDuration: 15,
      minFrequency: 0,
      maxFrequency: 22050,
      frequencyScale: "linear",
    });
    expect(scope.getAudio()).toBeUndefined();
    expect(scope.getCurrentTime()).toBe(0);
  });

  it("constructs with SonoscopeOptions", () => {
    const source = createMockSource(30, 48000);
    const audio = createMockAudio();
    audio.currentTime = 3.5;
    const scope = new Sonoscope({
      source,
      startTime: 2,
      endTime: 8,
      minDuration: 1,
      maxDuration: 20,
      followPlayback: "smooth",
      smoothAnchor: 0.25,
      audio,
    });

    expect(scope.source).toBe(source);
    expect(scope.getDuration()).toBe(30);
    expect(scope.getSampleRate()).toBe(48000);
    expect(scope.getViewport()).toEqual({
      startTime: 2,
      endTime: 8,
      duration: 6,
      totalDuration: 30,
      minFrequency: 0,
      maxFrequency: 24000,
      frequencyScale: "linear",
    });
    expect(scope.getAudio()).toBe(audio);
    expect(scope.getFollowPlayback()).toBe("smooth");
  });

  it("creates instance via Sonoscope.fromSource", () => {
    const source = createMockSource(12, 44100);
    const scope = Sonoscope.fromSource(source, {
      startTime: 1,
      endTime: 6,
    });

    expect(scope.source).toBe(source);
    expect(scope.getViewport().startTime).toBe(1);
    expect(scope.getViewport().endTime).toBe(6);
  });

  it("creates instance via Sonoscope.fromAudioBuffer", () => {
    const buffer = createMockBuffer(8, 22050, 1);
    const scope = Sonoscope.fromAudioBuffer(buffer, {
      startTime: 0,
      endTime: 4,
    });

    expect(scope.source).toBeInstanceOf(DecodedAudioSource);
    expect(scope.getDuration()).toBe(8);
    expect(scope.getSampleRate()).toBe(22050);
    expect(scope.getViewport().endTime).toBe(4);
  });

  it("creates instance via Sonoscope.fromUrl", async () => {
    const mockSource = createMockSource(25, 44100);
    const spy = vi
      .spyOn(sourceModule, "createAudioSourceFromUrl")
      .mockResolvedValue(mockSource);

    const audio = createMockAudio("");
    const scope = await Sonoscope.fromUrl("https://example.com/audio.mp3", {
      audio,
      startTime: 0,
      endTime: 10,
    });

    expect(spy).toHaveBeenCalledWith("https://example.com/audio.mp3");
    expect(audio.src).toBe("https://example.com/audio.mp3");
    expect(scope.source).toBe(mockSource);
    expect(scope.getAudio()).toBe(audio);
    expect(scope.getDuration()).toBe(25);

    spy.mockRestore();
  });

  it("creates instance via Sonoscope.fromAudio", async () => {
    const mockSource = createMockSource(18, 44100);
    const spy = vi
      .spyOn(sourceModule, "createAudioSourceFromUrl")
      .mockResolvedValue(mockSource);

    const audio = createMockAudio("https://example.com/podcast.wav");
    const scope = await Sonoscope.fromAudio(audio, {
      startTime: 2,
      endTime: 10,
    });

    expect(spy).toHaveBeenCalledWith("https://example.com/podcast.wav");
    expect(scope.source).toBe(mockSource);
    expect(scope.getAudio()).toBe(audio);
    expect(scope.getDuration()).toBe(18);

    spy.mockRestore();
  });

  it("throws when Sonoscope.fromAudio is given an audio element with no src", async () => {
    const audio = createMockAudio("");
    Object.defineProperty(audio, "currentSrc", {
      value: "",
      configurable: true,
    });
    audio.src = "";

    await expect(Sonoscope.fromAudio(audio)).rejects.toThrow(
      "Audio element has no src or currentSrc",
    );
  });

  describe("Viewport Operations and Events", () => {
    it("updates viewport with setViewport and emits viewportchange", () => {
      const source = createMockSource(30);
      const scope = new Sonoscope(source);

      const events: Array<{
        startTime: number;
        endTime: number;
        source?: string | undefined;
      }> = [];
      const unlisten = scope.on("viewportchange", (e) => {
        events.push({
          startTime: e.viewport.startTime,
          endTime: e.viewport.endTime,
          source: e.source,
        });
      });

      scope.setViewport({ startTime: 5, endTime: 15 }, "user");
      expect(scope.getViewport().startTime).toBe(5);
      expect(scope.getViewport().endTime).toBe(15);
      expect(events).toEqual([{ startTime: 5, endTime: 15, source: "user" }]);

      scope.updateViewport({ startTime: 6, endTime: 16 });
      expect(scope.getViewport().startTime).toBe(6);
      expect(scope.getViewport().endTime).toBe(16);

      unlisten();
      scope.setViewport({ startTime: 0, endTime: 10 });
      expect(events).toHaveLength(2);
    });

    it("zooms and pans viewport correctly", () => {
      const source = createMockSource(30);
      const scope = new Sonoscope({
        source,
        startTime: 10,
        endTime: 20,
      });

      // Zoom in 2x (factor 0.5) centered at 15
      scope.zoom(0.5, 15);
      expect(scope.getViewport().duration).toBeCloseTo(5);
      expect(scope.getViewport().startTime).toBeCloseTo(12.5);
      expect(scope.getViewport().endTime).toBeCloseTo(17.5);

      // Pan right by 2 seconds
      scope.pan(2);
      expect(scope.getViewport().startTime).toBeCloseTo(14.5);
      expect(scope.getViewport().endTime).toBeCloseTo(19.5);

      // Pan directly to startTime 5
      scope.panTo(5);
      expect(scope.getViewport().startTime).toBeCloseTo(5);
      expect(scope.getViewport().endTime).toBeCloseTo(10);
    });

    it("changes followPlayback mode and emits playbackchange event", () => {
      const source = createMockSource(30);
      const scope = new Sonoscope(source);

      const events: string[] = [];
      scope.on("playbackchange", (e) => {
        events.push(e.mode);
      });

      expect(scope.getFollowPlayback()).toBe("page");
      scope.setFollowPlayback("smooth");
      expect(scope.getFollowPlayback()).toBe("smooth");
      scope.setFollowPlayback("off");
      expect(scope.getFollowPlayback()).toBe("off");

      expect(events).toEqual(["smooth", "off"]);
    });

    it("auto-pans viewport when followPlayback is page and playhead crosses boundary", () => {
      const source = createMockSource(50);
      const audio = createMockAudio();
      audio.currentTime = 0;
      const scope = new Sonoscope({
        source,
        audio,
        startTime: 0,
        endTime: 10,
        followPlayback: "page",
      });

      // Playhead moves beyond endTime 10 -> viewport should page forward
      audio.currentTime = 10.5;
      audio.emit("timeupdate");
      expect(scope.getViewport().startTime).toBe(10.5);
      expect(scope.getViewport().endTime).toBe(20.5);
    });

    it("centers viewport when followPlayback is smooth", () => {
      const source = createMockSource(50);
      const audio = createMockAudio();
      audio.currentTime = 0;
      const scope = new Sonoscope({
        source,
        audio,
        startTime: 0,
        endTime: 10,
        followPlayback: "smooth",
        smoothAnchor: 0.5,
      });

      // At currentTime 20, center is anchored at 0.5 -> start is 20 - 5 = 15
      audio.currentTime = 20;
      audio.emit("timeupdate");
      expect(scope.getViewport().startTime).toBe(15);
      expect(scope.getViewport().endTime).toBe(25);
    });

    it("handles non-finite and extreme values gracefully", () => {
      const source = createMockSource(30);
      const scope = new Sonoscope({
        source,
        startTime: 5,
        endTime: 15,
      });

      scope.zoom(-1);
      expect(scope.getViewport().duration).toBeGreaterThan(0);
      scope.zoom(Number.NaN);
      expect(scope.getViewport().duration).toBeGreaterThan(0);

      scope.pan(Number.NaN);
      expect(Number.isFinite(scope.getViewport().startTime)).toBe(true);

      scope.setViewport({ startTime: -100, endTime: 1000 });
      expect(scope.getViewport().startTime).toBe(0);
      expect(scope.getViewport().endTime).toBe(30);
    });

    it("updates source and emits sourcechange event", () => {
      const source1 = createMockSource(10, 44100);
      const source2 = createMockSource(50, 96000);
      const scope = new Sonoscope(source1);

      const events: AudioSource[] = [];
      scope.on("sourcechange", (e) => {
        events.push(e.source);
      });

      expect(scope.getDuration()).toBe(10);
      expect(scope.getSampleRate()).toBe(44100);

      scope.setSource(source2);
      expect(scope.source).toBe(source2);
      expect(scope.getDuration()).toBe(50);
      expect(scope.getSampleRate()).toBe(96000);
      expect(scope.getViewport().totalDuration).toBe(50);
      expect(events).toEqual([source2]);
    });
  });

  describe("Audio and Playback Tracking", () => {
    it("attaches and detaches audio correctly", () => {
      const source = createMockSource(20);
      const scope = new Sonoscope(source);
      const audio = createMockAudio();

      const timeUpdates: number[] = [];
      scope.on("timeupdate", (e) => {
        timeUpdates.push(e.currentTime);
      });

      scope.attachAudio(audio);
      expect(scope.getAudio()).toBe(audio);
      expect(timeUpdates).toEqual([0]);

      audio.currentTime = 3.5;
      audio.emit("timeupdate");
      expect(timeUpdates).toEqual([0, 3.5]);

      scope.seek(7.2);
      expect(audio.currentTime).toBe(7.2);
      expect(scope.getCurrentTime()).toBe(7.2);

      scope.detachAudio();
      expect(scope.getAudio()).toBeUndefined();

      audio.currentTime = 9;
      audio.emit("timeupdate");
      expect(timeUpdates).not.toContain(9);
    });

    it("seek clamps time within source duration", () => {
      const source = createMockSource(10);
      const scope = new Sonoscope(source);
      const audio = createMockAudio();
      scope.attachAudio(audio);

      scope.seek(-5);
      expect(audio.currentTime).toBe(0);

      scope.seek(50);
      expect(audio.currentTime).toBe(10);
    });
  });

  describe("Viewers Factory", () => {
    it("creates spectrogram viewer", () => {
      const source = createMockSource(10);
      const scope = new Sonoscope(source);
      const canvas = createMockCanvas();

      const viewer = scope.createSpectrogram(canvas, {
        windowSize: 1024,
      });

      expect(viewer).toBeDefined();
      expect(typeof viewer.render).toBe("function");
      expect(typeof viewer.destroy).toBe("function");
      viewer.destroy();
    });

    it("creates waveform viewer", () => {
      const source = createMockSource(10);
      const scope = new Sonoscope(source);
      const canvas = createMockCanvas();

      const viewer = scope.createWaveform(canvas, {
        color: "#ff0000",
      });

      expect(viewer).toBeDefined();
      expect(typeof viewer.render).toBe("function");
      expect(typeof viewer.destroy).toBe("function");
      viewer.destroy();
    });
  });

  describe("Lifecycle and Cleanup", () => {
    it("destroys resources and emits destroy event", () => {
      const source = createMockSource(20);
      const audio = createMockAudio();
      const scope = new Sonoscope({
        source,
        audio,
      });

      let destroyed = false;
      scope.on("destroy", () => {
        destroyed = true;
      });

      scope.destroy();
      expect(destroyed).toBe(true);
      expect(scope.getAudio()).toBeUndefined();
      expect(audio.listenerCount()).toBe(0);
    });
  });
});
