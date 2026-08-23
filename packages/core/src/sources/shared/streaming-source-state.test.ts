import type { AudioRange } from "../../types";
import type { DecodedRange, PendingRead } from "./streaming-source-state";
import { describe, expect, it } from "vitest";
import {
  addDecodedRange,
  emitRange,
  isRangeDecoded,
  rejectPending,
  requestFrames,
  waitForDemand,
} from "./streaming-source-state";

describe("addDecodedRange", () => {
  it("adds a range to an empty array", () => {
    const ranges: DecodedRange[] = [];
    addDecodedRange(ranges, 0, 100);
    expect(ranges).toEqual([{ startFrame: 0, endFrame: 100 }]);
  });

  it("merges adjacent ranges", () => {
    const ranges: DecodedRange[] = [];
    addDecodedRange(ranges, 0, 100);
    addDecodedRange(ranges, 100, 200);
    expect(ranges).toEqual([{ startFrame: 0, endFrame: 200 }]);
  });

  it("merges overlapping ranges", () => {
    const ranges: DecodedRange[] = [];
    addDecodedRange(ranges, 0, 150);
    addDecodedRange(ranges, 100, 200);
    expect(ranges).toEqual([{ startFrame: 0, endFrame: 200 }]);
  });

  it("ignores empty ranges (endFrame <= startFrame)", () => {
    const ranges: DecodedRange[] = [];
    addDecodedRange(ranges, 50, 50);
    expect(ranges).toEqual([]);
  });

  it("keeps non-adjacent ranges separate", () => {
    const ranges: DecodedRange[] = [];
    addDecodedRange(ranges, 0, 50);
    addDecodedRange(ranges, 100, 200);
    expect(ranges).toEqual([
      { startFrame: 0, endFrame: 50 },
      { startFrame: 100, endFrame: 200 },
    ]);
  });
});

describe("isRangeDecoded", () => {
  const ranges: DecodedRange[] = [{ startFrame: 0, endFrame: 100 }];

  it("returns true when range is fully covered", () => {
    expect(isRangeDecoded(ranges, 0, 100)).toBe(true);
    expect(isRangeDecoded(ranges, 10, 90)).toBe(true);
  });

  it("returns false when range extends beyond coverage", () => {
    expect(isRangeDecoded(ranges, 0, 101)).toBe(false);
  });

  it("returns true for empty range (endFrame <= startFrame)", () => {
    expect(isRangeDecoded([], 50, 50)).toBe(true);
  });

  it("returns false with empty ranges array", () => {
    expect(isRangeDecoded([], 0, 10)).toBe(false);
  });
});

describe("rejectPending", () => {
  it("rejects all pending reads and empties the array", () => {
    const errors: Error[] = [];
    const pending: PendingRead[] = [
      {
        channel: 0,
        startFrame: 0,
        endFrame: 10,
        resolve: () => {},
        reject: (e) => errors.push(e),
      },
      {
        channel: 0,
        startFrame: 10,
        endFrame: 20,
        resolve: () => {},
        reject: (e) => errors.push(e),
      },
    ];
    const err = new Error("stream ended");
    rejectPending(pending, err);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toBe(err);
    expect(pending).toHaveLength(0);
  });

  it("is safe on an empty array", () => {
    const pending: PendingRead[] = [];
    expect(() => rejectPending(pending, new Error("x"))).not.toThrow();
  });
});

describe("emitRange", () => {
  it("calls all handlers with the correct range", () => {
    const received: AudioRange[] = [];
    const handlers = new Set<(r: AudioRange) => void>([
      (r) => received.push(r),
      (r) => received.push(r),
    ]);
    emitRange(handlers, 1.0, 2.5);
    expect(received).toHaveLength(2);
    expect(received[0]).toEqual({ startTime: 1.0, endTime: 2.5 });
  });
});

describe("waitForDemand", () => {
  it("resolves immediately when decoded < requested", async () => {
    let resolverSet = false;
    const p = waitForDemand(
      () => 50, // decodedCount
      () => 100, // requestedUntil
      () => false,
      () => {
        resolverSet = true;
      },
    );
    await expect(p).resolves.toBeUndefined();
    expect(resolverSet).toBe(false);
  });

  it("resolves immediately when stream is done", async () => {
    const p = waitForDemand(
      () => 100,
      () => 100,
      () => true,
      () => {},
    );
    await expect(p).resolves.toBeUndefined();
  });

  it("creates a pending promise and calls setResolver when waiting", () => {
    let savedResolver: (() => void) | undefined;
    const p = waitForDemand(
      () => 100,
      () => 100,
      () => false,
      (r) => {
        savedResolver = r;
      },
    );
    expect(savedResolver).toBeTypeOf("function");
    savedResolver!();
    return expect(p).resolves.toBeUndefined();
  });
});

describe("requestFrames", () => {
  it("advances requestedUntil and wakes the resolver", () => {
    let requested = 1000;
    let resolved = false;
    const resolver = () => {
      resolved = true;
    };

    requestFrames(
      500, // endFrame
      44100, // sampleRate (target = 500 + 44100*15 = 662000)
      () => requested,
      (n) => {
        requested = n;
      },
      () => resolver,
      () => {},
    );

    expect(requested).toBe(500 + 44100 * 15);
    expect(resolved).toBe(true);
  });

  it("does nothing if target <= current requestedUntil", () => {
    let requested = 999999;
    let resolved = false;

    requestFrames(
      0,
      44100,
      () => requested,
      (n) => {
        requested = n;
      },
      () => () => {
        resolved = true;
      },
      () => {},
    );

    expect(requested).toBe(999999);
    expect(resolved).toBe(false);
  });
});
