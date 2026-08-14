import type { ColorMapConfig, Rgba } from "./types";

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

const ANCHORS: Record<string, Array<{ at: number; color: Rgba }>> = {
  // Perceptually uniform
  viridis: [
    { at: 0, color: [68, 1, 84, 255] },
    { at: 0.33, color: [49, 104, 142, 255] },
    { at: 0.66, color: [53, 183, 121, 255] },
    { at: 1, color: [253, 231, 37, 255] },
  ],
  magma: [
    { at: 0, color: [0, 0, 4, 255] },
    { at: 0.33, color: [87, 15, 109, 255] },
    { at: 0.66, color: [187, 55, 84, 255] },
    { at: 1, color: [252, 253, 191, 255] },
  ],
  inferno: [
    { at: 0, color: [0, 0, 4, 255] },
    { at: 0.33, color: [120, 28, 109, 255] },
    { at: 0.66, color: [237, 105, 37, 255] },
    { at: 1, color: [252, 255, 164, 255] },
  ],
  plasma: [
    { at: 0, color: [13, 8, 135, 255] },
    { at: 0.33, color: [126, 3, 168, 255] },
    { at: 0.66, color: [240, 89, 97, 255] },
    { at: 1, color: [240, 249, 33, 255] },
  ],
  cividis: [
    { at: 0, color: [0, 32, 77, 255] },
    { at: 0.25, color: [65, 83, 102, 255] },
    { at: 0.5, color: [124, 123, 120, 255] },
    { at: 0.75, color: [197, 180, 99, 255] },
    { at: 1, color: [255, 234, 70, 255] },
  ],
  turbo: [
    { at: 0, color: [48, 18, 59, 255] },
    { at: 0.25, color: [50, 101, 214, 255] },
    { at: 0.5, color: [37, 213, 118, 255] },
    { at: 0.75, color: [249, 210, 60, 255] },
    { at: 1, color: [122, 4, 3, 255] },
  ],

  // Grayscale & Inverted Grayscale
  gray: [
    { at: 0, color: [0, 0, 0, 255] },
    { at: 1, color: [255, 255, 255, 255] },
  ],
  gray_r: [
    { at: 0, color: [255, 255, 255, 255] },
    { at: 1, color: [0, 0, 0, 255] },
  ],
  gray_inverted: [
    { at: 0, color: [255, 255, 255, 255] },
    { at: 1, color: [0, 0, 0, 255] },
  ],
  inverse_gray: [
    { at: 0, color: [255, 255, 255, 255] },
    { at: 1, color: [0, 0, 0, 255] },
  ],
  greys: [
    { at: 0, color: [255, 255, 255, 255] },
    { at: 0.25, color: [240, 240, 240, 255] },
    { at: 0.5, color: [189, 189, 189, 255] },
    { at: 0.75, color: [99, 99, 99, 255] },
    { at: 1, color: [0, 0, 0, 255] },
  ],
  greys_r: [
    { at: 0, color: [0, 0, 0, 255] },
    { at: 0.25, color: [99, 99, 99, 255] },
    { at: 0.5, color: [189, 189, 189, 255] },
    { at: 0.75, color: [240, 240, 240, 255] },
    { at: 1, color: [255, 255, 255, 255] },
  ],
  gist_yarg: [
    { at: 0, color: [255, 255, 255, 255] },
    { at: 1, color: [0, 0, 0, 255] },
  ],
  binary: [
    { at: 0, color: [255, 255, 255, 255] },
    { at: 1, color: [0, 0, 0, 255] },
  ],
  bone: [
    { at: 0, color: [0, 0, 0, 255] },
    { at: 0.375, color: [84, 84, 116, 255] },
    { at: 0.75, color: [166, 198, 198, 255] },
    { at: 1, color: [255, 255, 255, 255] },
  ],

  // Sequential / Colorbrewer
  purples: [
    { at: 0, color: [252, 251, 253, 255] },
    { at: 0.25, color: [239, 237, 245, 255] },
    { at: 0.5, color: [188, 189, 220, 255] },
    { at: 0.75, color: [117, 107, 177, 255] },
    { at: 1, color: [63, 0, 125, 255] },
  ],
  blues: [
    { at: 0, color: [247, 251, 255, 255] },
    { at: 0.25, color: [198, 219, 239, 255] },
    { at: 0.5, color: [107, 174, 214, 255] },
    { at: 0.75, color: [33, 113, 181, 255] },
    { at: 1, color: [8, 48, 107, 255] },
  ],
  greens: [
    { at: 0, color: [247, 252, 245, 255] },
    { at: 0.25, color: [199, 233, 192, 255] },
    { at: 0.5, color: [116, 196, 118, 255] },
    { at: 0.75, color: [35, 139, 69, 255] },
    { at: 1, color: [0, 68, 27, 255] },
  ],
  oranges: [
    { at: 0, color: [255, 245, 235, 255] },
    { at: 0.25, color: [254, 230, 206, 255] },
    { at: 0.5, color: [253, 141, 60, 255] },
    { at: 0.75, color: [217, 72, 1, 255] },
    { at: 1, color: [127, 39, 4, 255] },
  ],
  reds: [
    { at: 0, color: [255, 245, 240, 255] },
    { at: 0.25, color: [252, 187, 161, 255] },
    { at: 0.5, color: [251, 106, 74, 255] },
    { at: 0.75, color: [203, 24, 29, 255] },
    { at: 1, color: [103, 0, 13, 255] },
  ],
  ylorbr: [
    { at: 0, color: [255, 255, 229, 255] },
    { at: 0.25, color: [254, 217, 142, 255] },
    { at: 0.5, color: [254, 153, 41, 255] },
    { at: 0.75, color: [204, 76, 2, 255] },
    { at: 1, color: [102, 37, 6, 255] },
  ],
  ylorrd: [
    { at: 0, color: [255, 255, 204, 255] },
    { at: 0.25, color: [254, 217, 118, 255] },
    { at: 0.5, color: [253, 141, 60, 255] },
    { at: 0.75, color: [227, 26, 28, 255] },
    { at: 1, color: [128, 0, 38, 255] },
  ],
  orrd: [
    { at: 0, color: [254, 240, 217, 255] },
    { at: 0.25, color: [253, 204, 138, 255] },
    { at: 0.5, color: [252, 141, 89, 255] },
    { at: 0.75, color: [227, 74, 51, 255] },
    { at: 1, color: [153, 0, 0, 255] },
  ],
  purd: [
    { at: 0, color: [247, 244, 249, 255] },
    { at: 0.25, color: [215, 181, 216, 255] },
    { at: 0.5, color: [223, 101, 176, 255] },
    { at: 0.75, color: [206, 18, 86, 255] },
    { at: 1, color: [103, 0, 31, 255] },
  ],
  rdpu: [
    { at: 0, color: [254, 235, 226, 255] },
    { at: 0.25, color: [251, 180, 185, 255] },
    { at: 0.5, color: [247, 104, 161, 255] },
    { at: 0.75, color: [174, 1, 126, 255] },
    { at: 1, color: [73, 0, 106, 255] },
  ],
  bupu: [
    { at: 0, color: [247, 252, 253, 255] },
    { at: 0.25, color: [191, 211, 230, 255] },
    { at: 0.5, color: [140, 150, 198, 255] },
    { at: 0.75, color: [136, 65, 157, 255] },
    { at: 1, color: [77, 0, 75, 255] },
  ],
  gnbu: [
    { at: 0, color: [240, 249, 232, 255] },
    { at: 0.25, color: [186, 228, 188, 255] },
    { at: 0.5, color: [123, 204, 196, 255] },
    { at: 0.75, color: [43, 140, 190, 255] },
    { at: 1, color: [8, 64, 129, 255] },
  ],
  pubu: [
    { at: 0, color: [255, 247, 251, 255] },
    { at: 0.25, color: [208, 209, 230, 255] },
    { at: 0.5, color: [103, 169, 207, 255] },
    { at: 0.75, color: [2, 129, 138, 255] },
    { at: 1, color: [2, 56, 88, 255] },
  ],
  ylgnbu: [
    { at: 0, color: [255, 255, 217, 255] },
    { at: 0.25, color: [199, 233, 180, 255] },
    { at: 0.5, color: [65, 182, 196, 255] },
    { at: 0.75, color: [29, 145, 192, 255] },
    { at: 1, color: [8, 29, 88, 255] },
  ],
  pubugn: [
    { at: 0, color: [255, 247, 251, 255] },
    { at: 0.25, color: [208, 209, 230, 255] },
    { at: 0.5, color: [103, 169, 207, 255] },
    { at: 0.75, color: [1, 108, 89, 255] },
    { at: 1, color: [1, 70, 54, 255] },
  ],
  bugn: [
    { at: 0, color: [247, 252, 253, 255] },
    { at: 0.25, color: [204, 236, 230, 255] },
    { at: 0.5, color: [102, 194, 164, 255] },
    { at: 0.75, color: [41, 153, 112, 255] },
    { at: 1, color: [0, 68, 27, 255] },
  ],
  ylgn: [
    { at: 0, color: [255, 255, 229, 255] },
    { at: 0.25, color: [217, 240, 163, 255] },
    { at: 0.5, color: [120, 198, 121, 255] },
    { at: 0.75, color: [35, 132, 67, 255] },
    { at: 1, color: [0, 69, 41, 255] },
  ],

  // Miscellaneous / Funnier
  ocean: [
    { at: 0, color: [0, 17, 0, 255] },
    { at: 0.2, color: [0, 51, 68, 255] },
    { at: 0.4, color: [0, 102, 119, 255] },
    { at: 0.6, color: [51, 153, 153, 255] },
    { at: 0.8, color: [170, 204, 204, 255] },
    { at: 1, color: [255, 255, 255, 255] },
  ],
  gist_earth: [
    { at: 0, color: [0, 0, 0, 255] },
    { at: 0.2, color: [36, 73, 143, 255] },
    { at: 0.4, color: [52, 147, 98, 255] },
    { at: 0.6, color: [160, 192, 112, 255] },
    { at: 0.8, color: [192, 144, 96, 255] },
    { at: 1, color: [255, 255, 255, 255] },
  ],
  terrain: [
    { at: 0, color: [51, 51, 153, 255] },
    { at: 0.2, color: [0, 153, 153, 255] },
    { at: 0.4, color: [51, 204, 51, 255] },
    { at: 0.6, color: [204, 204, 102, 255] },
    { at: 0.8, color: [153, 102, 51, 255] },
    { at: 1, color: [255, 255, 255, 255] },
  ],
  gist_stern: [
    { at: 0, color: [0, 0, 0, 255] },
    { at: 0.2, color: [255, 255, 255, 255] },
    { at: 0.4, color: [218, 0, 0, 255] },
    { at: 0.6, color: [255, 170, 0, 255] },
    { at: 0.8, color: [0, 218, 0, 255] },
    { at: 1, color: [0, 100, 255, 255] },
  ],
  gnuplot: [
    { at: 0, color: [0, 0, 0, 255] },
    { at: 0.2, color: [60, 0, 140, 255] },
    { at: 0.4, color: [180, 0, 140, 255] },
    { at: 0.6, color: [230, 100, 0, 255] },
    { at: 0.8, color: [255, 220, 0, 255] },
    { at: 1, color: [255, 255, 255, 255] },
  ],
  gnuplot2: [
    { at: 0, color: [0, 0, 0, 255] },
    { at: 0.25, color: [0, 0, 160, 255] },
    { at: 0.5, color: [0, 140, 200, 255] },
    { at: 0.75, color: [120, 220, 100, 255] },
    { at: 0.9, color: [255, 255, 100, 255] },
    { at: 1, color: [255, 255, 255, 255] },
  ],
  cmrmap: [
    { at: 0, color: [0, 0, 0, 255] },
    { at: 0.15, color: [26, 40, 128, 255] },
    { at: 0.35, color: [110, 30, 130, 255] },
    { at: 0.55, color: [180, 40, 60, 255] },
    { at: 0.75, color: [220, 130, 30, 255] },
    { at: 0.9, color: [230, 210, 100, 255] },
    { at: 1, color: [255, 255, 255, 255] },
  ],
  cubehelix: [
    { at: 0, color: [0, 0, 0, 255] },
    { at: 0.2, color: [24, 45, 96, 255] },
    { at: 0.4, color: [41, 117, 107, 255] },
    { at: 0.6, color: [126, 162, 80, 255] },
    { at: 0.8, color: [220, 160, 150, 255] },
    { at: 1, color: [255, 255, 255, 255] },
  ],
  brg: [
    { at: 0, color: [0, 0, 255, 255] },
    { at: 0.25, color: [128, 0, 128, 255] },
    { at: 0.5, color: [255, 0, 0, 255] },
    { at: 0.75, color: [128, 128, 0, 255] },
    { at: 1, color: [0, 255, 0, 255] },
  ],
  gist_rainbow: [
    { at: 0, color: [255, 0, 255, 255] },
    { at: 0.16, color: [0, 0, 255, 255] },
    { at: 0.33, color: [0, 255, 255, 255] },
    { at: 0.5, color: [0, 255, 0, 255] },
    { at: 0.66, color: [255, 255, 0, 255] },
    { at: 0.83, color: [255, 128, 0, 255] },
    { at: 1, color: [255, 0, 0, 255] },
  ],
  rainbow: [
    { at: 0, color: [128, 0, 255, 255] },
    { at: 0.2, color: [0, 0, 255, 255] },
    { at: 0.4, color: [0, 255, 128, 255] },
    { at: 0.6, color: [128, 255, 0, 255] },
    { at: 0.75, color: [255, 255, 0, 255] },
    { at: 0.88, color: [255, 128, 0, 255] },
    { at: 1, color: [255, 0, 0, 255] },
  ],
  jet: [
    { at: 0, color: [0, 0, 143, 255] },
    { at: 0.15, color: [0, 0, 255, 255] },
    { at: 0.4, color: [0, 255, 255, 255] },
    { at: 0.65, color: [255, 255, 0, 255] },
    { at: 0.85, color: [255, 0, 0, 255] },
    { at: 1, color: [128, 0, 0, 255] },
  ],
  nipy_spectral: [
    { at: 0, color: [0, 0, 0, 255] },
    { at: 0.12, color: [90, 0, 140, 255] },
    { at: 0.25, color: [0, 0, 200, 255] },
    { at: 0.4, color: [0, 160, 200, 255] },
    { at: 0.55, color: [0, 180, 0, 255] },
    { at: 0.7, color: [220, 220, 0, 255] },
    { at: 0.85, color: [240, 0, 0, 255] },
    { at: 1, color: [200, 200, 200, 255] },
  ],
  gist_ncar: [
    { at: 0, color: [0, 0, 128, 255] },
    { at: 0.15, color: [0, 128, 255, 255] },
    { at: 0.3, color: [0, 255, 128, 255] },
    { at: 0.45, color: [128, 255, 0, 255] },
    { at: 0.6, color: [255, 255, 0, 255] },
    { at: 0.75, color: [255, 0, 0, 255] },
    { at: 0.9, color: [255, 0, 255, 255] },
    { at: 1, color: [255, 255, 255, 255] },
  ],
};

