# Bundle size audit report

## Result

`@sonoscope/core` changed from 60,823 B gzip and 51,268 B brotli to 60,816 B gzip and 51,231 B brotli.

The gzip reduction is small because the inlined WASM payload remains the largest part of the bundle. It was not changed.

| Change | Gzip delta | Brotli delta | Result | Tests |
| --- | ---: | ---: | --- | --- |
| Remove Terser `unsafe_math` | 0 B | -62 B | Kept | Pass |
| Extract streaming source state | -10 B | +140 B | Kept | Pass |
| Terser passes `3` to `2` | +3 B | -115 B | Kept, within 50 B gzip limit | Pass |
| Enable `drop_console` and remove internal exports | 0 B | 0 B | Kept | Pass |
| Frequency-ruler Y-scale helper | +37 B | -15 B | Reverted | Pass |
| Total | -7 B | -37 B | Kept changes only | Pass |

All measurements use `gzip -c dist/index.js | wc -c` and `brotli -c dist/index.js | wc -c` after a fresh `npm run build`.

## Baseline and final bundle

| Metric | Baseline | Final | Delta |
| --- | ---: | ---: | ---: |
| Gzip | 60,823 B | 60,816 B | -7 B |
| Brotli | 51,268 B | 51,231 B | -37 B |

Largest final visualizer nodes by gzip contribution:

| Module | Gzip contribution |
| --- | ---: |
| `viewers/spectrogram/backends/wasm-stft-binary.ts` | 14,821 B |
| `viewers/spectrogram/viewer.ts` | 4,660 B |
| `sonoscope.ts` | 3,647 B |
| `colormap.ts` | 3,115 B |
| `navigation.ts` | 2,860 B |
| `viewers/spectrogram/backends/worker-backend.ts` | 2,745 B |
| `viewers/spectrogram/backends/wasm-backend.ts` | 2,384 B |
| `sources/streaming-mp3-source.ts` | 2,284 B |

## Changes kept

### Streaming-source state extraction

`sources/shared/streaming-source-state.ts` now owns shared decoded-range merging, range coverage checks, pending-read rejection, range event dispatch, and streaming demand management. Both streaming source classes retain their format-specific decoding and WAV's contiguous decoded frontier.

`jscpd` confirmed cross-file duplication in the streaming source implementations. The extracted helpers have unit tests. The extraction reduced gzip by 10 B, although it increased brotli by 140 B.

### Safe minifier configuration

Removed `unsafe_math` from Terser. It can alter floating-point evaluation and is inappropriate for DSP code. The existing test suite passed without it.

Changed Terser compression passes from three to two. The measured gzip increase was 3 B, within the agreed 50 B limit, while brotli decreased by 115 B.

Enabled `drop_console`. Production `src/` has no `console.*` uses. The only matches are benchmark browser tests, so the setting has no current size effect and protects future production builds.

### Dead internal exports

Removed unused exports from `webgl2-program.ts` and deleted the unreferenced waveform peak barrel file. The root `src/index.ts` never exposed these symbols. The minified bundle did not change, as expected.

## Audited but deferred

| Item | Reason |
| --- | --- |
| Frequency-ruler Y-scale helper | Exact duplicate was extracted and tested, but the helper added 37 B gzip. Reverted to meet the bundle-size goal. |
| Spectrogram and waveform WebGL compiler helpers | Compile and link error messages differ. Merging them would change observable error behavior. |
| Streaming `waitForRange` and `resolveReadyPending` | Still duplicated after the state extraction, but the source classes differ in end-of-stream behavior and decoded-frame accounting. A safe shared abstraction needs a more explicit source state interface. |
| WAV integer and float PCM decoding loops | `jscpd` reports repeated interleaving loops. They sit on hot decode paths, and a callback-based extraction could regress performance or increase size. |
| Time-ruler and frequency-ruler viewer sharing | Their domains and rendering axes differ enough that a shared base would be larger and harder to move into independent future entry points. |
| Property mangling | There is no internal property naming convention. Blind property mangling risks breaking consumers. |

## Restructuring notes

`sources/shared/streaming-source-state.ts` depends only on source types and is ready to move with a future `sources/` entry point.

The rejected frequency-ruler helper would belong inside `viewers/frequency-ruler/` if size constraints change later. It has no dependency on unrelated viewers.

The GLSL and TypeScript frequency-scale calculations are intentionally separate CPU and GPU implementations. They should not be deduplicated across that boundary.

## Verification

`npm test`: 57 test files and 512 tests passed.

`npm run check:types`: passed.

`npm run build`: passed.

The public root entry point, `src/index.ts`, was not changed. The removed exports were internal-only and are not declared by the root API.
