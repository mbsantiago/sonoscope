import type { ColorMapConfig, Rgba } from "./types";

type Stop = [at: number, r: number, g: number, b: number];

const TAB20_COLORS: Rgba[] = [
  [31, 119, 180, 255],
  [174, 199, 232, 255],
  [255, 127, 14, 255],
  [255, 187, 120, 255],
  [44, 160, 44, 255],
  [152, 223, 138, 255],
  [214, 39, 40, 255],
  [255, 152, 150, 255],
  [148, 103, 189, 255],
  [197, 176, 213, 255],
  [140, 86, 75, 255],
  [196, 156, 148, 255],
  [227, 119, 194, 255],
  [247, 182, 210, 255],
  [127, 127, 127, 255],
  [199, 199, 199, 255],
  [188, 189, 34, 255],
  [219, 219, 141, 255],
  [23, 190, 207, 255],
  [158, 218, 229, 255],
];

const ANCHORS: Record<string, Stop[]> = {
  // Perceptually uniform
  viridis: [
    [0, 68, 1, 84],
    [0.33, 49, 104, 142],
    [0.66, 53, 183, 121],
    [1, 253, 231, 37],
  ],
  magma: [
    [0, 0, 0, 4],
    [0.33, 87, 15, 109],
    [0.66, 187, 55, 84],
    [1, 252, 253, 191],
  ],
  inferno: [
    [0, 0, 0, 4],
    [0.33, 120, 28, 109],
    [0.66, 237, 105, 37],
    [1, 252, 255, 164],
  ],
  plasma: [
    [0, 13, 8, 135],
    [0.33, 126, 3, 168],
    [0.66, 240, 89, 97],
    [1, 240, 249, 33],
  ],
  cividis: [
    [0, 0, 32, 77],
    [0.25, 65, 83, 102],
    [0.5, 124, 123, 120],
    [0.75, 197, 180, 99],
    [1, 255, 234, 70],
  ],
  turbo: [
    [0, 48, 18, 59],
    [0.25, 50, 101, 214],
    [0.5, 37, 213, 118],
    [0.75, 249, 210, 60],
    [1, 122, 4, 3],
  ],

  // Grayscale & Inverted Grayscale
  gray: [
    [0, 0, 0, 0],
    [1, 255, 255, 255],
  ],
  gray_r: [
    [0, 255, 255, 255],
    [1, 0, 0, 0],
  ],
  gray_inverted: [
    [0, 255, 255, 255],
    [1, 0, 0, 0],
  ],
  inverse_gray: [
    [0, 255, 255, 255],
    [1, 0, 0, 0],
  ],
  greys: [
    [0, 255, 255, 255],
    [0.25, 240, 240, 240],
    [0.5, 189, 189, 189],
    [0.75, 99, 99, 99],
    [1, 0, 0, 0],
  ],
  greys_r: [
    [0, 0, 0, 0],
    [0.25, 99, 99, 99],
    [0.5, 189, 189, 189],
    [0.75, 240, 240, 240],
    [1, 255, 255, 255],
  ],
  gist_yarg: [
    [0, 255, 255, 255],
    [1, 0, 0, 0],
  ],
  binary: [
    [0, 255, 255, 255],
    [1, 0, 0, 0],
  ],
  bone: [
    [0, 0, 0, 0],
    [0.375, 84, 84, 116],
    [0.75, 166, 198, 198],
    [1, 255, 255, 255],
  ],

  // Sequential / Colorbrewer
  purples: [
    [0, 252, 251, 253],
    [0.25, 239, 237, 245],
    [0.5, 188, 189, 220],
    [0.75, 117, 107, 177],
    [1, 63, 0, 125],
  ],
  blues: [
    [0, 247, 251, 255],
    [0.25, 198, 219, 239],
    [0.5, 107, 174, 214],
    [0.75, 33, 113, 181],
    [1, 8, 48, 107],
  ],
  greens: [
    [0, 247, 252, 245],
    [0.25, 199, 233, 192],
    [0.5, 116, 196, 118],
    [0.75, 35, 139, 69],
    [1, 0, 68, 27],
  ],
  oranges: [
    [0, 255, 245, 235],
    [0.25, 254, 230, 206],
    [0.5, 253, 141, 60],
    [0.75, 217, 72, 1],
    [1, 127, 39, 4],
  ],
  reds: [
    [0, 255, 245, 240],
    [0.25, 252, 187, 161],
    [0.5, 251, 106, 74],
    [0.75, 203, 24, 29],
    [1, 103, 0, 13],
  ],
  ylorbr: [
    [0, 255, 255, 229],
    [0.25, 254, 217, 142],
    [0.5, 254, 153, 41],
    [0.75, 204, 76, 2],
    [1, 102, 37, 6],
  ],
  ylorrd: [
    [0, 255, 255, 204],
    [0.25, 254, 217, 118],
    [0.5, 253, 141, 60],
    [0.75, 227, 26, 28],
    [1, 128, 0, 38],
  ],
  orrd: [
    [0, 254, 240, 217],
    [0.25, 253, 204, 138],
    [0.5, 252, 141, 89],
    [0.75, 227, 74, 51],
    [1, 153, 0, 0],
  ],
  purd: [
    [0, 247, 244, 249],
    [0.25, 215, 181, 216],
    [0.5, 223, 101, 176],
    [0.75, 206, 18, 86],
    [1, 103, 0, 31],
  ],
  rdpu: [
    [0, 254, 235, 226],
    [0.25, 251, 180, 185],
    [0.5, 247, 104, 161],
    [0.75, 174, 1, 126],
    [1, 73, 0, 106],
  ],
  bupu: [
    [0, 247, 252, 253],
    [0.25, 191, 211, 230],
    [0.5, 140, 150, 198],
    [0.75, 136, 65, 157],
    [1, 77, 0, 75],
  ],
  gnbu: [
    [0, 240, 249, 232],
    [0.25, 186, 228, 188],
    [0.5, 123, 204, 196],
    [0.75, 43, 140, 190],
    [1, 8, 64, 129],
  ],
  pubu: [
    [0, 255, 247, 251],
    [0.25, 208, 209, 230],
    [0.5, 103, 169, 207],
    [0.75, 2, 129, 138],
    [1, 2, 56, 88],
  ],
  ylgnbu: [
    [0, 255, 255, 217],
    [0.25, 199, 233, 180],
    [0.5, 65, 182, 196],
    [0.75, 29, 145, 192],
    [1, 8, 29, 88],
  ],
  pubugn: [
    [0, 255, 247, 251],
    [0.25, 208, 209, 230],
    [0.5, 103, 169, 207],
    [0.75, 1, 108, 89],
    [1, 1, 70, 54],
  ],
  bugn: [
    [0, 247, 252, 253],
    [0.25, 204, 236, 230],
    [0.5, 102, 194, 164],
    [0.75, 41, 153, 112],
    [1, 0, 68, 27],
  ],
  ylgn: [
    [0, 255, 255, 229],
    [0.25, 217, 240, 163],
    [0.5, 120, 198, 121],
    [0.75, 35, 132, 67],
    [1, 0, 69, 41],
  ],

  // Miscellaneous
  ocean: [
    [0, 0, 17, 0],
    [0.2, 0, 51, 68],
    [0.4, 0, 102, 119],
    [0.6, 51, 153, 153],
    [0.8, 170, 204, 204],
    [1, 255, 255, 255],
  ],
  gist_earth: [
    [0, 0, 0, 0],
    [0.2, 36, 73, 143],
    [0.4, 52, 147, 98],
    [0.6, 160, 192, 112],
    [0.8, 192, 144, 96],
    [1, 255, 255, 255],
  ],
  terrain: [
    [0, 51, 51, 153],
    [0.2, 0, 153, 153],
    [0.4, 51, 204, 51],
    [0.6, 204, 204, 102],
    [0.8, 153, 102, 51],
    [1, 255, 255, 255],
  ],
  gist_stern: [
    [0, 0, 0, 0],
    [0.2, 255, 255, 255],
    [0.4, 218, 0, 0],
    [0.6, 255, 170, 0],
    [0.8, 0, 218, 0],
    [1, 0, 100, 255],
  ],
  gnuplot: [
    [0, 0, 0, 0],
    [0.2, 60, 0, 140],
    [0.4, 180, 0, 140],
    [0.6, 230, 100, 0],
    [0.8, 255, 220, 0],
    [1, 255, 255, 255],
  ],
  gnuplot2: [
    [0, 0, 0, 0],
    [0.25, 0, 0, 160],
    [0.5, 0, 140, 200],
    [0.75, 120, 220, 100],
    [0.9, 255, 255, 100],
    [1, 255, 255, 255],
  ],
  cmrmap: [
    [0, 0, 0, 0],
    [0.15, 26, 40, 128],
    [0.35, 110, 30, 130],
    [0.55, 180, 40, 60],
    [0.75, 220, 130, 30],
    [0.9, 230, 210, 100],
    [1, 255, 255, 255],
  ],
  cubehelix: [
    [0, 0, 0, 0],
    [0.2, 24, 45, 96],
    [0.4, 41, 117, 107],
    [0.6, 126, 162, 80],
    [0.8, 220, 160, 150],
    [1, 255, 255, 255],
  ],
  brg: [
    [0, 0, 0, 255],
    [0.25, 128, 0, 128],
    [0.5, 255, 0, 0],
    [0.75, 128, 128, 0],
    [1, 0, 255, 0],
  ],
  gist_rainbow: [
    [0, 255, 0, 255],
    [0.16, 0, 0, 255],
    [0.33, 0, 255, 255],
    [0.5, 0, 255, 0],
    [0.66, 255, 255, 0],
    [0.83, 255, 128, 0],
    [1, 255, 0, 0],
  ],
  rainbow: [
    [0, 128, 0, 255],
    [0.2, 0, 0, 255],
    [0.4, 0, 255, 128],
    [0.6, 128, 255, 0],
    [0.75, 255, 255, 0],
    [0.88, 255, 128, 0],
    [1, 255, 0, 0],
  ],
  jet: [
    [0, 0, 0, 143],
    [0.15, 0, 0, 255],
    [0.4, 0, 255, 255],
    [0.65, 255, 255, 0],
    [0.85, 255, 0, 0],
    [1, 128, 0, 0],
  ],
  nipy_spectral: [
    [0, 0, 0, 0],
    [0.12, 90, 0, 140],
    [0.25, 0, 0, 200],
    [0.4, 0, 160, 200],
    [0.55, 0, 180, 0],
    [0.7, 220, 220, 0],
    [0.85, 240, 0, 0],
    [1, 200, 200, 200],
  ],
  gist_ncar: [
    [0, 0, 0, 128],
    [0.15, 0, 128, 255],
    [0.3, 0, 255, 128],
    [0.45, 128, 255, 0],
    [0.6, 255, 255, 0],
    [0.75, 255, 0, 0],
    [0.9, 255, 0, 255],
    [1, 255, 255, 255],
  ],
};

