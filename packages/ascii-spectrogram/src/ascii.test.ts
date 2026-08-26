import {
  createSpectrogramRenderer,
  hasRegisteredSpectrogramRenderer,
  type RenderInput,
  type SpectrogramMatrix,
  unregisterSpectrogramRenderer,
} from "@sonoscope/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AsciiSpectrogramRenderer,
  createAsciiRenderer,
  registerAsciiRenderer,
} from "./index";

function createMockTile(): SpectrogramMatrix {
  return {
    channel: 0,
    frameStart: 0,
    times: new Float32Array([0, 0.5, 1.0]),
    frequencies: new Float32Array([100, 500, 1000, 2000]),
    magnitude: new Float32Array([
      0.1, 0.5, 0.8, 1.0, 0.2, 0.6, 0.9, 0.7, 0.3, 0.4, 0.5, 0.2,
    ]),
    frameCount: 3,
    binCount: 4,
    timeStart: 0,
    timeEnd: 1.0,
    sampleRate: 44100,
  };
}

afterEach(() => {
  unregisterSpectrogramRenderer("ascii");
  unregisterSpectrogramRenderer("custom-ascii");
});

describe("AsciiSpectrogramRenderer", () => {
  it("instantiates with default options and updates options", () => {
    const renderer = new AsciiSpectrogramRenderer();
    expect(renderer.kind).toBe("canvas2d");
    expect(renderer.getOptions().colorMode ?? "colormap").toBe("colormap");

    renderer.updateOptions({ colorMode: "green", fontSize: 12 });
    expect(renderer.getOptions().colorMode).toBe("green");
    expect(renderer.getOptions().fontSize).toBe(12);
  });

  it("renders ASCII characters onto a 2D canvas context", () => {
    const renderer = createAsciiRenderer({
      colorMode: "green",
      charSet: " .*",
      fontSize: 10,
    });

    const mockCtx = {
      fillRect: vi.fn(),
      fillText: vi.fn(),
      fillStyle: "",
      font: "",
      textBaseline: "",
    };

    const mockCanvas = {
      width: 100,
      height: 50,
      getContext: vi.fn(() => mockCtx),
    } as unknown as HTMLCanvasElement;

    const input: RenderInput = {
      canvas: mockCanvas,
      viewport: {
        startTime: 0,
        endTime: 1.0,
        minFrequency: 100,
        maxFrequency: 2000,
      },
      valueScale: {
        mode: "magnitude",
        min: -100,
        max: 0,
        gamma: 1.0,
        clamp: true,
      },
      colorMap: "viridis",
      tiles: [createMockTile()],
    };

    renderer.render(input);

    expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 100, 50);
    expect(mockCtx.fillText).toHaveBeenCalled();
  });

  it("registers globally when registerAsciiRenderer is called", () => {
    expect(hasRegisteredSpectrogramRenderer("ascii")).toBe(false);

    registerAsciiRenderer("ascii", { colorMode: "amber" });
    expect(hasRegisteredSpectrogramRenderer("ascii")).toBe(true);

    const mockCanvas = {
      getContext: vi.fn(),
    } as unknown as HTMLCanvasElement;

    const renderer = createSpectrogramRenderer(mockCanvas, "ascii");
    expect(renderer).toBeInstanceOf(AsciiSpectrogramRenderer);
    expect((renderer as AsciiSpectrogramRenderer).getOptions().colorMode).toBe(
      "amber",
    );
  });

  it("anchors character columns to absolute audio time during panning", () => {
    const renderer = createAsciiRenderer({
      colorMode: "monochrome",
      charSet: " .*",
      fontSize: 10,
      charWidth: 10,
      charHeight: 10,
    });

    const calls1: Array<{ text: string; x: number; y: number }> = [];
    const mockCtx1 = {
      fillRect: vi.fn(),
      fillText: vi.fn((text: string, x: number, y: number) => {
        calls1.push({ text, x, y });
      }),
      fillStyle: "",
      font: "",
      textBaseline: "",
    };

    const mockCanvas = {
      width: 100,
      height: 50,
      getContext: vi.fn(() => mockCtx1),
    } as unknown as HTMLCanvasElement;

    const baseInput: RenderInput = {
      canvas: mockCanvas,
      viewport: {
        startTime: 0,
        endTime: 1.0,
        minFrequency: 100,
        maxFrequency: 2000,
      },
      valueScale: {
        mode: "magnitude",
        min: -100,
        max: 0,
        gamma: 1.0,
        clamp: true,
      },
      colorMap: "viridis",
      tiles: [createMockTile()],
    };

    // Render at t=0..1.0s (100px width, 10px char width -> 100ms per char)
    renderer.render(baseInput);

    const calls2: Array<{ text: string; x: number; y: number }> = [];
    const mockCtx2 = {
      fillRect: vi.fn(),
      fillText: vi.fn((text: string, x: number, y: number) => {
        calls2.push({ text, x, y });
      }),
      fillStyle: "",
      font: "",
      textBaseline: "",
    };
    vi.mocked(mockCanvas.getContext).mockReturnValue(
      mockCtx2 as unknown as CanvasRenderingContext2D,
    );

    // Pan by 0.05s (50ms = 5px shift to the left)
    renderer.render({
      ...baseInput,
      viewport: {
        ...baseInput.viewport,
        startTime: 0.05,
        endTime: 1.05,
      },
    });

    // The column for audio time t=0.1s was at x=10 in calls1, and should now be at x=5 in calls2
    const c1 = calls1.find((c) => c.x === 10 && c.y === 0);
    const c2 = calls2.find((c) => c.x === 5 && c.y === 0);

    expect(c1).toBeDefined();
    expect(c2).toBeDefined();
    // Character glyph for the same audio point should match exactly!
    expect(c1?.text).toBe(c2?.text);
  });

  it("auto-registers when importing the /auto subpath", async () => {
    expect(hasRegisteredSpectrogramRenderer("ascii")).toBe(false);

    await import("./auto");
    expect(hasRegisteredSpectrogramRenderer("ascii")).toBe(true);

    const mockCanvas = {
      getContext: vi.fn(),
    } as unknown as HTMLCanvasElement;

    const renderer = createSpectrogramRenderer(mockCanvas, "ascii");
    expect(renderer).toBeInstanceOf(AsciiSpectrogramRenderer);
  });
});
