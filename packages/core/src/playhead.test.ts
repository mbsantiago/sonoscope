import type { AudioSource } from "./types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachPlayheadOverlay } from "./playhead";
import { Sonoscope } from "./sonoscope";

interface MockElement {
  style: Record<string, string>;
  className: string;
  parentElement: MockElement | null;
  parentNode: MockElement | null;
  children: MockElement[];
  appendChild: (child: MockElement) => MockElement;
  removeChild: (child: MockElement) => MockElement;
  contains: (child: MockElement) => boolean;
  clientWidth: number;
  clientHeight: number;
  getBoundingClientRect: () => {
    width: number;
    height: number;
    left: number;
    top: number;
  };
}

function createMockElement(tag = "div"): MockElement {
  const el: MockElement = {
    style: {},
    className: "",
    parentElement: null,
    parentNode: null,
    children: [],
    appendChild: (child: MockElement) => {
      el.children.push(child);
      child.parentElement = el;
      child.parentNode = el;
      return child;
    },
    removeChild: (child: MockElement) => {
      const index = el.children.indexOf(child);
      if (index >= 0) el.children.splice(index, 1);
      child.parentElement = null;
      child.parentNode = null;
      return child;
    },
    contains: (child: MockElement) => el.children.includes(child),
    clientWidth: 1000,
    clientHeight: 200,
    getBoundingClientRect: () => ({
      width: 1000,
      height: 200,
      left: 0,
      top: 0,
    }),
  };
  return el;
}

describe("PlayheadOverlay", () => {
  let container: HTMLDivElement;
  let source: AudioSource;
  let prevDocument: unknown;

  beforeEach(() => {
    prevDocument = globalThis.document;
    (globalThis as unknown as { document: unknown }).document = {
      createElement: (tag: string) => createMockElement(tag),
    };

    container = createMockElement("div") as unknown as HTMLDivElement;
    source = {
      id: "test-playhead-audio",
      sampleRate: 44100,
      duration: 10,
      channelCount: 1,
      read: () => new Float32Array(1024),
    };
  });

  afterEach(() => {
    (globalThis as unknown as { document: unknown }).document = prevDocument;
    vi.restoreAllMocks();
  });

  it("creates a playhead div with hardware-accelerated transform inside container", () => {
    const scope = new Sonoscope({ source, startTime: 0, endTime: 10 });
    const overlay = attachPlayheadOverlay(container, scope);

    const el = overlay.getElement();
    expect(el).toBeDefined();
    expect(container.contains(el)).toBe(true);
    expect(el.style.position).toBe("absolute");
    expect(el.style.pointerEvents).toBe("none");

    overlay.destroy();
    expect(container.contains(el)).toBe(false);
  });

  it("updates transform correctly on timeupdate and viewportchange", () => {
    const audio = {
      currentTime: 2.5,
      paused: false,
      ended: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLAudioElement;

    const scope = new Sonoscope({
      source,
      audio,
      startTime: 0,
      endTime: 10,
      followPlayback: "off",
    });
    const overlay = attachPlayheadOverlay(container, scope);
    const el = overlay.getElement();

    // At t = 2.5s within [0s, 10s] on a 1000px container, position = 250px
    scope.seek(2.5);
    expect(el.style.transform).toBe("translate3d(250px, 0px, 0px)");
    expect(el.style.display).not.toBe("none");

    // Outside viewport [0, 5], playhead at t=8s should be hidden
    scope.setViewport({ startTime: 0, endTime: 5 });
    scope.seek(8.0);
    expect(el.style.display).toBe("none");

    overlay.destroy();
  });
});