export function parseColor(color: string | Rgba): Rgba {
  if (Array.isArray(color)) {
    return [color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, color[3] ?? 255];
  }

  const str = color.trim().toLowerCase();
  if (str === "transparent") {
    return [0, 0, 0, 0];
  }

  // 6-digit hex: #rrggbb
  const hex6 = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(str);
  if (hex6) {
    return [
      Number.parseInt(hex6[1]!, 16),
      Number.parseInt(hex6[2]!, 16),
      Number.parseInt(hex6[3]!, 16),
      255,
    ];
  }

  // 8-digit hex: #rrggbbaa
  const hex8 = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(str);
  if (hex8) {
    return [
      Number.parseInt(hex8[1]!, 16),
      Number.parseInt(hex8[2]!, 16),
      Number.parseInt(hex8[3]!, 16),
      Number.parseInt(hex8[4]!, 16),
    ];
  }

  // 3-digit hex: #rgb
  const hex3 = /^#([\da-f])([\da-f])([\da-f])$/i.exec(str);
  if (hex3) {
    return [
      Number.parseInt(hex3[1]! + hex3[1]!, 16),
      Number.parseInt(hex3[2]! + hex3[2]!, 16),
      Number.parseInt(hex3[3]! + hex3[3]!, 16),
      255,
    ];
  }

  // 4-digit hex: #rgba
  const hex4 = /^#([\da-f])([\da-f])([\da-f])([\da-f])$/i.exec(str);
  if (hex4) {
    return [
      Number.parseInt(hex4[1]! + hex4[1]!, 16),
      Number.parseInt(hex4[2]! + hex4[2]!, 16),
      Number.parseInt(hex4[3]! + hex4[3]!, 16),
      Number.parseInt(hex4[4]! + hex4[4]!, 16),
    ];
  }

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch =
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(
      str,
    );
  if (rgbMatch) {
    const r = Math.round(Number.parseFloat(rgbMatch[1]!));
    const g = Math.round(Number.parseFloat(rgbMatch[2]!));
    const b = Math.round(Number.parseFloat(rgbMatch[3]!));
    let a = 255;
    if (rgbMatch[4] !== undefined) {
      const alphaVal = Number.parseFloat(rgbMatch[4]);
      a = Math.round(alphaVal <= 1 ? alphaVal * 255 : alphaVal);
    }
    return [r, g, b, Math.max(0, Math.min(255, a))];
  }

  throw new Error(`Unsupported color format: ${color}`);
}

