# Spectrogram Global Frame Grid & Zero-Drift Time Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate audio tracker drift, tile-boundary phase discontinuities, and shader time-stretching across long audio recordings by anchoring spectrogram tiling to a global continuous frame grid with exact window overlap and linear hop-duration coordinate mapping.

**Architecture:** Instead of slicing audio by arbitrary floating-point seconds (which breaks the hop grid and leaves leftover samples at tile seams), tiles are defined by global integer frame intervals $[T \cdot F_{\text{tile}}, (T+1) \cdot F_{\text{tile}})$. Audio sample slices are fetched with the required $(\text{windowSize} - \text{hopSize})$ overlap so that tile $T$ and tile $T+1$ connect with zero sample discontinuity. WebGL2 and Canvas renderers map continuous time linearly via exact hop duration ($\Delta t / \Delta t_{\text{hop}}$), guaranteeing zero time drift across infinite audio durations.

**Tech Stack:** TypeScript, WebGL2 GLSL shaders, Canvas 2D, Vitest, WebAssembly.

## Global Constraints

- Spectrogram matrices across tile boundaries must be mathematically identical to a single monolithic STFT pass over the entire audio signal.
- The time-to-frame coordinate mapping in all shaders (`normal`, `dither`, `sobel`, `terrain`, and Canvas 2D) must be strictly linear and continuous across tile seams.
- Must maintain full backwards compatibility for public API and existing viewer interfaces.
- All existing 372 unit tests, Biome linting, and TypeScript typechecking must pass cleanly.

---

### Task 1: Refactor Spectrogram Viewer Tile Generation to Global Frame Grid

**Files:**
- Modify: `packages/core/src/viewers/spectrogram/viewer.ts:740-785`
- Modify: `packages/core/src/viewers/spectrogram/types.ts:60-90`

**Interfaces:**
- Consumes:
  - `source.sampleRate`, `source.duration`
  - `config.windowSize`, `config.hopSize`, `config.fftSize`
- Produces:
  - `tileRangesForTimeRange(startTime, endTime)` returns tiles bounded by exact global frame indices, sample offsets, and timestamps.
  - `effectiveFramesPerTile`: integer number of STFT frames per tile (e.g. 512 or 1024 frames).

- [ ] **Step 1: Write the failing unit test for global frame grid alignment**

Create test case in `packages/core/src/viewers/spectrogram/tile-continuity.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { computeStftMatrix } from "./backends/stft";
import { MainThreadComputeBackend } from "./backends/backend";
import type { AudioSource } from "../../types";

describe("Spectrogram Tile Continuity & Global Frame Alignment", () => {
  it("produces zero phase jump and identical frames between tiled computation and monolithic STFT", async () => {
    const sampleRate = 44100;
    const duration = 60.0; // 1 minute of audio
    const totalSamples = Math.floor(duration * sampleRate);
    const samples = new Float32Array(totalSamples);
    // Generate multi-frequency test tone
    for (let i = 0; i < totalSamples; i++) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) +
                   0.5 * Math.sin((2 * Math.PI * 1200 * i) / sampleRate);
    }

    const stft = {
      windowSize: 2048,
      hopSize: 512,
      fftSize: 2048,
      window: "hann" as const,
    };

    // 1. Monolithic STFT over entire 60s
    const monolithic = computeStftMatrix(samples, {
      channel: 0,
      timeStart: 0,
      sampleRate,
      stft,
    });

    // 2. Simulated tiled reads with frame-aligned chunks
    const framesPerTile = 512;
    const totalFrames = monolithic.frameCount;
    const tileCount = Math.ceil(totalFrames / framesPerTile);

    const source: AudioSource = {
      sampleRate,
      duration,
      channelCount: 1,
      id: "test-continuous-source",
      read: ({ startTime, endTime }) => {
        const start = Math.max(0, Math.floor(startTime * sampleRate));
        const end = Math.min(totalSamples, Math.ceil(endTime * sampleRate));
        return samples.slice(start, end);
      },
    };

    const backend = new MainThreadComputeBackend();
    const reconstructedMag = new Float32Array(totalFrames * monolithic.binCount);

    for (let t = 0; t < tileCount; t++) {
      const globalFrameStart = t * framesPerTile;
      const frameCount = Math.min(framesPerTile, totalFrames - globalFrameStart);
      const sampleStart = globalFrameStart * stft.hopSize;
      const sampleEnd = (globalFrameStart + frameCount - 1) * stft.hopSize + stft.windowSize;

      const tileTimeStart = sampleStart / sampleRate;
      const tileTimeEnd = sampleEnd / sampleRate;

      const tileMatrix = await backend.computeTile({
        source,
        channel: 0,
        timeStart: tileTimeStart,
        timeEnd: tileTimeEnd,
        stft,
      });

      expect(tileMatrix.frameCount).toBe(frameCount);
      reconstructedMag.set(
        tileMatrix.magnitude.subarray(0, frameCount * monolithic.binCount),
        globalFrameStart * monolithic.binCount,
      );
    }

    // Assert 100% exact parity across every single frame of the 60 seconds
    for (let i = 0; i < monolithic.magnitude.length; i++) {
      expect(reconstructedMag[i]).toBeCloseTo(monolithic.magnitude[i]!, 5);
    }
  });
});
```

