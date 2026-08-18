import { describe, expect, it, vi } from "vitest";
import { BoxesFrequencyRulerProgram } from "./boxes-program";
import { TicksFrequencyRulerProgram } from "./ticks-program";

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
  it("Ticks program executes draw without error across linear, mel, and log scales", () => {
    const program = new TicksFrequencyRulerProgram();
    const canvas = createMockCanvas();
    const ctx = canvas.getContext("2d")!;
    for (const scale of ["linear", "mel", "log"] as const) {
      expect(() =>
        program.draw(
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

  it("Boxes program executes draw without error", () => {
    const program = new BoxesFrequencyRulerProgram();
    const canvas = createMockCanvas();
    const ctx = canvas.getContext("2d")!;
    expect(() =>
      program.draw(
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
