# Split Constructors and Single Source of Truth Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
1. Split `SpectrogramViewer` factory constructors into `fromUrl`, `fromAudio`, and `fromSource`.
2. Remove `audio` from `ResolvedSpectrogramConfig` so `source: AudioSource` is the single source of truth for audio data.
3. Manage optional `<audio>` element synchronization in `SpectrogramViewer` as an attached companion element (`attachAudio`, `getAudio`, `detachAudio`).

---

## Architecture & Interfaces

### 1. Types in `src/types.ts`

- `ResolvedSpectrogramConfig`:
  - `source: AudioSource` (required, non-optional)
  - `audio` is removed.
- Factory options:
  - `FromUrlOptions`: `Omit<SpectrogramConfig, "source"> & { url: string; audio?: HTMLAudioElement }`
  - `FromAudioOptions`: `Omit<SpectrogramConfig, "source"> & { audio: HTMLAudioElement }`
  - `FromSourceOptions`: `Omit<SpectrogramConfig, "audio"> & { source: AudioSource; audio?: HTMLAudioElement }`

### 2. Config Resolver in `src/config.ts`

- `resolveConfig(input: SpectrogramConfig & { source: AudioSource }): ResolvedSpectrogramConfig`
- Produces `ResolvedSpectrogramConfig` without `audio` property.

### 3. `SpectrogramViewer` in `src/viewer.ts`

- `private audioElement?: HTMLAudioElement;`
- `attachAudio(audio: HTMLAudioElement): void`
- `detachAudio(): void`
- `getAudio(): HTMLAudioElement | undefined`
- Factory methods:
  - `SpectrogramViewer.fromUrl({ url, canvas, audio?, ...config })`
  - `SpectrogramViewer.fromAudio({ audio, canvas, ...config })`
  - `SpectrogramViewer.fromSource({ source, canvas, audio?, ...config })`
  - `SpectrogramViewer.create(config)` (polymorphic entrypoint)

---

## File Structure

- Modify `src/types.ts`
- Modify `src/config.ts`
- Modify `src/config.test.ts`
- Modify `src/viewer.ts`
- Modify `src/viewer.test.ts`
- Modify `src/index.ts`
- Modify `src/index.test.ts`
- Modify `examples/basic/*.html` & `examples/basic/react.ts`

---

### Task 1: Update Types in `src/types.ts`

- [x] **Step 1: Remove `audio` from `ResolvedSpectrogramConfig` and add `FromUrlOptions`, `FromAudioOptions`, `FromSourceOptions`**

---

### Task 2: Update `src/config.ts` & `src/config.test.ts`

- [x] **Step 1: Update `resolveConfig` to expect and require `source` without storing `audio`**
- [x] **Step 2: Update `src/config.test.ts`**
- [x] **Step 3: Run `npx vitest run src/config.test.ts`**

---

### Task 3: Update `SpectrogramViewer` in `src/viewer.ts` & `src/viewer.test.ts`

- [x] **Step 1: Implement `fromAudio`, `fromUrl`, `fromSource`, `attachAudio`, `detachAudio`, `getAudio`**
- [x] **Step 2: Replace `this.config.audio` references with `this.audioElement`**
- [x] **Step 3: Update and add tests in `src/viewer.test.ts`**
- [x] **Step 4: Run `npx vitest run src/viewer.test.ts`**

---

### Task 4: Update Exports, Demos, and Full Test Suite

- [x] **Step 1: Export new factory types in `src/index.ts` and verify `src/index.test.ts`**
- [x] **Step 2: Update all demo pages in `examples/basic/`**
- [x] **Step 3: Run Biome, TypeScript check, unit tests, and browser tests**
