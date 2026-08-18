import type { FrequencyScale } from "../../types";
import { hzToScale } from "../spectrogram/frequency-scale";

export type FrequencyFormatMode =
  | "auto"
  | "hz"
  | "khz"
  | ((hz: number) => string);

const STANDARD_HZ_STEPS = [
  1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000,
];

const STANDARD_LOG_TICKS = [
  10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 600, 700, 800,
  900, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 20000,
  30000, 40000, 50000,
];

const STANDARD_MEL_CANDIDATES = [
  0, 50, 100, 200, 300, 400, 500, 700, 1000, 1500, 2000, 3000, 4000, 5000, 6000,
  7000, 8000, 10000, 12000, 14000, 16000, 18000, 20000, 22050, 24000,
];

export type FrequencyTicksResult = {
  majorTicks: number[];
  minorTicks: number[];
};

export function computeFrequencyTicks(
  minFrequency: number,
  maxFrequency: number,
  pixelHeight: number,
  scale: FrequencyScale = "linear",
  minPixelSpacing = 45,
): FrequencyTicksResult {
  const height = Math.max(1, pixelHeight);
  const minFreq = Math.max(0, minFrequency);
  const maxFreq = Math.max(minFreq + 1, maxFrequency);

  if (scale === "linear") {
    const span = maxFreq - minFreq;
    const targetCount = Math.max(1, Math.floor(height / minPixelSpacing));
    const rawStep = span / targetCount;

    let majorStep = STANDARD_HZ_STEPS[STANDARD_HZ_STEPS.length - 1]!;
    for (const cand of STANDARD_HZ_STEPS) {
      if (cand >= rawStep) {
        majorStep = cand;
        break;
      }
    }

    const minorStep = majorStep / 5;
    const majorTicks: number[] = [];
    const minorTicks: number[] = [];

    const startMajor = Math.floor(minFreq / majorStep) * majorStep;
    for (let f = startMajor; f <= maxFreq + 1e-6; f += majorStep) {
      const cleanF = Math.round(f);
      if (cleanF >= minFreq && cleanF <= maxFreq) {
        majorTicks.push(cleanF);
      }
    }

    const startMinor = Math.floor(minFreq / minorStep) * minorStep;
    for (let f = startMinor; f <= maxFreq + 1e-6; f += minorStep) {
      const cleanF = Math.round(f);
      if (cleanF >= minFreq && cleanF <= maxFreq) {
        minorTicks.push(cleanF);
      }
    }

    return { majorTicks, minorTicks };
  }

  if (scale === "log") {
    const minScaled = hzToScale(Math.max(1, minFreq), "log");
    const maxScaled = hzToScale(maxFreq, "log");
    const spanScaled = maxScaled - minScaled;

    const majorCandidates = STANDARD_LOG_TICKS.filter(
      (f) =>
        f >= minFreq &&
        f <= maxFreq &&
        (f === 10 ||
          f === 20 ||
          f === 50 ||
          f === 100 ||
          f === 200 ||
          f === 500 ||
          f === 1000 ||
          f === 2000 ||
          f === 5000 ||
          f === 10000 ||
          f === 20000),
    );

    const majorTicks: number[] = [];
    let lastY = -Infinity;

    for (const f of majorCandidates) {
      const s = hzToScale(f, "log");
      const y = (1 - (s - minScaled) / spanScaled) * height;
      if (
        Math.abs(y - lastY) >= minPixelSpacing * 0.75 ||
        lastY === -Infinity
      ) {
        majorTicks.push(f);
        lastY = y;
      }
    }

    const minorTicks = STANDARD_LOG_TICKS.filter(
      (f) => f >= minFreq && f <= maxFreq && !majorTicks.includes(f),
    );

    return { majorTicks, minorTicks };
  }

  // Mel Scale
  const minScaled = hzToScale(minFreq, "mel");
  const maxScaled = hzToScale(maxFreq, "mel");
  const spanScaled = maxScaled - minScaled;

  const majorTicks: number[] = [];
  let lastY = -Infinity;

  for (const f of STANDARD_MEL_CANDIDATES) {
    if (f < minFreq || f > maxFreq) continue;
    const s = hzToScale(f, "mel");
    const y = (1 - (s - minScaled) / spanScaled) * height;
    if (Math.abs(y - lastY) >= minPixelSpacing || lastY === -Infinity) {
      majorTicks.push(f);
      lastY = y;
    }
  }

  return { majorTicks, minorTicks: [] };
}

export function formatFrequencyLabel(
  hz: number,
  format: FrequencyFormatMode = "auto",
): string {
  if (typeof format === "function") {
    return format(hz);
  }

  const absHz = Math.abs(hz);

  if (format === "hz") {
    return `${Math.round(absHz)} Hz`;
  }

  if (format === "khz") {
    return `${(absHz / 1000).toFixed(2)} kHz`;
  }

  // "auto" formatting:
  if (absHz === 0) return "0 Hz";
  if (absHz < 1000) {
    return `${Math.round(absHz)} Hz`;
  }

  const inKhz = absHz / 1000;
  if (inKhz % 1 === 0) {
    return `${inKhz} kHz`;
  }
  return `${inKhz.toFixed(1)} kHz`;
}