- [ ] **Step 2: Update `SpectrogramViewer.tileRangesForTimeRange` in `viewer.ts`**

Update `packages/core/src/viewers/spectrogram/viewer.ts`:
Calculate tile boundaries anchored to `globalFrameStart`:
```typescript
  private get framesPerTile(): number {
    const sampleRate = this.scope.source.sampleRate || 44100;
    const hopSize = this.config.hopSize || 512;
    const nominalDuration = this.effectiveTileDuration;
    const nominalFrames = Math.round((nominalDuration * sampleRate) / hopSize);
    return Math.max(64, Math.min(4096, nominalFrames));
  }

  private tileRangesForTimeRange(
    startTime: number,
    endTime: number,
  ): Array<{ channel: number; timeStart: number; timeEnd: number }> {
    const source = this.scope.source;
    const sampleRate = source.sampleRate;
    const hopSize = this.config.hopSize;
    const windowSize = this.config.windowSize;
    const totalSamples = Math.floor(source.duration * sampleRate);
    const totalFrames = Math.max(
      0,
      Math.floor((totalSamples - windowSize) / hopSize) + 1,
    );
    if (totalFrames === 0) return [];

    const framesPerTile = this.framesPerTile;
    const channel = this.config.channel;

    const startFrame = Math.max(0, Math.floor((startTime * sampleRate) / hopSize));
    const endFrame = Math.min(totalFrames, Math.ceil((endTime * sampleRate) / hopSize) + 1);

    const firstTileIndex = Math.floor(startFrame / framesPerTile);
    const lastTileIndex = Math.floor(Math.max(0, endFrame - 1) / framesPerTile);

    const ranges: Array<{ channel: number; timeStart: number; timeEnd: number }> = [];

    for (let tileIdx = firstTileIndex; tileIdx <= lastTileIndex; tileIdx++) {
      const globalFrameStart = tileIdx * framesPerTile;
      const frameCount = Math.min(framesPerTile, totalFrames - globalFrameStart);
      if (frameCount <= 0) continue;

      const sampleStart = globalFrameStart * hopSize;
      const sampleEnd = (globalFrameStart + frameCount - 1) * hopSize + windowSize;

      ranges.push({
        channel,
        timeStart: sampleStart / sampleRate,
        timeEnd: sampleEnd / sampleRate,
      });
    }

    return ranges;
  }
```

- [ ] **Step 3: Run the test to verify tile continuity**

Run: `npx vitest run packages/core/src/viewers/spectrogram/tile-continuity.test.ts`
Expected: PASS

---

### Task 2: Linear Hop-Duration Shader Coordinate Mapping

**Files:**
- Modify: `packages/core/src/viewers/spectrogram/renderers/webgl2-normal-program.ts`
- Modify: `packages/core/src/viewers/spectrogram/renderers/webgl2-dither-program.ts`
- Modify: `packages/core/src/viewers/spectrogram/renderers/webgl2-sobel-program.ts`
- Modify: `packages/core/src/viewers/spectrogram/renderers/webgl2-terrain-program.ts`
- Modify: `packages/core/src/viewers/spectrogram/renderers/webgl2-coordinate-mapping.ts`
- Modify: `packages/core/src/viewers/spectrogram/renderers/canvas.ts`

**Interfaces:**
- Consumes:
  - `tile.timeStart`: timestamp of Frame 0 ($g_{\text{start}} \cdot \text{hopSize} / f_s$).
  - `tile.sampleRate`, `stft.hopSize`
- Produces:
  - Shader uniform: `u_tileHopDuration` or `u_tileTimeRange` ($[t_{\text{start}}, t_{\text{start}} + \text{frameCount} \cdot \Delta t_{\text{hop}}]$).
  - Exact frame sampling: `framePosition = clamp((time - tileStartTime) / hopDuration, 0.0, frameCount - 1.0)`.

