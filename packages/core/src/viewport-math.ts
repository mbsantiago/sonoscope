export function clampViewportTimes(
  startTime: number,
  endTime: number,
  sourceDuration: number,
  minDuration: number,
  maxDuration: number,
): { startTime: number; endTime: number } {
  const duration = Math.min(
    Math.max(endTime - startTime, minDuration),
    maxDuration,
    sourceDuration,
  );
  const clampedStart = Math.min(
    Math.max(0, startTime),
    Math.max(0, sourceDuration - duration),
  );
  return { startTime: clampedStart, endTime: clampedStart + duration };
}
