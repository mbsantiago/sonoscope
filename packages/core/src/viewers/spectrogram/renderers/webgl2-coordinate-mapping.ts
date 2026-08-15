import type { FrequencyScale } from "../../../types";
import { canvasToTimeFrequency } from "../frequency-scale";

export function viewportPixelToFrequency(input: {
  y: number;
  height: number;
  minFrequency: number;
  maxFrequency: number;
  frequencyScale: FrequencyScale;
}): number {
  return canvasToTimeFrequency(0, input.y, 1, input.height, {
    startTime: 0,
    endTime: 1,
    minFrequency: input.minFrequency,
    maxFrequency: input.maxFrequency,
    frequencyScale: input.frequencyScale,
  }).frequency;
}

export function frequencyToTextureV(input: {
  frequency: number;
  minFrequency: number;
  maxFrequency: number;
}): number {
  const span = input.maxFrequency - input.minFrequency || 1;
  return Math.max(
    0,
    Math.min(1, (input.frequency - input.minFrequency) / span),
  );
}

export function frequencyToWebGLTextureV(input: {
  frequency: number;
  minFrequency: number;
  maxFrequency: number;
}): number {
  return frequencyToTextureV(input);
}

export function textureVToBin(input: {
  textureV: number;
  binCount: number;
}): number {
  return Math.max(
    0,
    Math.min(input.binCount - 1, Math.floor(input.textureV * input.binCount)),
  );
}

export function timeToTextureU(input: {
  time: number;
  tileStartTime: number;
  tileEndTime: number;
}): number {
  const span = input.tileEndTime - input.tileStartTime || 1;
  return Math.max(0, Math.min(1, (input.time - input.tileStartTime) / span));
}

export function viewportPixelToTime(input: {
  x: number;
  width: number;
  viewportStartTime: number;
  viewportEndTime: number;
}): number {
  return (
    input.viewportStartTime +
    (input.x / input.width) * (input.viewportEndTime - input.viewportStartTime)
  );
}

export function timeToFrame(input: {
  time: number;
  tileStartTime: number;
  tileEndTime: number;
  frameCount: number;
}): number {
  return Math.max(
    0,
    Math.min(
      input.frameCount - 1,
      Math.floor(timeToTextureU(input) * input.frameCount),
    ),
  );
}

export function viewportPixelToTileSample(input: {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportStartTime: number;
  viewportEndTime: number;
  viewportMinFrequency: number;
  viewportMaxFrequency: number;
  frequencyScale: FrequencyScale;
  tileStartTime: number;
  tileEndTime: number;
  tileMinFrequency: number;
  tileMaxFrequency: number;
  frameCount: number;
  binCount: number;
}): {
  time: number;
  frequency: number;
  textureU: number;
  textureV: number;
  frame: number;
  bin: number;
} {
  const time = viewportPixelToTime({
    x: input.x,
    width: input.width,
    viewportStartTime: input.viewportStartTime,
    viewportEndTime: input.viewportEndTime,
  });
  const frequency = viewportPixelToFrequency({
    y: input.y,
    height: input.height,
    minFrequency: input.viewportMinFrequency,
    maxFrequency: input.viewportMaxFrequency,
    frequencyScale: input.frequencyScale,
  });
  const textureU = timeToTextureU({
    time,
    tileStartTime: input.tileStartTime,
    tileEndTime: input.tileEndTime,
  });
  const textureV = frequencyToWebGLTextureV({
    frequency,
    minFrequency: input.tileMinFrequency,
    maxFrequency: input.tileMaxFrequency,
  });
  return {
    time,
    frequency,
    textureU,
    textureV,
    frame: timeToFrame({
      time,
      tileStartTime: input.tileStartTime,
      tileEndTime: input.tileEndTime,
      frameCount: input.frameCount,
    }),
    bin: textureVToBin({ textureV, binCount: input.binCount }),
  };
}
