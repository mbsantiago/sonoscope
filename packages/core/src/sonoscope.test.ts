import type { AudioSource } from "./types";
import { describe, expect, it, vi } from "vitest";
import { Sonoscope } from "./sonoscope";
import { ArrayAudioSource } from "./sources/array-source";
import * as sourceModule from "./sources/source";
import { DecodedAudioSource } from "./sources/source";
import { encodeWavBlob, encodeWavBuffer } from "./sources/wav-encoder";

type AudioFixture = HTMLAudioElement & {
  paused: boolean;
  emit(name: string): void;
  listenerCount(): number;
};

function createMockAudio(src = "fixture.wav"): AudioFixture {
  const listeners = new Map<string, () => void>();
  const audio = {
    currentTime: 0,
    duration: 10,
    src,
    currentSrc: src,
    paused: true,
    pause() {
      audio.paused = true;
    },
    play() {
      audio.paused = false;
      return Promise.resolve();
    },
    addEventListener: (name: string, fn: () => void) => listeners.set(name, fn),
    removeEventListener: (name: string) => listeners.delete(name),
    emit: (name: string) => listeners.get(name)?.(),
    listenerCount: () => listeners.size,
  } as unknown as AudioFixture;
  return audio;
}

type MockCanvasFixture = HTMLCanvasElement & {
  listeners: Map<string, Array<EventListener>>;
};

