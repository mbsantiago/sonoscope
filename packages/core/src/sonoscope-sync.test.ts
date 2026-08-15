import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachCanvasNavigation } from "./navigation";
import { Sonoscope } from "./sonoscope";
import type { AudioSource } from "./types";
import { SpectrogramViewer } from "./viewer";
import { WaveformViewer } from "./waveform/viewer";

type MockAudio = HTMLAudioElement & {
  paused: boolean;
  emit(name: string): void;
  listenerCount(): number;
};

function createMockAudio(src = "fixture.wav", duration = 20): MockAudio {
  const listeners = new Map<string, Array<() => void>>();
  return {
    currentTime: 0,
    duration,
    src,
    currentSrc: src,
    paused: true,
    addEventListener: (name: string, fn: () => void) => {
      const arr = listeners.get(name) ?? [];
      arr.push(fn);
      listeners.set(name, arr);
    },
    removeEventListener: (name: string, fn: () => void) => {
      const arr = listeners.get(name) ?? [];
      listeners.set(
        name,
        arr.filter((f) => f !== fn),
      );
    },
    emit: (name: string) => {
      for (const fn of listeners.get(name) ?? []) {
        fn();
      }
    },
    listenerCount: () => {
      let count = 0;
      for (const arr of listeners.values()) count += arr.length;
      return count;
    },
  } as unknown as MockAudio;
}

type MockCanvas = HTMLCanvasElement & {
  listeners: Map<string, Array<EventListener>>;
  emit(name: string, event: Event): void;
};

function createMockCanvas(width = 400, height = 200): MockCanvas {
  const listeners = new Map<string, Array<EventListener>>();
  return {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    style: { cursor: "" },
    listeners,
    addEventListener: (name: string, fn: EventListener) => {
      const arr = listeners.get(name) ?? [];
      arr.push(fn);
      listeners.set(name, arr);
    },
    removeEventListener: (name: string, fn: EventListener) => {
      const arr = listeners.get(name) ?? [];
      listeners.set(
        name,
        arr.filter((f) => f !== fn),
      );
    },
    emit: (name: string, event: Event) => {
      for (const fn of listeners.get(name) ?? []) {
        fn(event);
      }
    },
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width,
      height,
      right: width,
      bottom: height,
    }),
    getContext: (type?: string) => {
      if (type === "webgl2") return null;
      return {
        save: vi.fn(),
        restore: vi.fn(),
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        fillText: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        setTransform: vi.fn(),
        createImageData: (w: number, h: number) => ({
          width: w,
          height: h,
          data: new Uint8ClampedArray(w * h * 4),
        }),
        putImageData: vi.fn(),
      };
    },
  } as unknown as MockCanvas;
}

function createMockSource(duration = 20, sampleRate = 44100): AudioSource {
  return {
    id: `sync-source-${duration}-${sampleRate}`,
    duration,
    sampleRate,
    channelCount: 1,
    read: ({ startTime, endTime }) => {
      const start = Math.floor(startTime * sampleRate);
      const end = Math.floor(endTime * sampleRate);
      const count = Math.max(0, end - start);
      const data = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        data[i] = Math.sin((start + i) * 0.05);
      }
      return data;
    },
  };
}

