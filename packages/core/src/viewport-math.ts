export function clampViewportTimes(
  startTime: number,
  endTime: number,
  sourceDuration: number,
  minDuration: number,
  maxDuration: number,
  minTime = 0,
): { startTime: number; endTime: number } {
  const span = Math.max(0.0001, sourceDuration - minTime);
  const duration = Math.min(
    Math.max(endTime - startTime, minDuration),
    maxDuration,
    span,
  );
  const clampedStart = Math.min(
    Math.max(minTime, startTime),
    Math.max(minTime, sourceDuration - duration),
  );
  return { startTime: clampedStart, endTime: clampedStart + duration };
}