function createMockCanvas(): MockCanvasFixture {
  const listeners = new Map<string, Array<EventListener>>();
  return {
    width: 100,
    height: 100,
    style: { cursor: "" },
    listeners,
    addEventListener: vi.fn((name: string, fn: EventListener) => {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name)!.push(fn);
    }),
    removeEventListener: vi.fn((name: string, fn: EventListener) => {
      const list = listeners.get(name);
      if (list) {
        const idx = list.indexOf(fn);
        if (idx !== -1) list.splice(idx, 1);
      }
    }),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    }),
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
  } as unknown as MockCanvasFixture;
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

  it("creates instance via Sonoscope.fromArray", () => {
    const samples = new Float32Array(44100 * 2);
    const scope = Sonoscope.fromArray(samples, 44100, {
      startTime: 0,
      endTime: 1,
    });

    expect(scope.source).toBeInstanceOf(ArrayAudioSource);
    expect(scope.getDuration()).toBe(2);
    expect(scope.getSampleRate()).toBe(44100);
    expect(scope.getViewport().endTime).toBe(1);
  });

  it("creates instance via Sonoscope.fromBlob", async () => {
    const wavBlob = encodeWavBlob(new Float32Array(22050), 22050);
    const scope = await Sonoscope.fromBlob(wavBlob);

    expect(scope.getSampleRate()).toBe(22050);
    expect(scope.getDuration()).toBe(1);
  });

  it("creates instance via Sonoscope.fromBuffer", async () => {
    const wavBuffer = encodeWavBuffer(new Float32Array(16000), 16000);
    const scope = await Sonoscope.fromBuffer(wavBuffer);

    expect(scope.getSampleRate()).toBe(16000);
    expect(scope.getDuration()).toBe(1);
  });

  it("automatically creates and cleans up ObjectURLs for HTMLAudioElement", () => {
    const revokeSpy = vi.fn();
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue("blob:test-audio");
    globalThis.URL.revokeObjectURL = revokeSpy;

    const audio = createMockAudio("");
    const samples = new Float32Array(44100);
    const scope = Sonoscope.fromArray(samples, 44100, { audio });

    expect(audio.src).toBe("blob:test-audio");
    scope.destroy();
    expect(revokeSpy).toHaveBeenCalledWith("blob:test-audio");
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

    it("zooms in frequency and allows zooming back out to Nyquist", () => {
      const source = createMockSource(30, 48000);
      const scope = new Sonoscope({
        source,
        minFrequency: 0,
        maxFrequency: 24000,
      });

      expect(scope.getNyquist()).toBe(24000);
      expect(scope.getViewport().minFrequency).toBe(0);
      expect(scope.getViewport().maxFrequency).toBe(24000);

      // Zoom in frequency 2x centered at 12000
      scope.zoomFrequency(0.5, 12000);
      expect(scope.getViewport().minFrequency).toBeCloseTo(6000);
      expect(scope.getViewport().maxFrequency).toBeCloseTo(18000);

      // Zoom back out 2x centered at 12000
      scope.zoomFrequency(2.0, 12000);
      expect(scope.getViewport().minFrequency).toBeCloseTo(0);
      expect(scope.getViewport().maxFrequency).toBeCloseTo(24000);
    });

    it("zooms both time and frequency and allows zooming back out", () => {
      const source = createMockSource(30, 48000);
      const scope = new Sonoscope({
        source,
        startTime: 0,
        endTime: 20,
        minFrequency: 0,
        maxFrequency: 24000,
      });

      // Zoom in both 2x
      scope.zoomBoth(0.5, { time: 10, frequency: 12000 });
      expect(scope.getViewport().startTime).toBeCloseTo(5);
      expect(scope.getViewport().endTime).toBeCloseTo(15);
      expect(scope.getViewport().minFrequency).toBeCloseTo(6000);
      expect(scope.getViewport().maxFrequency).toBeCloseTo(18000);

      // Zoom back out 2x
      scope.zoomBoth(2.0, { time: 10, frequency: 12000 });
      expect(scope.getViewport().startTime).toBeCloseTo(0);
      expect(scope.getViewport().endTime).toBeCloseTo(20);
      expect(scope.getViewport().minFrequency).toBeCloseTo(0);
      expect(scope.getViewport().maxFrequency).toBeCloseTo(24000);
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

  describe("attachNavigation", () => {
    it("attaches navigation directly to a canvas using scope.attachNavigation(canvas)", () => {
      const scope = new Sonoscope({
        source: createMockSource(20),
        startTime: 2,
        endTime: 8,
      });
      const canvas = createMockCanvas();

      const detach = scope.attachNavigation(canvas);
      expect(typeof detach).toBe("function");

      expect(canvas.addEventListener).toHaveBeenCalledWith(
        "wheel",
        expect.any(Function),
        { passive: false },
      );

      const hasPointerEvents =
        typeof window !== "undefined" && "PointerEvent" in window;
      const downEvent = hasPointerEvents ? "pointerdown" : "mousedown";
      const moveEvent = hasPointerEvents ? "pointermove" : "mousemove";

      const down = canvas.listeners.get(downEvent)![0]!;
      const move = canvas.listeners.get(moveEvent)![0]!;

      // Drag left 25px on 100px width canvas with 6s duration -> delta = +1.5s
      down({
        button: 0,
        clientX: 50,
        clientY: 50,
        pointerId: 1,
      } as unknown as PointerEvent);

      move({
        button: 0,
        clientX: 25,
        clientY: 50,
        pointerId: 1,
      } as unknown as PointerEvent);

      expect(scope.getViewport().startTime).toBeCloseTo(3.5);
      expect(scope.getViewport().endTime).toBeCloseTo(9.5);

      detach();
    });

    it("attaches navigation to a container wrapper div using scope.attachNavigation(container)", () => {
      const scope = new Sonoscope(createMockSource(20));
      const containerDiv = createMockCanvas();

      const detach = scope.attachNavigation(containerDiv, { axis: "time" });
      expect(typeof detach).toBe("function");
      expect(containerDiv.addEventListener).toHaveBeenCalledWith(
        "wheel",
        expect.any(Function),
        { passive: false },
      );

      detach();
    });

    it("supports manual detach and unbinds listeners", () => {
      const scope = new Sonoscope(createMockSource(20));
      const canvas = createMockCanvas();

      const detach = scope.attachNavigation(canvas);
      expect(canvas.addEventListener).toHaveBeenCalled();

      detach();
      expect(canvas.removeEventListener).toHaveBeenCalled();
    });

    it("automatically cleans up scope navigations when scope.destroy() is called", () => {
      const scope = new Sonoscope(createMockSource(20));
      const canvas1 = createMockCanvas();
      const canvas2 = createMockCanvas();

      scope.attachNavigation(canvas1);
      scope.attachNavigation(canvas2);

      scope.destroy();
      expect(canvas1.removeEventListener).toHaveBeenCalled();
      expect(canvas2.removeEventListener).toHaveBeenCalled();
    });

    it("throws when target is invalid", () => {
      const scope = new Sonoscope(createMockSource(20));
      expect(() =>
        scope.attachNavigation(null as unknown as HTMLElement),
      ).toThrow();
      expect(() =>
        scope.attachNavigation({} as unknown as HTMLElement),
      ).toThrow();
    });
  });

  describe("ViewportController and Sharing", () => {
    it("exposes viewport property and getViewportController()", () => {
      const source = createMockSource(20);
      const scope = new Sonoscope({ source });

      expect(scope.viewport).toBeDefined();
      expect(scope.getViewportController()).toBe(scope.viewport);
      expect(scope.viewport.getViewport().totalDuration).toBe(20);
    });

    it("forks a child Sonoscope sharing the audio source with independent viewport", () => {
      const source = createMockSource(30);
      const parent = new Sonoscope({ source, startTime: 0, endTime: 10 });
      const child = parent.fork({ startTime: 15, endTime: 25 });

      expect(child.source).toBe(parent.source);
      expect(child.getViewport().startTime).toBe(15);
      expect(child.getViewport().endTime).toBe(25);
      expect(parent.getViewport().startTime).toBe(0);
      expect(parent.getViewport().endTime).toBe(10);

      // Mutating child viewport does not affect parent
      child.pan(5);
      expect(child.getViewport().startTime).toBe(20);
      expect(parent.getViewport().startTime).toBe(0);
    });

    it("creates standalone unbound ViewportController via Sonoscope.createViewport()", () => {
      const vp = Sonoscope.createViewport({
        startTime: 2,
        endTime: 8,
        minFrequency: 100,
        maxFrequency: 8000,
      });

      expect(vp.getViewport().startTime).toBe(2);
      expect(vp.getViewport().endTime).toBe(8);
      expect(vp.getViewport().minFrequency).toBe(100);
      expect(vp.getViewport().maxFrequency).toBe(8000);

      vp.pan(3);
      expect(vp.getViewport().startTime).toBe(5);
      expect(vp.getViewport().endTime).toBe(11);
    });

    it("attaches navigation directly to standalone ViewportController", () => {
      const vp = Sonoscope.createViewport({
        startTime: 0,
        endTime: 10,
        totalDuration: 50,
      });

      const canvas = createMockCanvas();
      const detach = vp.attachNavigation(canvas);
      expect(typeof detach).toBe("function");

      const hasPointerEvents =
        typeof window !== "undefined" && "PointerEvent" in window;
      const downEvent = hasPointerEvents ? "pointerdown" : "mousedown";
      const moveEvent = hasPointerEvents ? "pointermove" : "mousemove";

      const down = canvas.listeners.get(downEvent)![0]!;
      const move = canvas.listeners.get(moveEvent)![0]!;

      down({
        button: 0,
        clientX: 50,
        clientY: 50,
        pointerId: 1,
      } as unknown as PointerEvent);

      move({
        button: 0,
        clientX: 25,
        clientY: 50,
        pointerId: 1,
      } as unknown as PointerEvent);

      expect(vp.getViewport().startTime).toBeCloseTo(2.5);
      expect(vp.getViewport().endTime).toBeCloseTo(12.5);

      detach();
      vp.destroy();
    });

    it("initializes with clipStart and clipEnd and clamps viewport", () => {
      const source = createMockSource(50);
      const scope = new Sonoscope({
        source,
        clipStart: 10,
        clipEnd: 25,
      });

      expect(scope.getClipBounds()).toEqual({ clipStart: 10, clipEnd: 25 });
      const vp = scope.getViewport();
      expect(vp.startTime).toBe(10);
      expect(vp.endTime).toBe(20); // 10s window by default starting at clipStart
    });

    it("enforces playback boundaries at clipStart and clipEnd", () => {
      const source = createMockSource(50);
      const audio = createMockAudio();
      audio.currentTime = 0; // Starts before clipStart

      const scope = new Sonoscope({
        source,
        audio,
        clipStart: 10,
        clipEnd: 25,
      });

      // Audio currentTime clamped to clipStart on attach
      expect(audio.currentTime).toBe(10);

      // Playhead advances past clipEnd -> should pause and clamp
      audio.currentTime = 26;
      audio.paused = false;
      audio.emit("timeupdate");

      expect(audio.currentTime).toBe(25);
      expect(audio.paused).toBe(true);

      // Seeking before clipStart clamps to clipStart
      scope.seek(5);
      expect(audio.currentTime).toBe(10);

      // Seeking past clipEnd clamps to clipEnd
      scope.seek(30);
      expect(audio.currentTime).toBe(25);
    });

    it("dynamically updates clip bounds via setClipBounds", () => {
      const source = createMockSource(50);
      const audio = createMockAudio();
      const scope = new Sonoscope({
        source,
        audio,
        clipStart: 10,
        clipEnd: 25,
      });

      let eventData:
        | {
            clipStart?: number | undefined;
            clipEnd?: number | undefined;
          }
        | undefined;
      scope.on("clipchange", (e) => {
        eventData = e;
      });

      scope.setClipBounds({ clipStart: 15, clipEnd: 30 });
      expect(scope.getClipBounds()).toEqual({ clipStart: 15, clipEnd: 30 });
      expect(eventData).toEqual({ clipStart: 15, clipEnd: 30 });

      // Viewport clamps to new bounds
      const vp = scope.getViewport();
      expect(vp.startTime).toBeGreaterThanOrEqual(15);
      expect(vp.endTime).toBeLessThanOrEqual(30);
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
