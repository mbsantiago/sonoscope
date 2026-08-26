import type { SpectrogramMatrix } from "../types";

export function tileFrequencyRange(
  tile: Pick<SpectrogramMatrix, "frequencies" | "sampleRate">,
): { min: number; max: number } {
  return {
    min: tile.frequencies[0] ?? 0,
    max:
      tile.frequencies[tile.frequencies.length - 1] ??
      Math.max(1, tile.sampleRate / 2),
  };
}

export function tileTimeRange(
  tile: Pick<
    SpectrogramMatrix,
    "times" | "sampleRate" | "timeStart" | "timeEnd" | "frameCount"
  >,
): { startTime: number; endTime: number } {
  const hopDuration =
    tile.times.length > 1
      ? (tile.times[tile.times.length - 1]! - tile.times[0]!) /
        Math.max(1, tile.frameCount - 1)
      : tile.sampleRate > 0
        ? (tile.timeEnd - tile.timeStart) / tile.frameCount
        : 0;
  const startTime = tile.times.length > 0 ? tile.times[0]! : tile.timeStart;
  return { startTime, endTime: startTime + tile.frameCount * hopDuration };
}