describe("Sonoscope Multi-Viewer Synchronization", () => {
  let frameCallbacks: FrameRequestCallback[] = [];

  beforeEach(() => {
    frameCallbacks = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((cb: FrameRequestCallback) => {
        frameCallbacks.push(cb);
        return frameCallbacks.length;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function flushAnimationFrames() {
    const cbs = [...frameCallbacks];
    frameCallbacks = [];
    for (const cb of cbs) {
      cb(performance.now());
    }
  }

  describe("Synchronized Initialization", () => {
    it("initializes SpectrogramViewer and WaveformViewer with shared Sonoscope state", () => {
      const source = createMockSource(30, 48000);
      const scope = new Sonoscope({
        source,
        startTime: 2,
        endTime: 10,
      });

      const specCanvas = createMockCanvas(400, 200);
      const waveCanvas = createMockCanvas(400, 100);

      const spectrogram = new SpectrogramViewer(scope, specCanvas, {
        colorMap: "magma",
      });
      const waveform = new WaveformViewer(scope, waveCanvas, {
        color: "#38bdf8",
      });

      expect(spectrogram.getScope()).toBe(scope);
      expect(waveform.getScope()).toBe(scope);
      expect(scope.source).toBe(source);
      expect(scope.getDuration()).toBe(30);
      expect(scope.getSampleRate()).toBe(48000);
      expect(spectrogram.getNyquist()).toBe(24000);

      expect(spectrogram.getViewport()).toMatchObject({
        startTime: 2,
        endTime: 10,
      });
      expect(waveform.getViewport()).toMatchObject({
        startTime: 2,
        endTime: 10,
      });
      expect(scope.getViewport()).toMatchObject({
        startTime: 2,
        endTime: 10,
      });
    });

    it("initializes viewers via Sonoscope factory helpers createSpectrogram and createWaveform", () => {
      const source = createMockSource(25, 44100);
      const scope = new Sonoscope({
        source,
        startTime: 1,
        endTime: 7,
      });

      const specCanvas = createMockCanvas();
      const waveCanvas = createMockCanvas();

      const spectrogram = scope.createSpectrogram(specCanvas);
      const waveform = scope.createWaveform(waveCanvas);

      expect(spectrogram.getScope()).toBe(scope);
      expect(waveform.getScope()).toBe(scope);
      expect(spectrogram.getViewport().startTime).toBeCloseTo(1);
      expect(spectrogram.getViewport().endTime).toBeCloseTo(7);
      expect(waveform.getViewport().startTime).toBeCloseTo(1);
      expect(waveform.getViewport().endTime).toBeCloseTo(7);
    });
  });

  describe("Viewport Synchronization via Sonoscope Coordinator", () => {
    it("synchronizes setViewport across both viewers simultaneously and emits viewportchange", () => {
      const source = createMockSource(20);
      const scope = new Sonoscope({ source, startTime: 0, endTime: 5 });

      const spectrogram = new SpectrogramViewer(scope, createMockCanvas());
      const waveform = new WaveformViewer(scope, createMockCanvas());

      const specEvents: Array<{ startTime: number; endTime: number }> = [];
      const waveEvents: Array<{ startTime: number; endTime: number }> = [];
      const scopeEvents: Array<{ startTime: number; endTime: number }> = [];

      spectrogram.on("viewportchange", (e) => {
        specEvents.push({
          startTime: e.viewport.startTime,
          endTime: e.viewport.endTime,
        });
      });
      waveform.on("viewportchange", (e) => {
        waveEvents.push({
          startTime: e.viewport.startTime,
          endTime: e.viewport.endTime,
        });
      });
      scope.on("viewportchange", (e) => {
        scopeEvents.push({
          startTime: e.viewport.startTime,
          endTime: e.viewport.endTime,
        });
      });

      const specRenderSpy = vi.spyOn(spectrogram, "requestRender");
      const waveRenderSpy = vi.spyOn(waveform, "requestRender");

      scope.setViewport({ startTime: 4, endTime: 12 }, "control-panel");

      expect(scope.getViewport().startTime).toBe(4);
      expect(scope.getViewport().endTime).toBe(12);

      expect(spectrogram.getViewport().startTime).toBe(4);
      expect(spectrogram.getViewport().endTime).toBe(12);

      expect(waveform.getViewport().startTime).toBe(4);
      expect(waveform.getViewport().endTime).toBe(12);

      expect(scopeEvents).toEqual([{ startTime: 4, endTime: 12 }]);
      expect(specEvents).toEqual([{ startTime: 4, endTime: 12 }]);
      expect(waveEvents).toEqual([{ startTime: 4, endTime: 12 }]);

      expect(specRenderSpy).toHaveBeenCalledTimes(1);
      expect(waveRenderSpy).toHaveBeenCalledTimes(1);
    });

    it("synchronizes scope.pan() and scope.panTo() across both viewers", () => {
      const source = createMockSource(20);
      const scope = new Sonoscope({ source, startTime: 2, endTime: 8 });

      const spectrogram = new SpectrogramViewer(scope, createMockCanvas());
      const waveform = new WaveformViewer(scope, createMockCanvas());

      scope.pan(3);
      expect(scope.getViewport().startTime).toBeCloseTo(5);
      expect(scope.getViewport().endTime).toBeCloseTo(11);
      expect(spectrogram.getViewport().startTime).toBeCloseTo(5);
      expect(spectrogram.getViewport().endTime).toBeCloseTo(11);
      expect(waveform.getViewport().startTime).toBeCloseTo(5);
      expect(waveform.getViewport().endTime).toBeCloseTo(11);

      scope.panTo(1);
      expect(scope.getViewport().startTime).toBeCloseTo(1);
      expect(scope.getViewport().endTime).toBeCloseTo(7);
      expect(spectrogram.getViewport().startTime).toBeCloseTo(1);
      expect(spectrogram.getViewport().endTime).toBeCloseTo(7);
      expect(waveform.getViewport().startTime).toBeCloseTo(1);
      expect(waveform.getViewport().endTime).toBeCloseTo(7);
    });

    it("synchronizes scope.zoom() across both viewers", () => {
      const source = createMockSource(30);
      const scope = new Sonoscope({ source, startTime: 10, endTime: 20 });

      const spectrogram = new SpectrogramViewer(scope, createMockCanvas());
      const waveform = new WaveformViewer(scope, createMockCanvas());

      // Zoom in 2x (factor 0.5) centered at 15
      scope.zoom(0.5, 15);

      expect(scope.getViewport().duration).toBeCloseTo(5);
      expect(scope.getViewport().startTime).toBeCloseTo(12.5);
      expect(scope.getViewport().endTime).toBeCloseTo(17.5);

      expect(spectrogram.getViewport().startTime).toBeCloseTo(12.5);
      expect(spectrogram.getViewport().endTime).toBeCloseTo(17.5);

      expect(waveform.getViewport().startTime).toBeCloseTo(12.5);
      expect(waveform.getViewport().endTime).toBeCloseTo(17.5);
    });
  });

  describe("Cross-Viewer Updates", () => {
    it("updates SpectrogramViewer when WaveformViewer modifies viewport", () => {
      const source = createMockSource(20);
      const scope = new Sonoscope({ source, startTime: 0, endTime: 10 });

      const spectrogram = new SpectrogramViewer(scope, createMockCanvas());
      const waveform = new WaveformViewer(scope, createMockCanvas());

      const specRenderSpy = vi.spyOn(spectrogram, "requestRender");

      waveform.updateViewport({ startTime: 1, endTime: 3 });

      expect(scope.getViewport().startTime).toBeCloseTo(1);
      expect(scope.getViewport().endTime).toBeCloseTo(3);
      expect(waveform.getViewport().startTime).toBeCloseTo(1);
      expect(waveform.getViewport().endTime).toBeCloseTo(3);
      expect(spectrogram.getViewport().startTime).toBeCloseTo(1);
      expect(spectrogram.getViewport().endTime).toBeCloseTo(3);
      expect(specRenderSpy).toHaveBeenCalled();
    });

    it("updates WaveformViewer when SpectrogramViewer modifies viewport", () => {
      const source = createMockSource(20);
      const scope = new Sonoscope({ source, startTime: 0, endTime: 10 });

      const spectrogram = new SpectrogramViewer(scope, createMockCanvas());
      const waveform = new WaveformViewer(scope, createMockCanvas());

      const waveRenderSpy = vi.spyOn(waveform, "requestRender");

      spectrogram.updateViewport({ startTime: 4, endTime: 9 });

      expect(scope.getViewport().startTime).toBeCloseTo(4);
      expect(scope.getViewport().endTime).toBeCloseTo(9);
      expect(spectrogram.getViewport().startTime).toBeCloseTo(4);
      expect(spectrogram.getViewport().endTime).toBeCloseTo(9);
      expect(waveform.getViewport().startTime).toBeCloseTo(4);
      expect(waveform.getViewport().endTime).toBeCloseTo(9);
      expect(waveRenderSpy).toHaveBeenCalled();
    });

    it("synchronizes time zooms initiated from scope across SpectrogramViewer and WaveformViewer", () => {
      const source = createMockSource(20);
      const scope = new Sonoscope({ source, startTime: 2, endTime: 10 });

      const spectrogram = new SpectrogramViewer(scope, createMockCanvas());
      const waveform = new WaveformViewer(scope, createMockCanvas());

      // Zoom time via scope (duration 8 -> 4, center 6)
      scope.zoom(0.5, 6);

      expect(scope.getViewport().startTime).toBeCloseTo(4);
      expect(scope.getViewport().endTime).toBeCloseTo(8);
      expect(spectrogram.getViewport().startTime).toBeCloseTo(4);
      expect(spectrogram.getViewport().endTime).toBeCloseTo(8);
      expect(waveform.getViewport().startTime).toBeCloseTo(4);
      expect(waveform.getViewport().endTime).toBeCloseTo(8);

      // Zoom time out via scope (duration 4 -> 8, center 6)
      scope.zoom(2.0, 6);

      expect(scope.getViewport().startTime).toBeCloseTo(2);
      expect(scope.getViewport().endTime).toBeCloseTo(10);
      expect(spectrogram.getViewport().startTime).toBeCloseTo(2);
      expect(spectrogram.getViewport().endTime).toBeCloseTo(10);
      expect(waveform.getViewport().startTime).toBeCloseTo(2);
      expect(waveform.getViewport().endTime).toBeCloseTo(10);
    });
  });

  describe("Canvas Navigation Synchronization", () => {
    it("synchronizes horizontal wheel panning from Spectrogram canvas to Waveform", () => {
      const source = createMockSource(20);
      const scope = new Sonoscope({ source, startTime: 4, endTime: 8 });

      const specCanvas = createMockCanvas(400, 200);
      const waveCanvas = createMockCanvas(400, 100);

      const spectrogram = new SpectrogramViewer(scope, specCanvas);
      const waveform = new WaveformViewer(scope, waveCanvas);

      const cleanup = attachCanvasNavigation(spectrogram, specCanvas);

      // Trigger wheel event on spectrogram canvas (pan right)
      specCanvas.emit("wheel", {
        preventDefault: vi.fn(),
        deltaY: 130,
        shiftKey: false,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        clientX: 200,
        clientY: 100,
      } as unknown as WheelEvent);

      flushAnimationFrames();

      expect(spectrogram.getViewport().startTime).toBeGreaterThan(4);
      expect(waveform.getViewport().startTime).toBe(
        spectrogram.getViewport().startTime,
      );
      expect(waveform.getViewport().endTime).toBe(
        spectrogram.getViewport().endTime,
      );
      expect(scope.getViewport().startTime).toBe(
        spectrogram.getViewport().startTime,
      );

      cleanup();
    });

    it("synchronizes drag navigation from Waveform canvas to Spectrogram", () => {
      const source = createMockSource(20);
      const scope = new Sonoscope({ source, startTime: 2, endTime: 6 });

      const specCanvas = createMockCanvas(400, 200);
      const waveCanvas = createMockCanvas(400, 100);

      const spectrogram = new SpectrogramViewer(scope, specCanvas);
      const waveform = new WaveformViewer(scope, waveCanvas);

      const cleanup = attachCanvasNavigation(waveform, waveCanvas);

      // Drag on waveform canvas to the left (dx = -100px on 400px width canvas => pans forward in time by (100/400)*4 = 1s)
      waveCanvas.emit("mousedown", {
        button: 0,
        clientX: 200,
        clientY: 50,
      } as unknown as MouseEvent);

      waveCanvas.emit("mousemove", {
        button: 0,
        clientX: 100,
        clientY: 50,
      } as unknown as MouseEvent);

      waveCanvas.emit("mouseup", {
        button: 0,
        clientX: 100,
        clientY: 50,
      } as unknown as MouseEvent);

      expect(waveform.getViewport().startTime).toBeCloseTo(3);
      expect(waveform.getViewport().endTime).toBeCloseTo(7);
      expect(spectrogram.getViewport().startTime).toBeCloseTo(3);
      expect(spectrogram.getViewport().endTime).toBeCloseTo(7);
      expect(scope.getViewport().startTime).toBeCloseTo(3);
      expect(scope.getViewport().endTime).toBeCloseTo(7);

      cleanup();
    });

    it("synchronizes drag navigation from Spectrogram canvas to Waveform", () => {
      const source = createMockSource(20);
      const scope = new Sonoscope({ source, startTime: 5, endTime: 9 });

      const specCanvas = createMockCanvas(400, 200);
      const waveCanvas = createMockCanvas(400, 100);

      const spectrogram = new SpectrogramViewer(scope, specCanvas);
      const waveform = new WaveformViewer(scope, waveCanvas);

      const cleanup = attachCanvasNavigation(spectrogram, specCanvas);

      // Drag on spectrogram canvas to the right (dx = +100px => pans back in time by 1s)
      specCanvas.emit("mousedown", {
        button: 0,
        clientX: 100,
        clientY: 100,
      } as unknown as MouseEvent);

      specCanvas.emit("mousemove", {
        button: 0,
        clientX: 200,
        clientY: 100,
      } as unknown as MouseEvent);

      specCanvas.emit("mouseup", {
        button: 0,
        clientX: 200,
        clientY: 100,
      } as unknown as MouseEvent);

      expect(spectrogram.getViewport().startTime).toBeCloseTo(4);
      expect(spectrogram.getViewport().endTime).toBeCloseTo(8);
      expect(waveform.getViewport().startTime).toBeCloseTo(4);
      expect(waveform.getViewport().endTime).toBeCloseTo(8);
      expect(scope.getViewport().startTime).toBeCloseTo(4);
      expect(scope.getViewport().endTime).toBeCloseTo(8);

      cleanup();
    });
  });

  describe("Playback Synchronization", () => {
    it("attaches companion audio element to Sonoscope and synchronizes across viewers", () => {
      const source = createMockSource(20);
      const scope = new Sonoscope({ source, startTime: 0, endTime: 10 });
      const audio = createMockAudio("audio.wav", 20);

      const spectrogram = new SpectrogramViewer(scope, createMockCanvas());
      const waveform = new WaveformViewer(scope, createMockCanvas());

      scope.attachAudio(audio);

      expect(scope.getAudio()).toBe(audio);
      expect(spectrogram.getScope().getAudio()).toBe(audio);
      expect(waveform.getScope().getAudio()).toBe(audio);

      const specRenderSpy = vi.spyOn(spectrogram, "requestRender");
      const waveRenderSpy = vi.spyOn(waveform, "requestRender");

      // Seek on scope
      scope.seek(6.5);
      expect(audio.currentTime).toBe(6.5);
      expect(scope.getCurrentTime()).toBe(6.5);

      // Audio emit timeupdate
      audio.currentTime = 8.2;
      audio.emit("timeupdate");
      expect(scope.getCurrentTime()).toBe(8.2);
      expect(waveRenderSpy).toHaveBeenCalled();

      // Viewport change on scope triggers requestRender on both
      scope.setViewport({ startTime: 5, endTime: 15 });
      expect(specRenderSpy).toHaveBeenCalled();
    });

    it("pages viewport simultaneously on both viewers when followPlayback is page", () => {
      const source = createMockSource(30);
      const audio = createMockAudio("audio.wav", 30);
      const scope = new Sonoscope({
        source,
        audio,
        startTime: 0,
        endTime: 10,
        followPlayback: "page",
      });

      const spectrogram = new SpectrogramViewer(scope, createMockCanvas());
      const waveform = new WaveformViewer(scope, createMockCanvas());

      expect(scope.getViewport().startTime).toBe(0);
      expect(scope.getViewport().endTime).toBe(10);

      // Playback reaches 10.5 (past endTime of page 0..10)
      audio.currentTime = 10.5;
      audio.emit("timeupdate");

      expect(scope.getViewport().startTime).toBeCloseTo(10.5);
      expect(scope.getViewport().endTime).toBeCloseTo(20.5);
      expect(spectrogram.getViewport().startTime).toBeCloseTo(10.5);
      expect(spectrogram.getViewport().endTime).toBeCloseTo(20.5);
      expect(waveform.getViewport().startTime).toBeCloseTo(10.5);
      expect(waveform.getViewport().endTime).toBeCloseTo(20.5);
    });

    it("detaches audio cleanly from Sonoscope and viewers", () => {
      const source = createMockSource(20);
      const audio = createMockAudio();
      const scope = new Sonoscope({ source, audio });

      const spectrogram = new SpectrogramViewer(scope, createMockCanvas());
      const waveform = new WaveformViewer(scope, createMockCanvas());

      expect(scope.getAudio()).toBe(audio);
      expect(spectrogram.getScope().getAudio()).toBe(audio);
      expect(waveform.getScope().getAudio()).toBe(audio);

      scope.detachAudio();

      expect(scope.getAudio()).toBeUndefined();
      expect(spectrogram.getScope().getAudio()).toBeUndefined();
      expect(waveform.getScope().getAudio()).toBeUndefined();
    });
  });

  describe("Independent Frequency Control", () => {
    it("modifying frequency viewport on SpectrogramViewer does not alter WaveformViewer or Sonoscope time bounds", () => {
      const source = createMockSource(20, 48000);
      const scope = new Sonoscope({ source, startTime: 3, endTime: 9 });

      const spectrogram = new SpectrogramViewer(scope, createMockCanvas(), {
        minFrequency: 0,
        maxFrequency: 24000,
      });
      const waveform = new WaveformViewer(scope, createMockCanvas());

      const waveViewportSpy = vi.fn();
      waveform.on("viewportchange", waveViewportSpy);

      // Update frequency range on spectrogram
      spectrogram.updateViewport({
        minFrequency: 500,
        maxFrequency: 8000,
        frequencyScale: "mel",
      });

      // Spectrogram frequency updated
      expect(spectrogram.getViewport()).toMatchObject({
        startTime: 3,
        endTime: 9,
        minFrequency: 500,
        maxFrequency: 8000,
        frequencyScale: "mel",
      });

      // Waveform viewport time bounds completely unchanged
      expect(waveform.getViewport()).toEqual({
        startTime: 3,
        endTime: 9,
      });

      // Scope viewport time bounds unchanged
      expect(scope.getViewport()).toMatchObject({
        startTime: 3,
        endTime: 9,
      });

      // Waveform viewportchange event not fired for frequency-only change
      expect(waveViewportSpy).not.toHaveBeenCalled();

      // Zoom frequency on spectrogram
      spectrogram.zoomFreq(0.5, 4000);
      expect(spectrogram.getViewport().minFrequency).toBeCloseTo(2250);
      expect(spectrogram.getViewport().maxFrequency).toBeCloseTo(6000);
      expect(waveform.getViewport().startTime).toBe(3);
      expect(waveform.getViewport().endTime).toBe(9);
    });
  });

  describe("Lifecycle Cleanup", () => {
    it("disconnects single viewer on destroy() without destroying scope or sibling viewer", () => {
      const source = createMockSource(20);
      const scope = new Sonoscope({ source, startTime: 0, endTime: 8 });

      const spectrogram = new SpectrogramViewer(scope, createMockCanvas());
      const waveform = new WaveformViewer(scope, createMockCanvas());

      const specRenderSpy = vi.spyOn(spectrogram, "requestRender");
      const waveRenderSpy = vi.spyOn(waveform, "requestRender");
      const scopeDestroySpy = vi.spyOn(scope, "destroy");

      // Destroy spectrogram only
      spectrogram.destroy();

      expect(scopeDestroySpy).not.toHaveBeenCalled();

      // Pan scope
      scope.pan(2);

      // Sibling waveform updates
      expect(waveform.getViewport().startTime).toBeCloseTo(2);
      expect(waveform.getViewport().endTime).toBeCloseTo(10);
      expect(waveRenderSpy).toHaveBeenCalled();

      // Destroyed spectrogram does NOT request render or update
      expect(specRenderSpy).not.toHaveBeenCalled();
    });

    it("destroys Sonoscope cleanly and notifies listeners", () => {
      const source = createMockSource(20);
      const audio = createMockAudio();
      const scope = new Sonoscope({ source, audio });

      let scopeDestroyed = false;
      scope.on("destroy", () => {
        scopeDestroyed = true;
      });

      const spectrogram = new SpectrogramViewer(scope, createMockCanvas());
      const waveform = new WaveformViewer(scope, createMockCanvas());

      scope.destroy();

      expect(scopeDestroyed).toBe(true);
      expect(scope.getAudio()).toBeUndefined();
      expect(audio.listenerCount()).toBe(0);

      spectrogram.destroy();
      waveform.destroy();
    });
  });
});
