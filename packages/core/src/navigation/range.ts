/**
 * Generic 1D range math shared by both the time axis and the frequency
 * axis. This file has zero knowledge of viewers, canvases, or DOM events —
 * it's pure arithmetic and is the cheapest thing in the module to unit test.
 */

export interface AxisRange {
  min: number;
  max: number;
}

export interface AxisBounds {
  min: number;
  max: number;
  /** Smallest allowed span (duration in seconds, or Hz). */
  minSpan: number;
  /** Largest allowed span. Always implicitly capped to (max - min). */
  maxSpan: number;
}

export function isValidAxisBounds(
  bounds: Pick<AxisBounds, "min" | "max">,
): boolean {
  return (
    Number.isFinite(bounds.min) &&
    Number.isFinite(bounds.max) &&
    bounds.max > bounds.min
  );
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Shifts a range by `delta`, clamped so it never leaves `bounds`.
 * Returns the same `range` reference (no-op) if bounds are invalid.
 */
export function panAxisRange(
  range: AxisRange,
  bounds: Pick<AxisBounds, "min" | "max">,
  delta: number,
): AxisRange {
  if (!isValidAxisBounds(bounds)) return range;
  const span = range.max - range.min;
  const min = clamp(
    range.min + delta,
    bounds.min,
    Math.max(bounds.min, bounds.max - span),
  );
  return { min, max: min + span };
}

/**
 * Scales a range by `factor` around `center`, clamped to [minSpan, maxSpan]
 * and to `bounds`. Returns the same `range` reference (no-op) when the
 * factor/bounds are invalid or the resulting span doesn't meaningfully
 * change — callers can use `===` to detect "nothing happened".
 */
export function zoomAxisRange(
  range: AxisRange,
  bounds: AxisBounds,
  center: number,
  factor: number,
): AxisRange {
  if (!Number.isFinite(factor) || factor <= 0) return range;
  if (!isValidAxisBounds(bounds)) return range;

  const currentSpan = range.max - range.min;
  const totalSpan = bounds.max - bounds.min;
  const maxSpan = Math.min(bounds.maxSpan, totalSpan);
  const minSpan = Math.min(bounds.minSpan, maxSpan);
  const span = clamp(currentSpan * factor, minSpan, maxSpan);

  if (Math.abs(span - currentSpan) < 1e-9) return range;

  const ratio = currentSpan <= 0 ? 0.5 : (center - range.min) / currentSpan;
  const min = clamp(
    center - span * ratio,
    bounds.min,
    Math.max(bounds.min, bounds.max - span),
  );
  return { min, max: min + span };
}
