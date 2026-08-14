# WASM STFT Compute Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a highly optimized Rust WASM STFT compute engine, a Web Worker (`src/wasm-worker.ts`), and a `SpectrogramComputeBackend` that processes audio tiles according to `StftConfig` and seamlessly bundles into the npm package.

**Architecture:** Create a self-contained Rust crate compiled to `wasm32-unknown-unknown` that performs windowing, real-to-complex FFT, normalization, and magnitude/power/dB computation with precomputed twiddle and window lookup tables. Provide a zero-dependency JS/TS WASM loader with embedded bytecode for effortless npm distribution. Wire this into `src/wasm-worker.ts` and export a worker-pool backend compatible with `SpectrogramComputeBackend`.

**Tech Stack:** Rust (`wasm32-unknown-unknown`), WebAssembly, TypeScript, Web Workers, Vite, Vitest.

## Global Constraints

- Must implement the exact math and conventions of `computeStftMatrix` in `src/stft.ts` (hann, hamming, blackman, rectangular windows; $|FFT| / fftSize$ normalization; $binCount = fftSize / 2$).
- Must implement `SpectrogramComputeBackend` and work seamlessly with `SpectrogramViewer`.
- Must be easy to bundle into the library for npm distribution without requiring consumer bundlers to configure custom `.wasm` loaders.
- Keep implementation small, clear, and YAGNI-driven.
- Full test coverage comparing WASM STFT against JS reference STFT.

---

## File Structure

- Create `wasm/stft/Cargo.toml`: Rust crate configuration for `wasm32-unknown-unknown`.
- Create `wasm/stft/src/lib.rs`: Rust implementation of STFT (windows, FFT, magnitude, power, dB, memory allocation).
- Create `scripts/build-wasm.mjs`: Script to compile Rust to wasm and generate TS binary module with base64 embedding.
- Create `src/wasm-stft-binary.ts`: Generated/embedded WASM bytecode constant and instantiate helper.
- Create `src/wasm-stft.ts`: TypeScript wrapper around WASM instance (`computeWasmStftMatrix`, `initWasmStft`).
- Create `src/wasm-worker.ts`: Web Worker script executing WASM STFT and transferring matrix buffers.
- Create `src/wasm-backend.ts`: `WasmComputeBackend` and `createWasmWorker` helper.
- Modify `src/index.ts`: Export WASM backend, loader, and worker helpers.
- Create `src/wasm-stft.test.ts`: Numerical correctness and equivalence tests with JS STFT.
- Create `src/wasm-worker.test.ts`: Worker communication and transfer list tests.
- Modify `src/performance.bench.ts`: Benchmarks comparing JS vs WASM STFT compute throughput.
- Modify `package.json`: Add `build:wasm` script and integrate into `build`.

---

### Task 1: Rust STFT Core Crate (`wasm/stft`)

**Files:**
- Create: `wasm/stft/Cargo.toml`
- Create: `wasm/stft/src/lib.rs`

**Interfaces:**
- Produces: WASM exports:
  - `stft_alloc(size: usize) -> *mut u8`
  - `stft_dealloc(ptr: *mut u8, size: usize)`
  - `stft_process(samples_ptr, samples_len, sample_rate, window_type, window_size, hop_size, fft_size, out_mag_ptr, out_power_ptr, out_db_ptr) -> usize`

- [ ] **Step 1: Create Cargo.toml and Rust library with windowing, FFT, and STFT compute**
- [ ] **Step 2: Add Rust unit tests in `wasm/stft/src/lib.rs` validating FFT and windowing against expected values**
- [ ] **Step 3: Run `cargo test` and `cargo build --target wasm32-unknown-unknown --release`**
- [ ] **Step 4: Commit Task 1**

---

### Task 2: WASM Build & Inlining Script (`scripts/build-wasm.mjs`)

**Files:**
- Create: `scripts/build-wasm.mjs`
- Create: `src/wasm-stft-binary.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `WASM_BINARY_BASE64` and `getWasmBinary(): Uint8Array`

- [ ] **Step 1: Implement `scripts/build-wasm.mjs` to invoke cargo and emit `src/wasm-stft-binary.ts`**
- [ ] **Step 2: Add `"build:wasm": "node scripts/build-wasm.mjs"` to `package.json` and run it**
- [ ] **Step 3: Verify generated `src/wasm-stft-binary.ts` compiles and is valid Uint8Array**
- [ ] **Step 4: Commit Task 2**

---

### Task 3: TypeScript WASM Engine Wrapper (`src/wasm-stft.ts`)

**Files:**
- Create: `src/wasm-stft.ts`
- Test: `src/wasm-stft.test.ts`

**Interfaces:**
- Consumes: `src/wasm-stft-binary.ts`, `src/types.ts`
- Produces: `initWasmStft(customWasm?)`, `computeWasmStftMatrix(samples, options)`

- [ ] **Step 1: Write failing unit tests in `src/wasm-stft.test.ts` comparing `computeWasmStftMatrix` against `computeStftMatrix`**
- [ ] **Step 2: Implement `src/wasm-stft.ts` to manage WASM memory, invoke `stft_process`, and return `SpectrogramMatrix`**
- [ ] **Step 3: Run `npx vitest run src/wasm-stft.test.ts` to verify all tests pass with epsilon <= 1e-4**
- [ ] **Step 4: Commit Task 3**

---

### Task 4: WASM Web Worker & Backend (`src/wasm-worker.ts`, `src/wasm-backend.ts`)

**Files:**
- Create: `src/wasm-worker.ts`
- Create: `src/wasm-backend.ts`
- Test: `src/wasm-worker.test.ts`

**Interfaces:**
- Consumes: `src/wasm-stft.ts`, `src/backend.ts`, `src/worker-backend.ts`
- Produces: `createWasmWorker()`, `WasmComputeBackend`, `WasmWorkerComputeBackend`

- [ ] **Step 1: Write failing unit tests in `src/wasm-worker.test.ts` for worker message handling and backend computation**
- [ ] **Step 2: Implement `src/wasm-worker.ts` and `src/wasm-backend.ts`**
- [ ] **Step 3: Run `npx vitest run src/wasm-worker.test.ts` to verify tests pass**
- [ ] **Step 4: Commit Task 4**

---

### Task 5: Exports, Bundler Integration, Benchmarks, and Verification

**Files:**
- Modify: `src/index.ts`
- Modify: `src/performance.bench.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: Public exports for WASM backend and utilities.

- [ ] **Step 1: Export WASM backend, loader, and worker creators in `src/index.ts`**
- [ ] **Step 2: Add WASM STFT benchmark to `src/performance.bench.ts`**
- [ ] **Step 3: Run `npm run check:types`, `npm run check:biome`, `npm test`, and `npm run build`**
- [ ] **Step 4: Run `npm run bench` to compare performance**
- [ ] **Step 5: Commit Task 5**
