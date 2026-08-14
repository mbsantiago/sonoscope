# WebCodecs Streaming MP3 Decoder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement progressive streaming MP3 audio decoding using the WebCodecs `AudioDecoder` API, allowing spectrograms to render progressively as MP3 chunks stream in over the network.

**Architecture:** 
1. Build a fast, lightweight MP3 bitstream parser (`src/mp3.ts`) to parse ID3 tags, MPEG frame sync headers, frame boundaries, Xing/Info/VBRI headers, sample rates, channel counts, and calculate exact or estimated durations.
2. Build an `AudioDecoder`-based streaming decoder abstraction (`src/webcodecs-mp3-decoder.ts`) that manages `EncodedAudioChunk` queuing, timestamp tracking, planar `Float32Array` PCM output extraction, and cleanup.
3. Build `StreamingMp3Source` (`src/streaming-mp3-source.ts`) implementing the `AudioSource` interface with sequential progressive decoding, decoded range tracking, pending read resolution, and `onRangeAvailable` event dispatching.
4. Integrate into `createAudioSourceFromUrl` in `src/source.ts` to automatically detect and use `StreamingMp3Source` in supported browser environments, falling back to `DecodedAudioSource`.
5. Create unit tests, browser tests with real `AudioDecoder`, and an interactive demo in `examples/basic/mp3-streaming.html`.

**Tech Stack:** TypeScript, WebCodecs API (`AudioDecoder`, `EncodedAudioChunk`, `AudioData`), Web Streams API (`ReadableStream`), Vitest (Node & Browser with Playwright).

## Global Constraints

- Keep existing `DecodedAudioSource` and `StreamingWavSource` working without regressions.
- Keep existing `AudioSource` contract: `sampleRate`, `duration`, `channelCount`, `id`, `read(options)`, `onRangeAvailable(handler)`.
- Gracefully handle browsers without WebCodecs or MP3 codec support via feature detection and fallback to `DecodedAudioSource`.
- Clean up memory properly (`audioData.close()`, `decoder.close()`).
- Zero external runtime dependencies.

---

## File Structure

- Create `src/mp3.ts`: MP3 bitstream parsing (ID3v2, frame header sync, Xing/Info/VBRI duration parsing, frame length calculation).
- Create `src/mp3.test.ts`: Unit tests for ID3 header parsing, frame headers, Xing tags, and frame slicing.
- Create `src/webcodecs-mp3-decoder.ts`: WebCodecs `AudioDecoder` wrapper and factory interface with fallback detection.
- Create `src/webcodecs-mp3-decoder.test.ts`: Unit tests for decoder wrapper using mock WebCodecs objects.
- Create `src/streaming-mp3-source.ts`: `StreamingMp3Source` implementing `AudioSource` with streaming frame decoding and range notifications.
- Create `src/streaming-mp3-source.test.ts`: Unit tests for `StreamingMp3Source` sequential stream decode, pending reads, and range notifications.
- Create `src/streaming-mp3-source.browser.test.ts`: Browser integration test using real WebCodecs `AudioDecoder`.
- Modify `src/source.ts`: Update `createAudioSourceFromUrl` to sniff MP3 and dispatch to `StreamingMp3Source` when WebCodecs is available.
- Modify `src/source.test.ts`: Add tests for MP3 streaming detection and fallback.
- Modify `src/index.ts`: Export MP3 and WebCodecs types and classes.
- Create `examples/basic/mp3-streaming.html`: Interactive demo showcasing progressive MP3 streaming, spectrogram rendering, and audio playback.
- Modify `examples/basic/index.html`: Add link to the MP3 streaming demo.

---

### Task 1: MP3 Bitstream Parser & Metadata Extraction

**Files:**
- Create: `src/mp3.ts`
- Create: `src/mp3.test.ts`

