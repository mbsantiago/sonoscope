# Optimized WAV PCM Decoder & Streaming Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the performance bottleneck in WAV decoding by implementing specialized TypedArray fast paths for PCM/Float formats and zero-reallocation chunk streaming in `StreamingWavSource`.

**Architecture:**
1. In `src/sources/wav.ts`: Specialize `decodeWavPcm` for 16-bit (mono/stereo/multi), 24-bit, 32-bit PCM, and 32-bit Float using direct TypedArray views and tight de-interleave loops. Allow decoding directly into target pre-allocated `Float32Array` buffers at an offset.
2. In `src/sources/streaming-wav-source.ts`: Stream and decode chunks incrementally without storing and re-concatenating all chunks on every read (`concatChunks`).
3. In `src/performance.bench.ts`: Add comprehensive benchmarks measuring WAV decoding throughput and latency.

**Tech Stack:** TypeScript, TypedArrays (`Int16Array`, `Float32Array`, `Int32Array`, `Uint8Array`), Vitest Benchmarks.

---

### Task 1: Specialize `decodeWavPcm` in `src/sources/wav.ts`

**Files:**
- Modify: `src/sources/wav.ts`
- Test: `src/sources/wav.test.ts`

**Interfaces:**
- `decodeWavPcm(bytes: Uint8Array, info: WavInfo, byteOffset?: number, target?: Float32Array[], targetOffset?: number): Float32Array[]`

- [x] **Step 1: Write tests for `decodeWavPcm` with direct `target` buffer and all bit depths**
- [x] **Step 2: Run `npx vitest run src/sources/wav.test.ts` to verify expectations**
- [x] **Step 3: Implement optimized `decodeWavPcm` with fast paths (16-bit mono/stereo, 24-bit, 32-bit float zero-copy/de-interleave)**
- [x] **Step 4: Run `npx vitest run src/sources/wav.test.ts` to verify all pass**

---

### Task 2: Implement Zero-Copy Incremental Streaming in `src/sources/streaming-wav-source.ts`

**Files:**
- Modify: `src/sources/streaming-wav-source.ts`
- Test: `src/sources/streaming-wav-source.test.ts`

**Interfaces:**
- `StreamingWavSource`: incremental streaming reader consuming chunks one-by-one, keeping at most `< blockAlign` leftover bytes between chunks, decoding directly into pre-allocated `this.decoded` arrays.

- [x] **Step 1: Write/update streaming tests for partial chunk boundaries and seekable ranges in `src/sources/streaming-wav-source.test.ts`**
- [x] **Step 2: Run `npx vitest run src/sources/streaming-wav-source.test.ts`**
- [x] **Step 3: Refactor `StreamingWavSource` to decode chunks incrementally into `this.decoded` without `concatChunks`**
- [x] **Step 4: Run `npx vitest run src/sources/streaming-wav-source.test.ts`**

---

### Task 3: Benchmarks and Full Verification Suite

**Files:**
- Modify: `src/performance.bench.ts`

- [x] **Step 1: Add WAV decoding benchmarks to `src/performance.bench.ts`**
- [x] **Step 2: Run `npx vitest bench src/performance.bench.ts --run`**
- [x] **Step 3: Run Biome, TypeScript check, unit tests, and browser tests**