- [ ] **Step 1: Update WebGL2 Shader Programs to use exact linear hop time mapping**

In `webgl2-normal-program.ts`, `webgl2-dither-program.ts`, and `webgl2-sobel-program.ts`:
Update fragment shader coordinate calculation:
```glsl
  float time = mix(u_viewport.x, u_viewport.y, globalX);
  if (time < u_tileTimeRange.x || time >= u_tileTimeRange.y) discard;
  ...
  float hopDuration = (u_tileTimeRange.y - u_tileTimeRange.x) / max(1.0, u_tileSize.x);
  float framePosition = clamp((time - u_tileTimeRange.x) / max(0.000001, hopDuration), 0.0, max(0.0, u_tileSize.x - 1.0));
```

And in `drawTile`:
```typescript
    const hopDuration = tile.sampleRate > 0 ? (tile.timeEnd - tile.timeStart) / Math.max(1, tile.frameCount) : 0;
    const activeTileDuration = tile.frameCount * (tile.times.length > 1 ? (tile.times[1]! - tile.times[0]!) : (1 / (tile.sampleRate || 44100)));
    const tileEndTime = tile.timeStart + activeTileDuration;
    this.shader.uniform2f("u_tileTimeRange", tile.timeStart, tileEndTime);
```

- [ ] **Step 2: Update `webgl2-coordinate-mapping.ts`**

Update `timeToTextureU` and `timeToFrame`:
```typescript
export function timeToTextureU(input: {
  time: number;
  tileStartTime: number;
  tileEndTime: number;
  frameCount?: number;
}): number {
  const span = input.tileEndTime - input.tileStartTime || 1;
  return Math.max(0, Math.min(1, (input.time - input.tileStartTime) / span));
}

export function timeToFrame(input: {
  time: number;
  tileStartTime: number;
  tileEndTime: number;
  frameCount: number;
}): number {
  if (input.frameCount <= 0) return 0;
  const hopDuration = (input.tileEndTime - input.tileStartTime) / Math.max(1, input.frameCount);
  return Math.max(
    0,
    Math.min(
      input.frameCount - 1,
      Math.floor((input.time - input.tileStartTime) / Math.max(0.000001, hopDuration)),
    ),
  );
}
```

- [ ] **Step 3: Update `CanvasSpectrogramRenderer` in `canvas.ts`**

In `paintTile`:
Ensure `endX` and pixel-to-time mapping respects `tile.timeStart + tile.frameCount * hopDuration` with zero boundary stretching.

---

### Task 3: Fast Multi-Hour Tile Boundary & Audio Tracker Synchronization Test Suite

**Files:**
- Create: `packages/core/src/viewers/spectrogram/audio-tracker-sync.test.ts`

**Interfaces:**
- Consumes:
  - `SpectrogramViewer`, `Sonoscope`, `CanvasSpectrogramRenderer`, `timeToFrame`, `timeToTextureU`
- Execution speed: Runs in `< 50ms` by using lazy on-demand chunk evaluation (only computes the visible ~800 frames around the test transient) and mathematical verification across all 360 tile boundaries.

- [x] **Step 1: Write fast 1-hour audio playhead tracking test**

Validate:
1. Mathematical validation across all 360 tile boundaries of a 3600-second stream:
   - For all $T \in [0, 360)$, verify $\text{tile}[T+1].\text{frameStart} === \text{tile}[T].\text{frameStart} + \text{tile}[T].\text{frameCount}$ (exactly zero sample phase drift).
2. Lazy/on-demand rendering at $t = 3590.0\text{s}$ (near end of 1-hour recording):
   - Only computes STFT for the visible ~10s window (running in $< 10\text{ms}$).
   - Queries pixel coordinates of the playhead and spectral transient peak.
   - Asserts sub-pixel alignment ($\Delta < 0.5\text{px}$).

- [x] **Step 2: Run the test suite**

Run: `npx vitest run packages/core/src/viewers/spectrogram/audio-tracker-sync.test.ts`
Expected: PASS in `< 50ms`.

---

### Task 4: Full Verification and Cleanup

**Files:**
- None (verification across repository)

- [ ] **Step 1: Run type checking**
Run: `npm run check:types`
Expected: PASS

- [ ] **Step 2: Run Biome check**
Run: `npm run check:biome`
Expected: PASS

- [ ] **Step 3: Run all unit tests**
Run: `npm test`
Expected: All test suites PASS

- [ ] **Step 4: Run browser test suite**
Run: `npm run test:browser`
Expected: PASS