export function parseColor(color: string | Rgba): Rgba {
  if (Array.isArray(color)) return color;
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (!match) throw new Error(`Unsupported color format: ${color}`);
  return [
    Number.parseInt(match[1]!, 16),
    Number.parseInt(match[2]!, 16),
    Number.parseInt(match[3]!, 16),
    255,
  ];
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
  points: Array<{ at: number; color: Rgba }>,
  gamma = 1,
  contrast = 1,
  brightness = 0,
): Rgba[] {
  const sorted = [...points].sort((a, b) => a.at - b.at);
  return Array.from({ length: 256 }, (_, index) => {
    const at = index / 255;
    const hi =
      sorted.find((point) => point.at >= at) ?? sorted[sorted.length - 1]!;
    const lo =
      [...sorted].reverse().find((point) => point.at <= at) ?? sorted[0]!;
    const span = hi.at - lo.at || 1;
    const t = (at - lo.at) / span;
    const rgba = lo.color.map((value, channel) =>
      Math.round(value + (hi.color[channel]! - value) * t),
    ) as Rgba;
    return [
      adjust(rgba[0], gamma, contrast, brightness),
      adjust(rgba[1], gamma, contrast, brightness),
      adjust(rgba[2], gamma, contrast, brightness),
      rgba[3],
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

  // Handle general _r or _inverted suffix (e.g. viridis_r, gray_r, magma_r)
  if (baseName) {
    const rootName = baseName.endsWith("_r")
      ? baseName.slice(0, -2)
      : baseName.endsWith("_inverted")
        ? baseName.slice(0, -9)
        : undefined;
    if (rootName && rootName in ANCHORS) {
      const rootAnchors = ANCHORS[rootName]!;
      const invertedAnchors = rootAnchors.map((point) => ({
        at: 1 - point.at,
        color: point.color,
      }));
      return interpolate(invertedAnchors, gamma, contrast, brightness);
    }
  }

  if (typeof config === "object" && "points" in config) {
    return interpolate(
      config.points.map((point) => ({
        at: point.at,
        color: parseColor(point.color),
      })),
      gamma,
      contrast,
      brightness,
    );
  }

  // Fallback to viridis
  return interpolate(ANCHORS.viridis!, gamma, contrast, brightness);
}
