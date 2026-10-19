import { describe, expect, it, vi } from "vitest";
import { BoxesTimeRulerRenderer } from "./boxes-renderer";
import { TicksTimeRulerRenderer } from "./ticks-renderer";

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
  it("Ticks renderer executes draw without error", () => {
    const renderer = new TicksTimeRulerRenderer();
    const canvas = createMockCanvas();
    const ctx = canvas.getContext("2d")!;
    expect(() =>
      renderer.draw(
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

  it("Boxes renderer executes draw without error", () => {
    const renderer = new BoxesTimeRulerRenderer();
    const canvas = createMockCanvas();
    const ctx = canvas.getContext("2d")!;
    expect(() =>
      renderer.draw(
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
