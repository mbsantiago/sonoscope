import { describe, expect, it, vi } from "vitest";
import { BoxesFrequencyRulerRenderer } from "./boxes-renderer";
import { TicksFrequencyRulerRenderer } from "./ticks-renderer";

function createMockCanvas(): HTMLCanvasElement {
  return {
    width: 60,
    height: 400,
    getBoundingClientRect: () => ({ width: 60, height: 400 }),
    getContext: () => ({
      save: vi.fn(),
      restore: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      measureText: () => ({ width: 24 }),
    }),
  } as unknown as HTMLCanvasElement;
}

describe("FrequencyRuler Drawing Programs", () => {
  it("Ticks renderer executes draw without error across linear, mel, and log scales", () => {
    const renderer = new TicksFrequencyRulerRenderer();
    const canvas = createMockCanvas();
    const ctx = canvas.getContext("2d")!;
    for (const scale of ["linear", "mel", "log"] as const) {
      expect(() =>
        renderer.draw(
          ctx,
          {
            canvas,
            minFrequency: scale === "log" ? 20 : 0,
            maxFrequency: 20000,
            frequencyScale: scale,
            color: "#ffffff",
          },
          { width: 60, height: 400, dpr: 1 },
        ),
      ).not.toThrow();
    }
  });

  it("Boxes renderer executes draw without error", () => {
    const renderer = new BoxesFrequencyRulerRenderer();
    const canvas = createMockCanvas();
    const ctx = canvas.getContext("2d")!;
    expect(() =>
      renderer.draw(
        ctx,
        {
          canvas,
          minFrequency: 0,
          maxFrequency: 20000,
          frequencyScale: "linear",
          color: "#ffffff",
        },
        { width: 60, height: 400, dpr: 1 },
      ),
    ).not.toThrow();
  });
});
