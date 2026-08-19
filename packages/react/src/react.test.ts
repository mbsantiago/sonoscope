import {
  type AudioSource,
  FrequencyRulerViewer,
  Sonoscope,
  SpectrogramViewer,
  TimeRulerViewer,
  WaveformViewer,
} from "@sonoscope/core";
import React, { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FrequencyRuler,
  type FrequencyRulerHandle,
  SonoscopeContext,
  SonoscopeProvider,
  Spectrogram,
  type SpectrogramHandle,
  TimeRuler,
  type TimeRulerHandle,
  type UseSonoscopeResult,
  useSonoscope,
  useSonoscopeContext,
  useSpectrogram,
  Waveform,
  type WaveformHandle,
} from "./index";

function createMockAudioSource(duration = 10, sampleRate = 44100): AudioSource {
  return {
    id: "mock-source-id",
    duration,
    sampleRate,
    channelCount: 1,
    read: vi.fn(
      async (options: {
        channel: number;
        startTime: number;
        endTime: number;
      }) => {
        const lengthSec = Math.max(0, options.endTime - options.startTime);
        const numSamples = Math.floor(lengthSec * sampleRate);
        return new Float32Array(numSamples);
      },
    ),
  };
}

function createMock2DContext() {
  return {
    canvas: {} as HTMLCanvasElement,
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 50 })),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createPattern: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn((_x, _y, w = 1, h = 1) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    })),
    putImageData: vi.fn(),
    setTransform: vi.fn(),
    resetTransform: vi.fn(),
  };
}

class MockDOMElement {
  nodeType: number;
  nodeName: string;
  tagName: string;
  childNodes: MockDOMElement[] = [];
  parentNode: MockDOMElement | null = null;
  ownerDocument: unknown = null;
  style: Record<string, string> = {};
  attributes: Record<string, string> = {};
  width = 800;
  height = 400;
  clientWidth = 800;
  clientHeight = 400;
  className = "";
  private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  classList = {
    add: (cls: string) => {
      const classes = (this.className || "").split(/\s+/).filter(Boolean);
      if (!classes.includes(cls)) classes.push(cls);
      this.className = classes.join(" ");
      this.attributes.class = this.className;
    },
    remove: (cls: string) => {
      const classes = (this.className || "").split(/\s+/).filter(Boolean);
      this.className = classes.filter((c) => c !== cls).join(" ");
      this.attributes.class = this.className;
    },
    contains: (cls: string) => {
      return (this.className || "").split(/\s+/).includes(cls);
    },
  };

  get parentElement(): MockDOMElement | null {
    return this.parentNode;
  }

  constructor(nodeType = 1, nodeName = "DIV") {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.tagName = nodeName;
  }

  appendChild(child: MockDOMElement) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild(child: MockDOMElement) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) this.childNodes.splice(idx, 1);
    child.parentNode = null;
    return child;
  }

  insertBefore(newChild: MockDOMElement, refChild: MockDOMElement) {
    const idx = this.childNodes.indexOf(refChild);
    if (idx !== -1) this.childNodes.splice(idx, 0, newChild);
    else this.appendChild(newChild);
    newChild.parentNode = this;
    return newChild;
  }

  setAttribute(k: string, v: string) {
    this.attributes[k] = v;
  }

  removeAttribute(k: string) {
    delete this.attributes[k];
  }

  addEventListener(type: string, handler: (...args: unknown[]) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, handler: (...args: unknown[]) => void) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      list.filter((h) => h !== handler),
    );
  }

  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      width: this.width,
      height: this.height,
      right: this.width,
      bottom: this.height,
    };
  }

  getContext(type: string) {
    if (type === "2d") {
      return createMock2DContext();
    }
    return null;
  }
}