**Interfaces:**
- Produces:
  - `type Mp3FrameHeader = { version: number; layer: number; sampleRate: number; channelCount: number; bitrate: number; padding: number; samplesPerFrame: number; frameLength: number; hasCrc: boolean; }`
  - `type Mp3Info = { sampleRate: number; channelCount: number; duration: number; firstFrameOffset: number; isVbr: boolean; totalFrames?: number; totalBytes?: number; }`
  - `isMp3Bytes(bytes: Uint8Array): boolean`
  - `parseId3Header(bytes: Uint8Array): { id3Size: number } | null`
  - `parseMp3FrameHeader(bytes: Uint8Array, offset: number): Mp3FrameHeader | null`
  - `findNextMp3Frame(bytes: Uint8Array, startOffset: number): { offset: number; header: Mp3FrameHeader } | null`
  - `parseXingHeader(bytes: Uint8Array, frameOffset: number, header: Mp3FrameHeader): { frameCount?: number; byteCount?: number; isVbr: boolean } | null`
  - `parseMp3Info(bytes: Uint8Array, totalBytes?: number): Mp3Info`

- [x] **Step 1: Write unit tests for MP3 parsing**
- [x] **Step 2: Run tests to verify failure**
- [x] **Step 3: Implement `src/mp3.ts`**
- [x] **Step 4: Run tests to verify pass**

---

### Task 2: WebCodecs MP3 Decoder Wrapper

**Files:**
- Create: `src/webcodecs-mp3-decoder.ts`
- Create: `src/webcodecs-mp3-decoder.test.ts`

**Interfaces:**
- Produces:
  - `interface Mp3Decoder { decode(chunk: Uint8Array, timestampUs: number): Promise<Float32Array[]>; flush(): Promise<Float32Array[]>; close(): void; }`
  - `isWebCodecsMp3Supported(): Promise<boolean>`
  - `createWebCodecsMp3Decoder(config: { sampleRate: number; channelCount: number }): Promise<Mp3Decoder>`

- [x] **Step 1: Write unit tests with mock `AudioDecoder`**
- [x] **Step 2: Run tests to verify failure**
- [x] **Step 3: Implement `src/webcodecs-mp3-decoder.ts`**
- [x] **Step 4: Run tests to verify pass**

---

### Task 3: `StreamingMp3Source` Implementation

**Files:**
- Create: `src/streaming-mp3-source.ts`
- Create: `src/streaming-mp3-source.test.ts`
- Create: `src/streaming-mp3-source.browser.test.ts`

**Interfaces:**
- Produces:
  - `class StreamingMp3Source implements AudioSource`
  - `StreamingMp3Source.fromByteSource(byteSource: ByteStreamSource, options?: { id?: string; decoderFactory?: ... }): Promise<StreamingMp3Source>`
  - `StreamingMp3Source.isSupported(): Promise<boolean>`

- [x] **Step 1: Write tests for `StreamingMp3Source`**
- [x] **Step 2: Run tests to verify failure**
- [x] **Step 3: Implement `src/streaming-mp3-source.ts`**
- [x] **Step 4: Run unit tests and browser tests to verify pass**

---

### Task 4: Integration with `source.ts` and `index.ts`

**Files:**
- Modify: `src/source.ts`
- Modify: `src/source.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Updates:
  - `createAudioSourceFromUrl(url: string, options?: ...)` routes MP3 to `StreamingMp3Source` when supported.
  - `index.ts` exports `StreamingMp3Source`, `isMp3Bytes`, `parseMp3Info`.

- [x] **Step 1: Write test for MP3 routing in `src/source.test.ts`**
- [x] **Step 2: Update `src/source.ts` and `src/index.ts`**
- [x] **Step 3: Run all unit and browser tests**

---

### Task 5: Interactive Streaming MP3 Demo

**Files:**
- Create: `examples/basic/mp3-streaming.html`
- Modify: `examples/basic/index.html`

- [x] **Step 1: Create `examples/basic/mp3-streaming.html` with real MP3 streams and progressive spectrogram updates**
- [x] **Step 2: Add demo link to `examples/basic/index.html`**
- [x] **Step 3: Verify build, biome linting, and full test suite**
