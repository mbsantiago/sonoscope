import type { FrequencyScale, ViewportConfig } from "./types";

export function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

export function melToHz(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
}

export function hzToScale(hz: number, scale: FrequencyScale): number {
  if (scale === "mel") return hzToMel(hz);
  if (scale === "log") return Math.log10(Math.max(1, hz));
  return hz;
}

export function scaleToHz(value: number, scale: FrequencyScale): number {
  if (scale === "mel") return melToHz(value);
  if (scale === "log") return 10 ** value;
  return value;
}

export function canvasToTimeFrequency(
  x: number,
  y: number,
  width: number,
  height: number,
  viewport: ViewportConfig,
): { time: number; frequency: number } {
  const time =
    viewport.startTime + (x / width) * (viewport.endTime - viewport.startTime);
  const min = hzToScale(viewport.minFrequency, viewport.frequencyScale);
  const max = hzToScale(viewport.maxFrequency, viewport.frequencyScale);
  const scaled = max - (y / height) * (max - min);
  return { time, frequency: scaleToHz(scaled, viewport.frequencyScale) };
}

export function timeFrequencyToCanvas(
  time: number,
  frequency: number,
  width: number,
  height: number,
  viewport: ViewportConfig,
): { x: number; y: number } {
  const x =
    ((time - viewport.startTime) / (viewport.endTime - viewport.startTime)) *
    width;
  const min = hzToScale(viewport.minFrequency, viewport.frequencyScale);
  const max = hzToScale(viewport.maxFrequency, viewport.frequencyScale);
  const scaled = hzToScale(frequency, viewport.frequencyScale);
  const y = (1 - (scaled - min) / (max - min)) * height;
  return { x, y };
}
