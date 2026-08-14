import { describe, expect, it } from "vitest";
import { buildColorMap, parseColor } from "./colormap";
import type { BuiltInColorMap } from "./types";

describe("colormap", () => {
  it("parses hex colors to rgba bytes", () => {
    expect(parseColor("#336699")).toEqual([51, 102, 153, 255]);
  });

  it("builds named maps with 256 entries", () => {
    expect(buildColorMap("viridis")).toHaveLength(256);
    expect(buildColorMap("gray")[0]).toEqual([0, 0, 0, 255]);
    expect(buildColorMap("gray")[255]).toEqual([255, 255, 255, 255]);
  });

  it("interpolates custom points", () => {
    const map = buildColorMap({
      points: [
        { at: 0, color: "#000000" },
        { at: 1, color: "#ffffff" },
      ],
    });
    expect(map[128]?.[0]).toBeGreaterThan(120);
    expect(map[128]?.[0]).toBeLessThan(136);
  });

  it("builds all requested sequential colormaps", () => {
    const sequentialMaps: BuiltInColorMap[] = [
      "Greys",
      "Purples",
      "Blues",
      "Greens",
      "Oranges",
      "Reds",
      "YlOrBr",
      "YlOrRd",
      "OrRd",
      "PuRd",
      "RdPu",
      "BuPu",
      "GnBu",
      "PuBu",
      "YlGnBu",
      "PuBuGn",
      "BuGn",
      "YlGn",
    ];

    for (const name of sequentialMaps) {
      const map = buildColorMap(name);
      expect(map).toHaveLength(256);
      expect(map[0]).toHaveLength(4);
      expect(map[255]).toHaveLength(4);
    }
  });

  it("builds all requested funnier / miscellaneous colormaps", () => {
    const miscMaps: BuiltInColorMap[] = [
      "ocean",
      "gist_earth",
      "terrain",
      "gist_stern",
      "gnuplot",
      "gnuplot2",
      "CMRmap",
      "cubehelix",
      "brg",
      "gist_rainbow",
      "rainbow",
      "jet",
      "turbo",
      "nipy_spectral",
      "gist_ncar",
    ];

    for (const name of miscMaps) {
      const map = buildColorMap(name);
      expect(map).toHaveLength(256);
      expect(map[0]).toHaveLength(4);
      expect(map[255]).toHaveLength(4);
    }
  });

  it("builds discrete categorical tab20 colormap", () => {
    const map = buildColorMap("tab20");
    expect(map).toHaveLength(256);

    // tab20 has 20 distinct discrete color bands (~12-13 bins each)
    const uniqueColors = new Set(map.map(([r, g, b]) => `${r},${g},${b}`));
    expect(uniqueColors.size).toBe(20);

    // First band is #1f77b4 (31, 119, 180)
    expect(map[0]).toEqual([31, 119, 180, 255]);
    // Last band is #9edae5 (158, 218, 229)
    expect(map[255]).toEqual([158, 218, 229, 255]);
  });

  it("supports case-insensitive colormap resolution and modifiers", () => {
    const upper = buildColorMap("CMRmap");
    const lower = buildColorMap("cmrmap");
    expect(upper).toEqual(lower);

    const modified = buildColorMap({
      base: "YlGnBu",
      contrast: 1.2,
      brightness: 0.1,
    });
    expect(modified).toHaveLength(256);
  });

  it("builds cividis perceptually uniform colormap", () => {
    const map = buildColorMap("cividis");
    expect(map).toHaveLength(256);
    // Dark blue to bright yellow
    expect(map[0]).toEqual([0, 32, 77, 255]);
    expect(map[255]).toEqual([255, 234, 70, 255]);
  });

  it("builds inverted grayscale colormaps with white background and dark signal", () => {
    const grayR = buildColorMap("gray_r");
    expect(grayR).toHaveLength(256);
    expect(grayR[0]).toEqual([255, 255, 255, 255]); // white background
    expect(grayR[255]).toEqual([0, 0, 0, 255]); // black signal

    const grayInverted = buildColorMap("gray_inverted");
    expect(grayInverted[0]).toEqual([255, 255, 255, 255]);
    expect(grayInverted[255]).toEqual([0, 0, 0, 255]);

    const greysR = buildColorMap("Greys_r");
    expect(greysR[0]).toEqual([0, 0, 0, 255]);
    expect(greysR[255]).toEqual([255, 255, 255, 255]);
  });

  it("supports automatic reversal for any colormap with _r suffix", () => {
    const viridis = buildColorMap("viridis");
    const viridisR = buildColorMap("viridis_r" as BuiltInColorMap);
    expect(viridisR[0]).toEqual(viridis[255]);
    expect(viridisR[255]).toEqual(viridis[0]);
  });
});