function adjust(
  value: number,
  gamma: number,
  contrast: number,
  brightness: number,
): number {
  const normalized = Math.max(0, Math.min(1, value / 255));
  const gammaValue = normalized ** gamma;
  const contrasted = (gammaValue - 0.5) * contrast + 0.5 + brightness;
  return Math.round(Math.max(0, Math.min(1, contrasted)) * 255);
}

function interpolate(
  stops: Stop[],
  gamma = 1,
  contrast = 1,
  brightness = 0,
): Rgba[] {
  const sorted = [...stops].sort((a, b) => a[0] - b[0]);
  return Array.from({ length: 256 }, (_, index) => {
    const at = index / 255;
    const hi = sorted.find((s) => s[0] >= at) ?? sorted[sorted.length - 1]!;
    const lo = [...sorted].reverse().find((s) => s[0] <= at) ?? sorted[0]!;
    const span = hi[0] - lo[0] || 1;
    const t = (at - lo[0]) / span;

    const r = Math.round(lo[1] + (hi[1] - lo[1]) * t);
    const g = Math.round(lo[2] + (hi[2] - lo[2]) * t);
    const b = Math.round(lo[3] + (hi[3] - lo[3]) * t);

    return [
      adjust(r, gamma, contrast, brightness),
      adjust(g, gamma, contrast, brightness),
      adjust(b, gamma, contrast, brightness),
      255,
    ];
  });
}

