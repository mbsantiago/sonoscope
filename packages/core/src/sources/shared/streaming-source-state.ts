import type { AudioRange } from "../../types";

export type PendingRead = {
  channel: number;
  startFrame: number;
  endFrame: number;
  resolve: (samples: Float32Array) => void;
  reject: (error: Error) => void;
};

export type DecodedRange = { startFrame: number; endFrame: number };

/** Merges a new decoded range into the sorted, merged decodedRanges array in-place. */
export function addDecodedRange(
  decodedRanges: DecodedRange[],
  startFrame: number,
  endFrame: number,
): void {
  if (endFrame <= startFrame) return;
  decodedRanges.push({ startFrame, endFrame });
  decodedRanges.sort((l, r) => l.startFrame - r.startFrame);
  const merged: DecodedRange[] = [];
  for (const range of decodedRanges) {
    const prev = merged[merged.length - 1];
    if (!prev || range.startFrame > prev.endFrame) {
      merged.push({ ...range });
    } else {
      prev.endFrame = Math.max(prev.endFrame, range.endFrame);
    }
  }
  decodedRanges.splice(0, decodedRanges.length, ...merged);
}

/** Returns true if [startFrame, endFrame) is fully covered by a decoded range. */
export function isRangeDecoded(
  decodedRanges: DecodedRange[],
  startFrame: number,
  endFrame: number,
): boolean {
  if (endFrame <= startFrame) return true;
  return decodedRanges.some(
    (r) => r.startFrame <= startFrame && r.endFrame >= endFrame,
  );
}

/** Rejects all pending reads with the given error and empties the array. */
export function rejectPending(pending: PendingRead[], error: Error): void {
  while (pending.length > 0) pending.pop()?.reject(error);
}

/** Emits a range-available event to all registered handlers. */
export function emitRange(
  handlers: Set<(range: AudioRange) => void>,
  startTime: number,
  endTime: number,
): void {
  const range: AudioRange = { startTime, endTime };
  for (const handler of handlers) handler(range);
}

/** Resolves immediately if more frames are needed or stream is done; otherwise waits. */
export function waitForDemand(
  getDecodedCount: () => number,
  getRequestedUntil: () => number,
  getIsStreamDone: () => boolean,
  setResolver: (r: (() => void) | undefined) => void,
): Promise<void> {
  if (getDecodedCount() < getRequestedUntil() || getIsStreamDone()) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    setResolver(resolve);
  });
}

/** Advances requestedUntilFrame and wakes the demand resolver if needed. */
export function requestFrames(
  endFrame: number,
  sampleRate: number,
  getRequestedUntil: () => number,
  setRequestedUntil: (n: number) => void,
  getDemandResolver: () => (() => void) | undefined,
  clearDemandResolver: () => void,
): void {
  const target = endFrame + sampleRate * 15;
  if (target > getRequestedUntil()) {
    setRequestedUntil(target);
    const resolve = getDemandResolver();
    if (resolve) {
      clearDemandResolver();
      resolve();
    }
  }
}
