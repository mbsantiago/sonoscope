import type { FrequencyBounds, TimeBounds, ViewportConfig } from "../types";
import {
  type AxisBounds,
  type AxisRange,
  panAxisRange,
  zoomAxisRange,
} from "./range";

const DEFAULT_MIN_DURATION_SECONDS = 0.001;
const DEFAULT_MIN_SPAN_HZ = 10;

function timeAxisBounds(bounds: TimeBounds): AxisBounds {
  return {
    min: bounds.startTime,
    max: bounds.endTime,
    minSpan: bounds.minDurationSeconds ?? DEFAULT_MIN_DURATION_SECONDS,
    maxSpan: bounds.maxDurationSeconds ?? bounds.endTime - bounds.startTime,
  };
}

function frequencyAxisBounds(bounds: FrequencyBounds): AxisBounds {
  return {
    min: bounds.minFrequency,
    max: bounds.maxFrequency,
    minSpan: bounds.minSpanHz ?? DEFAULT_MIN_SPAN_HZ,
    maxSpan: bounds.maxFrequency - bounds.minFrequency,
  };
}

function timeRange(viewport: ViewportConfig): AxisRange {
  return { min: viewport.startTime, max: viewport.endTime };
}

function frequencyRange(
  viewport: ViewportConfig,
  bounds: FrequencyBounds,
): AxisRange {
  return {
    min: viewport.minFrequency ?? bounds.minFrequency,
    max: viewport.maxFrequency ?? bounds.maxFrequency,
  };
}

export function panViewportTime(
  viewport: ViewportConfig,
  bounds: TimeBounds,
  deltaSeconds: number,
): ViewportConfig {
  const range = timeRange(viewport);
  const result = panAxisRange(range, timeAxisBounds(bounds), deltaSeconds);
  if (result === range) return viewport;
  return { ...viewport, startTime: result.min, endTime: result.max };
}

export function panViewportFrequency(
  viewport: ViewportConfig,
  bounds: FrequencyBounds,
  deltaHz: number,
): ViewportConfig {
  const range = frequencyRange(viewport, bounds);
  const result = panAxisRange(range, frequencyAxisBounds(bounds), deltaHz);
  if (result === range) return viewport;
  return { ...viewport, minFrequency: result.min, maxFrequency: result.max };
}

export function zoomViewportTime(
  viewport: ViewportConfig,
  bounds: TimeBounds,
  centerTime: number,
  factor: number,
): ViewportConfig {
  const range = timeRange(viewport);
  const result = zoomAxisRange(
    range,
    timeAxisBounds(bounds),
    centerTime,
    factor,
  );
  if (result === range) return viewport;
  return { ...viewport, startTime: result.min, endTime: result.max };
}

export function zoomViewportFrequency(
  viewport: ViewportConfig,
  bounds: FrequencyBounds,
  centerFrequency: number,
  factor: number,
): ViewportConfig {
  const range = frequencyRange(viewport, bounds);
  const result = zoomAxisRange(
    range,
    frequencyAxisBounds(bounds),
    centerFrequency,
    factor,
  );
  if (result === range) return viewport;
  return { ...viewport, minFrequency: result.min, maxFrequency: result.max };
}
