import { describe, expect, it, vi } from "vitest";
import { BoxesTimeRulerProgram } from "./boxes-program";
import { TicksTimeRulerProgram } from "./ticks-program";

function createMockCanvas(): HTMLCanvasElement {
  return {
    width: 600,
    height: 30,
    getBoundingClientRect: () => ({ width: 600, height: 30 }),
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

describe("TimeRuler Drawing Programs", () => {
  it("Ticks program executes draw without error", () => {
    const program = new TicksTimeRulerProgram();
    const canvas = createMockCanvas();
    const ctx = canvas.getContext("2d")!;
    expect(() =>
      program.draw(
        ctx,
        {
          canvas,
          startTime: 0,
          endTime: 10,
          totalDuration: 60,
          color: "#ffffff",
          backgroundColor: "#000000",
        },
        { width: 600, height: 30, dpr: 1 },
      ),
    ).not.toThrow();
  });

  it("Boxes program executes draw without error", () => {
    const program = new BoxesTimeRulerProgram();
    const canvas = createMockCanvas();
    const ctx = canvas.getContext("2d")!;
    expect(() =>
      program.draw(
        ctx,
        {
          canvas,
          startTime: 0,
          endTime: 10,
          totalDuration: 60,
          color: "#ffffff",
          backgroundColor: "#000000",
        },
        { width: 600, height: 30, dpr: 1 },
      ),
    ).not.toThrow();
  });
});
