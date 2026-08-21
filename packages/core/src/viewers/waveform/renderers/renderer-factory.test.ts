import { describe, expect, it } from "vitest";
import { BarsWaveformRenderer } from "./bars";
import { CanvasWaveformRenderer } from "./canvas";
import { createWaveformRenderer } from "./renderer-factory";
import { WebGL2WaveformRenderer } from "./webgl2";

describe("createWaveformRenderer", () => {
  it("defaults to CanvasWaveformRenderer when mode is undefined or canvas2d", () => {
    expect(createWaveformRenderer()).toBeInstanceOf(CanvasWaveformRenderer);
    expect(createWaveformRenderer("canvas2d")).toBeInstanceOf(
      CanvasWaveformRenderer,
    );
    expect(createWaveformRenderer({ type: "canvas2d" })).toBeInstanceOf(
      CanvasWaveformRenderer,
    );
  });

  it("creates WebGL2WaveformRenderer from string or object config", () => {
    expect(createWaveformRenderer("webgl2")).toBeInstanceOf(
      WebGL2WaveformRenderer,
    );
    expect(createWaveformRenderer({ type: "webgl2" })).toBeInstanceOf(
      WebGL2WaveformRenderer,
    );
  });

  it("creates BarsWaveformRenderer from string or object config with options", () => {
    const r1 = createWaveformRenderer("bars");
    expect(r1).toBeInstanceOf(BarsWaveformRenderer);

    const r2 = createWaveformRenderer("segmented-bars");
    expect(r2).toBeInstanceOf(BarsWaveformRenderer);

    const r3 = createWaveformRenderer({
      type: "bars",
      barWidth: 6,
      barGap: 4,
      barAlign: "bottom",
      rounded: false,
    });
    expect(r3).toBeInstanceOf(BarsWaveformRenderer);
    const barsR3 = r3 as BarsWaveformRenderer;
    expect(barsR3.getOptions()).toMatchObject({
      barWidth: 6,
      barGap: 4,
      barAlign: "bottom",
      rounded: false,
    });
  });

  it("passes through existing WaveformRenderer instance untouched", () => {
    const custom = new BarsWaveformRenderer({ barWidth: 8 });
    expect(createWaveformRenderer(custom)).toBe(custom);
  });
});