// Setup mock DOM environment for React 19 testing in Node
function setupMockDom() {
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const doc = {
    nodeType: 9,
    nodeName: "#document",
    documentElement: new MockDOMElement(1, "HTML"),
    createElement(tag: string) {
      const el = new MockDOMElement(1, tag.toUpperCase());
      el.ownerDocument = doc;
      if (tag === "canvas") {
        el.width = 800;
        el.height = 400;
      }
      return el;
    },
    createTextNode(text: string) {
      const node = new MockDOMElement(3, "#text");
      node.ownerDocument = doc;
      (node as unknown as { nodeValue: string }).nodeValue = text;
      return node;
    },
    createComment(text: string) {
      const node = new MockDOMElement(8, "#comment");
      node.ownerDocument = doc;
      (node as unknown as { nodeValue: string }).nodeValue = text;
      return node;
    },
    addEventListener() {},
    removeEventListener() {},
  };

  (globalThis as unknown as { document: unknown }).document = doc;
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { HTMLCanvasElement: unknown }).HTMLCanvasElement =
    MockDOMElement;
  (globalThis as unknown as { HTMLAudioElement: unknown }).HTMLAudioElement =
    MockDOMElement;
  (globalThis as unknown as { HTMLIFrameElement: unknown }).HTMLIFrameElement =
    class {};
  (globalThis as unknown as { Element: unknown }).Element = MockDOMElement;
  (globalThis as unknown as { HTMLElement: unknown }).HTMLElement =
    MockDOMElement;
  (
    globalThis as unknown as { requestAnimationFrame: unknown }
  ).requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0);
  (
    globalThis as unknown as { cancelAnimationFrame: unknown }
  ).cancelAnimationFrame = (id: number) => clearTimeout(id);
}

describe("@sonoscope/react exports", () => {
  it("exports all required components, hooks, and context helpers", () => {
    expect(typeof SonoscopeContext).toBe("object");
    expect(typeof SonoscopeProvider).toBe("function");
    expect(typeof useSonoscopeContext).toBe("function");
    expect(typeof useSonoscope).toBe("function");
    expect(typeof Waveform).toBe("object");
    expect(typeof Spectrogram).toBe("object");
    expect(typeof useSpectrogram).toBe("function");
  });
});

