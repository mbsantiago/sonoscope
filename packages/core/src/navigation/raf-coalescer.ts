/**
 * Batches high-frequency events (wheel, pointermove) into at most one
 * `onFrame` call per animation frame, always using the *latest* pushed
 * state. This is the one place that pattern is implemented, so it can't
 * drift out of sync between the wheel and drag handlers the way two
 * hand-rolled copies did.
 */
export interface FrameCoalescer<T> {
  push(state: T): void;
  cancel(): void;
}

export function createFrameCoalescer<T>(
  onFrame: (state: T) => void,
): FrameCoalescer<T> {
  let pending: T | undefined;
  let frame: number | undefined;

  const flush = () => {
    frame = undefined;
    if (pending === undefined) return;
    const state = pending;
    pending = undefined;
    onFrame(state);
  };

  return {
    push(state: T) {
      pending = state;
      if (frame !== undefined) return;
      frame = requestAnimationFrame(flush);
    },
    cancel() {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      pending = undefined;
    },
  };
}