function buildTab20(gamma = 1, contrast = 1, brightness = 0): Rgba[] {
  return Array.from({ length: 256 }, (_, index) => {
    const colorIndex = Math.min(19, Math.floor((index / 256) * 20));
    const color = TAB20_COLORS[colorIndex]!;
    return [
      adjust(color[0], gamma, contrast, brightness),
      adjust(color[1], gamma, contrast, brightness),
      adjust(color[2], gamma, contrast, brightness),
      color[3],
    ];
  });
}

export function buildColorMap(config: ColorMapConfig): Rgba[] {
  const baseName =
    typeof config === "string"
      ? config.toLowerCase()
      : "base" in config
        ? config.base.toLowerCase()
        : undefined;

  const gamma = typeof config === "object" ? (config.gamma ?? 1) : 1;
  const contrast = typeof config === "object" ? (config.contrast ?? 1) : 1;
  const brightness = typeof config === "object" ? (config.brightness ?? 0) : 0;

  if (baseName === "tab20") {
    return buildTab20(gamma, contrast, brightness);
  }

  if (baseName && baseName in ANCHORS) {
    return interpolate(ANCHORS[baseName]!, gamma, contrast, brightness);
  }

  // Handle general _r or _inverted suffix
  if (baseName) {
    const rootName = baseName.endsWith("_r")
      ? baseName.slice(0, -2)
      : baseName.endsWith("_inverted")
        ? baseName.slice(0, -9)
        : undefined;
    if (rootName && rootName in ANCHORS) {
      const rootStops = ANCHORS[rootName]!;
      const invertedStops: Stop[] = rootStops.map(([at, r, g, b]) => [
        1 - at,
        r,
        g,
        b,
      ]);
      return interpolate(invertedStops, gamma, contrast, brightness);
    }
  }

  if (typeof config === "object" && "points" in config) {
    const customStops: Stop[] = config.points.map((p) => {
      const rgba = parseColor(p.color);
      return [p.at, rgba[0], rgba[1], rgba[2]];
    });
    return interpolate(customStops, gamma, contrast, brightness);
  }

  // Fallback to viridis
  return interpolate(ANCHORS.viridis!, gamma, contrast, brightness);
}

export function colorMapToRgb(config: ColorMapConfig, index = 220): string {
  const map = buildColorMap(config);
  const clampedIdx = Math.max(0, Math.min(map.length - 1, Math.round(index)));
  const [r, g, b] = map[clampedIdx]!;
  return `rgb(${r}, ${g}, ${b})`;
}