describe("React Components and Hooks", () => {
  let container: MockDOMElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    setupMockDom();
    container = (
      document as unknown as { createElement: (t: string) => MockDOMElement }
    ).createElement("div");
    root = createRoot(container as unknown as HTMLElement);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    vi.restoreAllMocks();
  });

  describe("SonoscopeContext & SonoscopeProvider", () => {
    it("provides null by default when outside provider", async () => {
      const captured = {
        current: "initial" as unknown as Sonoscope | null,
      };
      function Consumer() {
        captured.current = useSonoscopeContext();
        return null;
      }

      await act(async () => {
        root.render(React.createElement(Consumer));
      });

      expect(captured.current).toBeNull();
    });

    it("provides Sonoscope instance across children tree", async () => {
      const source = createMockAudioSource(10);
      const scope = new Sonoscope(source);
      const captured = { current: null as Sonoscope | null };

      function Consumer() {
        captured.current = useSonoscopeContext();
        return null;
      }

      await act(async () => {
        root.render(
          React.createElement(
            SonoscopeProvider,
            { value: scope },
            React.createElement(Consumer),
          ),
        );
      });

      expect(captured.current).toBe(scope);
      scope.destroy();
    });

    it("creates and provides Sonoscope instance from direct options props", async () => {
      const source = createMockAudioSource(10);
      const captured = { current: null as Sonoscope | null };

      function Consumer() {
        captured.current = useSonoscopeContext();
        return null;
      }

      await act(async () => {
        root.render(
          React.createElement(
            SonoscopeProvider,
            { source },
            React.createElement(Consumer),
          ),
        );
      });

      expect(captured.current).toBeInstanceOf(Sonoscope);
    });
  });

  describe("useSonoscope", () => {
    it("returns null scope when no source/url/audio given", async () => {
      const resultRef = { current: null as UseSonoscopeResult | null };
      function HookTest() {
        resultRef.current = useSonoscope({});
        return null;
      }

      await act(async () => {
        root.render(React.createElement(HookTest));
      });

      expect(resultRef.current?.scope).toBeNull();
      expect(resultRef.current?.loading).toBe(false);
      expect(resultRef.current?.error).toBeNull();
    });

    it("creates Sonoscope from AudioSource synchronously in effect", async () => {
      const source = createMockAudioSource(12);
      const resultRef = { current: null as UseSonoscopeResult | null };

      function HookTest() {
        resultRef.current = useSonoscope({ source, startTime: 1, endTime: 5 });
        return null;
      }

      await act(async () => {
        root.render(React.createElement(HookTest));
      });

      expect(resultRef.current?.loading).toBe(false);
      expect(resultRef.current?.error).toBeNull();
      expect(resultRef.current?.scope).toBeInstanceOf(Sonoscope);
      expect(resultRef.current?.scope?.getDuration()).toBe(12);
      expect(resultRef.current?.scope?.getViewport().startTime).toBe(1);
      expect(resultRef.current?.scope?.getViewport().endTime).toBe(5);
    });

    it("handles async fromUrl loading and errors", async () => {
      vi.spyOn(Sonoscope, "fromUrl").mockImplementation(async (url) => {
        if (url === "bad-url") throw new Error("Failed to load audio");
        return new Sonoscope(createMockAudioSource(8));
      });

      const resultRef = { current: null as UseSonoscopeResult | null };
      function HookTest({ url }: { url: string }) {
        resultRef.current = useSonoscope({ url });
        return null;
      }

      await act(async () => {
        root.render(React.createElement(HookTest, { url: "good-url" }));
      });

      expect(resultRef.current?.loading).toBe(false);
      expect(resultRef.current?.error).toBeNull();
      expect(resultRef.current?.scope).toBeInstanceOf(Sonoscope);
      expect(resultRef.current?.scope?.getDuration()).toBe(8);

      await act(async () => {
        root.render(React.createElement(HookTest, { url: "bad-url" }));
      });

      expect(resultRef.current?.loading).toBe(false);
      expect(resultRef.current?.error?.message).toBe("Failed to load audio");
      expect(resultRef.current?.scope).toBeNull();
    });

    it("destroys created Sonoscope on unmount", async () => {
      const source = createMockAudioSource(10);
      const created = { scope: null as Sonoscope | null };

      function HookTest() {
        const res = useSonoscope({ source });
        created.scope = res.scope;
        return null;
      }

      await act(async () => {
        root.render(React.createElement(HookTest));
      });

      expect(created.scope).toBeInstanceOf(Sonoscope);
      const destroySpy = vi.spyOn(created.scope!, "destroy");

      await act(async () => {
        root.unmount();
      });

      expect(destroySpy).toHaveBeenCalled();
    });

    it("initializes Sonoscope from array and sampleRate", async () => {
      const samples = new Float32Array(44100 * 2);
      const resultRef = { current: null as UseSonoscopeResult | null };

      function HookTest() {
        resultRef.current = useSonoscope({ array: samples, sampleRate: 44100 });
        return null;
      }

      await act(async () => {
        root.render(React.createElement(HookTest));
      });

      expect(resultRef.current?.loading).toBe(false);
      expect(resultRef.current?.error).toBeNull();
      expect(resultRef.current?.scope).toBeInstanceOf(Sonoscope);
      expect(resultRef.current?.scope?.getDuration()).toBe(2);
      expect(resultRef.current?.scope?.getSampleRate()).toBe(44100);
    });

    it("initializes Sonoscope from Blob", async () => {
      const blob = new Blob([new Uint8Array(100)]);
      vi.spyOn(Sonoscope, "fromBlob").mockResolvedValue(
        new Sonoscope(createMockAudioSource(5, 48000)),
      );

      const resultRef = { current: null as UseSonoscopeResult | null };
      function HookTest() {
        resultRef.current = useSonoscope({ blob });
        return null;
      }

      await act(async () => {
        root.render(React.createElement(HookTest));
      });

      expect(resultRef.current?.loading).toBe(false);
      expect(resultRef.current?.error).toBeNull();
      expect(resultRef.current?.scope).toBeInstanceOf(Sonoscope);
      expect(resultRef.current?.scope?.getDuration()).toBe(5);
    });

    it("initializes Sonoscope from Buffer", async () => {
      const buffer = new ArrayBuffer(100);
      vi.spyOn(Sonoscope, "fromBuffer").mockResolvedValue(
        new Sonoscope(createMockAudioSource(7, 44100)),
      );

      const resultRef = { current: null as UseSonoscopeResult | null };
      function HookTest() {
        resultRef.current = useSonoscope({ buffer });
        return null;
      }

      await act(async () => {
        root.render(React.createElement(HookTest));
      });

      expect(resultRef.current?.loading).toBe(false);
      expect(resultRef.current?.error).toBeNull();
      expect(resultRef.current?.scope).toBeInstanceOf(Sonoscope);
      expect(resultRef.current?.scope?.getDuration()).toBe(7);
    });
  });

  describe("<Waveform />", () => {
    it("renders canvas and creates WaveformViewer from direct scope prop", async () => {
      const source = createMockAudioSource(15);
      const scope = new Sonoscope(source);
      const ref = createRef<WaveformHandle>();
      const onReady = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(Waveform, {
            ref,
            scope,
            amplitudeScale: 1.5,
            color: "#ff0000",
            onReady,
          }),
        );
      });

      expect(ref.current?.getCanvas()).toBeTruthy();
      expect(ref.current?.getViewer()).toBeInstanceOf(WaveformViewer);
      expect(onReady).toHaveBeenCalledWith(ref.current?.getViewer());

      scope.destroy();
    });

    it("reads scope from SonoscopeProvider context when scope prop is omitted", async () => {
      const source = createMockAudioSource(20);
      const scope = new Sonoscope(source);
      const ref = createRef<WaveformHandle>();

      await act(async () => {
        root.render(
          React.createElement(
            SonoscopeProvider,
            { value: scope },
            React.createElement(Waveform, { ref }),
          ),
        );
      });

      expect(ref.current?.getViewer()).toBeInstanceOf(WaveformViewer);

      scope.destroy();
    });

    it("reactively updates viewer config on prop changes", async () => {
      const source = createMockAudioSource(10);
      const scope = new Sonoscope(source);
      const ref = createRef<WaveformHandle>();

      function TestApp({ color }: { color: string }) {
        return React.createElement(Waveform, {
          ref,
          scope,
          color,
        });
      }

      await act(async () => {
        root.render(React.createElement(TestApp, { color: "#111111" }));
      });

      const viewer = ref.current?.getViewer();
      expect(viewer).toBeTruthy();
      const updateSpy = vi.spyOn(viewer!, "updateConfig");

      await act(async () => {
        root.render(React.createElement(TestApp, { color: "#222222" }));
      });

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ color: "#222222" }),
      );

      scope.destroy();
    });

    it("destroys WaveformViewer on unmount", async () => {
      const source = createMockAudioSource(10);
      const scope = new Sonoscope(source);
      const ref = createRef<WaveformHandle>();

      await act(async () => {
        root.render(React.createElement(Waveform, { ref, scope }));
      });

      const viewer = ref.current?.getViewer();
      expect(viewer).toBeTruthy();
      const destroySpy = vi.spyOn(viewer!, "destroy");

      await act(async () => {
        root.unmount();
      });

      expect(destroySpy).toHaveBeenCalled();
      scope.destroy();
    });
  });

  describe("<Spectrogram />", () => {
    it("renders canvas and creates SpectrogramViewer from scope prop", async () => {
      const source = createMockAudioSource(15);
      const scope = new Sonoscope(source);
      const ref = createRef<SpectrogramHandle>();
      const onReady = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(Spectrogram, {
            ref,
            scope,
            colorMap: "viridis",
            onReady,
          }),
        );
      });

      expect(ref.current?.getCanvas()).toBeTruthy();
      expect(ref.current?.getViewer()).toBeInstanceOf(SpectrogramViewer);
      expect(onReady).toHaveBeenCalled();

      scope.destroy();
    });

    it("reads scope from SonoscopeProvider context", async () => {
      const source = createMockAudioSource(20);
      const scope = new Sonoscope(source);
      const ref = createRef<SpectrogramHandle>();

      await act(async () => {
        root.render(
          React.createElement(
            SonoscopeProvider,
            { value: scope },
            React.createElement(Spectrogram, { ref }),
          ),
        );
      });

      expect(ref.current?.getViewer()).toBeInstanceOf(SpectrogramViewer);

      scope.destroy();
    });

    it("supports standalone source prop without scope", async () => {
      const source = createMockAudioSource(10);
      const ref = createRef<SpectrogramHandle>();

      await act(async () => {
        root.render(
          React.createElement(Spectrogram, {
            ref,
            source,
          }),
        );
      });

      expect(ref.current?.getViewer()).toBeInstanceOf(SpectrogramViewer);
    });

    it("reactively updates spectrogram config on prop changes", async () => {
      const source = createMockAudioSource(10);
      const scope = new Sonoscope(source);
      const ref = createRef<SpectrogramHandle>();

      function TestApp({ colorMap }: { colorMap: "viridis" | "magma" }) {
        return React.createElement(Spectrogram, {
          ref,
          scope,
          colorMap,
        });
      }

      await act(async () => {
        root.render(React.createElement(TestApp, { colorMap: "viridis" }));
      });

      const viewer = ref.current?.getViewer();
      expect(viewer).toBeTruthy();
      const updateSpy = vi.spyOn(viewer!, "updateConfig");

      await act(async () => {
        root.render(React.createElement(TestApp, { colorMap: "magma" }));
      });

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ colorMap: "magma" }),
      );

      scope.destroy();
    });

    it("destroys SpectrogramViewer on unmount", async () => {
      const source = createMockAudioSource(10);
      const scope = new Sonoscope(source);
      const ref = createRef<SpectrogramHandle>();

      await act(async () => {
        root.render(React.createElement(Spectrogram, { ref, scope }));
      });

      const viewer = ref.current?.getViewer();
      expect(viewer).toBeTruthy();
      const destroySpy = vi.spyOn(viewer!, "destroy");

      await act(async () => {
        root.unmount();
      });

      expect(destroySpy).toHaveBeenCalled();
      scope.destroy();
    });

    it("attaches DOM playhead overlay and updates transform on scope timeupdate", async () => {
      const source = createMockAudioSource(10);
      const scope = new Sonoscope({
        source,
        startTime: 0,
        endTime: 10,
      });
      const ref = createRef<SpectrogramHandle>();

      await act(async () => {
        root.render(
          React.createElement(Spectrogram, { ref, scope, showPlayhead: true }),
        );
      });

      // Find the playhead element in container
      const playheadEl = container.childNodes[0]?.childNodes.find((child) =>
        child.classList.contains("sonoscope-playhead"),
      );
      expect(playheadEl).toBeTruthy();
      expect(playheadEl?.style.position).toBe("absolute");

      // Seek on scope updates playhead transform
      act(() => {
        scope.seek(5);
      });

      expect(playheadEl?.style.transform).toContain("translate3d(");
      scope.destroy();
    });
  });

  describe("<Waveform /> DOM Playhead", () => {
    it("attaches DOM playhead overlay and updates transform on scope timeupdate", async () => {
      const source = createMockAudioSource(10);
      const scope = new Sonoscope({
        source,
        startTime: 0,
        endTime: 10,
      });
      const ref = createRef<WaveformHandle>();

      await act(async () => {
        root.render(
          React.createElement(Waveform, { ref, scope, showPlayhead: true }),
        );
      });

      const playheadEl = container.childNodes[0]?.childNodes.find((child) =>
        child.classList.contains("sonoscope-playhead"),
      );
      expect(playheadEl).toBeTruthy();
      expect(playheadEl?.style.position).toBe("absolute");

      act(() => {
        scope.seek(2.5);
      });

      expect(playheadEl?.style.transform).toContain("translate3d(");
      scope.destroy();
    });
  });

  describe("<TimeRuler /> and useTimeRuler", () => {
    it("renders canvas and attaches TimeRulerViewer in SonoscopeProvider", async () => {
      const source = createMockAudioSource(30);
      const scope = new Sonoscope({ source });
      const ref = createRef<TimeRulerHandle>();

      await act(async () => {
        root.render(
          React.createElement(
            SonoscopeProvider,
            { value: scope },
            React.createElement(TimeRuler, { ref, program: "ticks" }),
          ),
        );
      });

      const canvas = container.childNodes[0]?.childNodes.find(
        (child) => child.tagName === "CANVAS",
      );
      expect(canvas).toBeTruthy();
      expect(ref.current?.getViewer()).toBeInstanceOf(TimeRulerViewer);
      scope.destroy();
    });

    it("attaches DOM playhead overlay to TimeRuler", async () => {
      const source = createMockAudioSource(10);
      const scope = new Sonoscope({
        source,
        startTime: 0,
        endTime: 10,
      });

      await act(async () => {
        root.render(
          React.createElement(TimeRuler, { scope, showPlayhead: true }),
        );
      });

      const playheadEl = container.childNodes[0]?.childNodes.find((child) =>
        child.classList.contains("sonoscope-playhead"),
      );
      expect(playheadEl).toBeTruthy();
      expect(playheadEl?.style.position).toBe("absolute");

      act(() => {
        scope.seek(4);
      });

      expect(playheadEl?.style.transform).toContain("translate3d(");
      scope.destroy();
    });
  });

  describe("<FrequencyRuler /> and useFrequencyRuler", () => {
    it("renders canvas and attaches FrequencyRulerViewer in SonoscopeProvider", async () => {
      const source = createMockAudioSource(30);
      const scope = new Sonoscope({ source });
      const ref = createRef<FrequencyRulerHandle>();

      await act(async () => {
        root.render(
          React.createElement(
            SonoscopeProvider,
            { value: scope },
            React.createElement(FrequencyRuler, {
              ref,
              program: "ticks",
              frequencyScale: "mel",
            }),
          ),
        );
      });

      const canvas = container.childNodes[0]?.childNodes.find(
        (child) => child.tagName === "CANVAS",
      );
      expect(canvas).toBeTruthy();
      expect(ref.current?.getViewer()).toBeInstanceOf(FrequencyRulerViewer);
      scope.destroy();
    });
  });
});
