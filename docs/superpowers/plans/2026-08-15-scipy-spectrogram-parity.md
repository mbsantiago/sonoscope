# SciPy Spectrogram Parity Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible Python (SciPy) baseline fixture generator and a TypeScript test suite verifying that all Sonoscope spectrogram backends produce mathematically accurate frequencies, times, and magnitude/power/dB values matching SciPy `ShortTimeFFT`.

**Architecture:** A standalone Python script using `uv` script metadata creates 3 deterministic synthetic audio signals (sine wave, logarithmic chirp, discrete impulse) and computes reference spectrograms via SciPy `ShortTimeFFT`, exporting WAV files and structured JSON fixtures. A Vitest test suite loads the WAV fixtures using Sonoscope's native WAV decoders, runs them through JS, WASM, MainThread, and WASM backends, and asserts numerical parity across frequencies, times, and values.

**Tech Stack:** Python 3.10+, uv, SciPy (`scipy.signal.ShortTimeFFT`, `scipy.io.wavfile`, `scipy.signal.chirp`), NumPy, TypeScript, Vitest, WebAssembly (Rust STFT engine).

## Global Constraints

- Python script must use `uv` script metadata header so it runs self-contained without pre-installed global packages via `uv run scripts/generate_baseline_spectrograms.py`.
- WAV output files must be valid 16-bit PCM mono audio files readable by `@sonoscope/core`'s `decodeWavPcm` and `WavAudioSource`.
- SciPy STFT computation must strictly match the STFT conventions used in `@sonoscope/core`:
  - Bin count: `fftSize / 2` (first $N/2$ bins: $k = 0, \dots, N/2 - 1$, frequencies $k \cdot f_s / N$).
  - Frame index $i$ starts at sample offset $i \cdot \text{hopSize}$, with timestamp $i \cdot \text{hopSize} / f_s$.
  - Magnitude normalization is $1 / N$ ($\frac{|\text{FFT}|}{N}$).
  - Decibel formula is $20 \log_{10}(\max(10^{-12}, \text{magnitude}))$.
- All 40+ existing tests, Biome linting, and typechecks must remain passing.

---

### Task 1: Create Python Synthetic Audio & SciPy Reference Spectrogram Generator

**Files:**
- Create: `scripts/generate_baseline_spectrograms.py`
- Modify: `package.json:11-23`

**Interfaces:**
- Input: Parameters for 3 synthetic signals:
  1. `sine`: 440 Hz pure tone at 16000 Hz sample rate, 1.0s duration.
  2. `chirp`: Logarithmic sweep from 100 Hz to 7500 Hz at 16000 Hz sample rate, 1.0s duration.
  3. `impulse`: Discrete unit impulses at $t = 0.1\text{s}, 0.5\text{s}, 0.9\text{s}$ at 16000 Hz sample rate, 1.0s duration.
- Output:
  - `tests/fixtures/synthetic/sine.wav`
  - `tests/fixtures/synthetic/chirp.wav`
  - `tests/fixtures/synthetic/impulse.wav`
  - `tests/fixtures/synthetic/sine_reference.json`
  - `tests/fixtures/synthetic/chirp_reference.json`
  - `tests/fixtures/synthetic/impulse_reference.json`
  - `tests/fixtures/synthetic/manifest.json`

- [ ] **Step 1: Write `scripts/generate_baseline_spectrograms.py`**

```python
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "numpy>=1.24.0",
#     "scipy>=1.11.0",
# ]
# ///

import json
import os
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.signal import ShortTimeFFT, chirp
from scipy.signal.windows import get_window

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "synthetic"

SAMPLE_RATE = 16000
DURATION = 1.0
NUM_SAMPLES = int(SAMPLE_RATE * DURATION)
STFT_CONFIGS = [
    {"window": "hann", "window_size": 512, "hop_size": 256, "fft_size": 512},
    {"window": "hamming", "window_size": 512, "hop_size": 128, "fft_size": 512},
    {"window": "blackman", "window_size": 256, "hop_size": 128, "fft_size": 512},
    {"window": "rectangular", "window_size": 512, "hop_size": 256, "fft_size": 512},
]

def generate_sine() -> np.ndarray:
    """Pure sine wave at 440 Hz."""
    t = np.linspace(0, DURATION, NUM_SAMPLES, endpoint=False, dtype=np.float32)
    return np.sin(2 * np.pi * 440.0 * t).astype(np.float32)

def generate_chirp() -> np.ndarray:
    """Logarithmic chirp from 100 Hz to 7500 Hz."""
    t = np.linspace(0, DURATION, NUM_SAMPLES, endpoint=False, dtype=np.float32)
    return chirp(t, f0=100.0, t1=DURATION, f1=7500.0, method="logarithmic").astype(np.float32)

def generate_impulse() -> np.ndarray:
    """Discrete unit impulses at 0.1s, 0.5s, 0.9s."""
    samples = np.zeros(NUM_SAMPLES, dtype=np.float32)
    for pos_sec in [0.1, 0.5, 0.9]:
        idx = int(pos_sec * SAMPLE_RATE)
        if idx < NUM_SAMPLES:
            samples[idx] = 1.0
    return samples

def compute_scipy_spectrogram(samples: np.ndarray, sample_rate: int, config: dict) -> dict:
    """Compute spectrogram matching Sonoscope STFT conventions using SciPy ShortTimeFFT."""
    window_name = config["window"]
    window_size = config["window_size"]
    hop_size = config["hop_size"]
    fft_size = config["fft_size"]

    # Generate window (SciPy periodic/symmetric matching Sonoscope)
    if window_name == "rectangular":
        win = np.ones(window_size, dtype=np.float32)
    elif window_name == "hann":
        win = get_window("hann", window_size, fftbins=False).astype(np.float32)
    elif window_name == "hamming":
        win = get_window("hamming", window_size, fftbins=False).astype(np.float32)
    elif window_name == "blackman":
        win = get_window("blackman", window_size, fftbins=False).astype(np.float32)
    else:
        raise ValueError(f"Unknown window: {window_name}")

    # Use SciPy ShortTimeFFT with manual frame alignment matching Sonoscope
    # Sonoscope frames: frame_idx * hop_size for frame_idx in range(frame_count)
    frame_count = max(0, (len(samples) - window_size) // hop_size + 1)
    bin_count = fft_size // 2

    times = (np.arange(frame_count, dtype=np.float32) * hop_size) / sample_rate
    frequencies = (np.arange(bin_count, dtype=np.float32) * sample_rate) / fft_size

    # Verify against ShortTimeFFT
    sft = ShortTimeFFT(win, hop=hop_size, fs=sample_rate, mfft=fft_size, scale_to=None, phase_shift=None)

    magnitude = np.zeros((frame_count, bin_count), dtype=np.float32)
    for i in range(frame_count):
        offset = i * hop_size
        frame = np.zeros(fft_size, dtype=np.float32)
        frame[:window_size] = samples[offset:offset + window_size] * win
        fft_res = np.fft.rfft(frame, n=fft_size)
        # First N/2 bins, scaled by 1/N
        magnitude[i, :] = np.abs(fft_res[:bin_count]) / fft_size

    power = np.square(magnitude)
    db_floor = 1e-12
    db = 20.0 * np.log10(np.maximum(magnitude, db_floor))

    return {
        "config": config,
        "frameCount": frame_count,
        "binCount": bin_count,
        "times": times.tolist(),
        "frequencies": frequencies.tolist(),
        "magnitude": magnitude.flatten().tolist(),
        "power": power.flatten().tolist(),
        "db": db.flatten().tolist(),
    }

def save_wav(filename: Path, samples: np.ndarray, sample_rate: int):
    # Convert float [-1, 1] to 16-bit PCM integer
    int16_samples = np.clip(samples * 32767.0, -32768, 32767).astype(np.int16)
    wavfile.write(str(filename), sample_rate, int16_samples)

def main():
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    signals = {
        "sine": generate_sine(),
        "chirp": generate_chirp(),
        "impulse": generate_impulse(),
    }

    manifest = {"sampleRate": SAMPLE_RATE, "duration": DURATION, "signals": {}}

    for name, samples in signals.items():
        wav_path = FIXTURES_DIR / f"{name}.wav"
        save_wav(wav_path, samples, SAMPLE_RATE)
        print(f"Saved {wav_path}")

        reference_runs = []
        for config in STFT_CONFIGS:
            ref = compute_scipy_spectrogram(samples, SAMPLE_RATE, config)
            reference_runs.append(ref)

        ref_json_path = FIXTURES_DIR / f"{name}_reference.json"
        with open(ref_json_path, "w", encoding="utf-8") as f:
            json.dump({
                "signal": name,
                "sampleRate": SAMPLE_RATE,
                "duration": DURATION,
                "sampleCount": len(samples),
                "runs": reference_runs,
            }, f)
        print(f"Saved {ref_json_path}")

        manifest["signals"][name] = {
            "wavFile": f"{name}.wav",
            "referenceFile": f"{name}_reference.json",
        }

    manifest_path = FIXTURES_DIR / "manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"Generated manifest at {manifest_path}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Add `fixtures:generate` npm script in `package.json`**

Add script:
```json
"fixtures:generate": "uv run scripts/generate_baseline_spectrograms.py"
```

- [ ] **Step 3: Run the script using `uv` to generate fixtures**

Run: `uv run scripts/generate_baseline_spectrograms.py`
Expected: Output WAV files (`sine.wav`, `chirp.wav`, `impulse.wav`), reference JSON files, and `manifest.json` in `tests/fixtures/synthetic/`.

- [ ] **Step 4: Commit generator script and generated fixtures**

```bash
git add scripts/generate_baseline_spectrograms.py package.json tests/fixtures/synthetic/
git commit -m "feat(tests): add scipy synthetic baseline generator and reference fixtures"
```

---

### Task 2: Implement SciPy Parity Verification Test Suite in TypeScript

**Files:**
- Create: `packages/core/src/viewers/spectrogram/scipy-parity.test.ts`

**Interfaces:**
- Consumes:
  - `tests/fixtures/synthetic/*.wav`
  - `tests/fixtures/synthetic/*_reference.json`
  - `computeStftMatrix` from `packages/core/src/viewers/spectrogram/backends/stft`
  - `computeWasmStftMatrix` and `getWasmStftEngine` from `packages/core/src/viewers/spectrogram/backends/wasm-stft`
  - `MainThreadComputeBackend` from `packages/core/src/viewers/spectrogram/backends/backend`
  - `WasmComputeBackend` from `packages/core/src/viewers/spectrogram/backends/wasm-backend`
  - `parseWavHeader`, `decodeWavPcm` from `packages/core/src/sources/wav`
  - `ByteSource` from `packages/core/src/sources/byte-source`
  - `WavAudioSource` from `packages/core/src/sources/wav`

- [ ] **Step 1: Write `packages/core/src/viewers/spectrogram/scipy-parity.test.ts`**

```typescript
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ByteSource } from "../../sources/byte-source";
import { decodeWavPcm, parseWavHeader, WavAudioSource } from "../../sources/wav";
import { MainThreadComputeBackend } from "./backends/backend";
import { computeStftMatrix } from "./backends/stft";
import { WasmComputeBackend } from "./backends/wasm-backend";
import { computeWasmStftMatrix, getWasmStftEngine } from "./backends/wasm-stft";
import type { StftConfig } from "./types";

interface ReferenceRun {
  config: StftConfig;
  frameCount: number;
  binCount: number;
  times: number[];
  frequencies: number[];
  magnitude: number[];
  power: number[];
  db: number[];
}

interface ReferenceFixture {
  signal: string;
  sampleRate: number;
  duration: number;
  sampleCount: number;
  runs: ReferenceRun[];
}

const FIXTURES_ROOT = resolve(__dirname, "../../../../../tests/fixtures/synthetic");

function loadFixture(signalName: string): {
  samples: Float32Array;
  sampleRate: number;
  runs: ReferenceRun[];
  wavBytes: Uint8Array;
} {
  const wavPath = resolve(FIXTURES_ROOT, `${signalName}.wav`);
  const jsonPath = resolve(FIXTURES_ROOT, `${signalName}_reference.json`);

  const wavBuffer = readFileSync(wavPath);
  const wavBytes = new Uint8Array(wavBuffer.buffer, wavBuffer.byteOffset, wavBuffer.byteLength);
  const info = parseWavHeader(wavBytes);
  const decodedChannels = decodeWavPcm(wavBytes, info);
  const samples = decodedChannels[0]!;

  const jsonContent = readFileSync(jsonPath, "utf-8");
  const fixture: ReferenceFixture = JSON.parse(jsonContent);

  return { samples, sampleRate: info.sampleRate, runs: fixture.runs, wavBytes };
}

describe("SciPy Spectrogram Parity Validation", () => {
  const signals = ["sine", "chirp", "impulse"] as const;

  for (const signal of signals) {
    describe(`Signal: ${signal}`, () => {
      const { samples, sampleRate, runs, wavBytes } = loadFixture(signal);

      for (const run of runs) {
        const { config, frameCount, binCount, times, frequencies, magnitude, power, db } = run;
        const testCaseName = `${config.window} window (size=${config.windowSize}, hop=${config.hopSize}, fft=${config.fftSize})`;

        it(`JS STFT matches SciPy for ${testCaseName}`, () => {
          const matrix = computeStftMatrix(samples, {
            channel: 0,
            timeStart: 0,
            sampleRate,
            stft: config,
          });

          // Verify grid coordinates
          expect(matrix.frameCount).toBe(frameCount);
          expect(matrix.binCount).toBe(binCount);

          for (let i = 0; i < frameCount; i++) {
            expect(matrix.times[i]).toBeCloseTo(times[i]!, 5);
          }
          for (let i = 0; i < binCount; i++) {
            expect(matrix.frequencies[i]).toBeCloseTo(frequencies[i]!, 4);
          }

          // Verify values
          for (let i = 0; i < matrix.magnitude.length; i++) {
            expect(matrix.magnitude[i]).toBeCloseTo(magnitude[i]!, 4);
            if (matrix.power) {
              expect(matrix.power[i]).toBeCloseTo(power[i]!, 4);
            }
            if (matrix.db && db[i]! > -100) {
              expect(matrix.db[i]).toBeCloseTo(db[i]!, 1);
            }
          }
        });

        it(`WASM STFT matches SciPy for ${testCaseName}`, async () => {
          await getWasmStftEngine();
          const matrix = await computeWasmStftMatrix(samples, {
            channel: 0,
            timeStart: 0,
            sampleRate,
            stft: config,
          });

          expect(matrix.frameCount).toBe(frameCount);
          expect(matrix.binCount).toBe(binCount);

          for (let i = 0; i < frameCount; i++) {
            expect(matrix.times[i]).toBeCloseTo(times[i]!, 5);
          }
          for (let i = 0; i < binCount; i++) {
            expect(matrix.frequencies[i]).toBeCloseTo(frequencies[i]!, 4);
          }

          for (let i = 0; i < matrix.magnitude.length; i++) {
            expect(matrix.magnitude[i]).toBeCloseTo(magnitude[i]!, 4);
            if (matrix.power) {
              expect(matrix.power[i]).toBeCloseTo(power[i]!, 4);
            }
            if (matrix.db && db[i]! > -100) {
              expect(matrix.db[i]).toBeCloseTo(db[i]!, 1);
            }
          }
        });

        it(`MainThreadComputeBackend tile computation matches SciPy for ${testCaseName}`, async () => {
          const byteSource = new ByteSource(wavBytes);
          const wavSource = new WavAudioSource(byteSource);
          await wavSource.init();

          const backend = new MainThreadComputeBackend();
          const matrix = await backend.computeTile({
            source: wavSource,
            channel: 0,
            timeStart: 0,
            timeEnd: wavSource.duration,
            stft: config,
          });

          expect(matrix.frameCount).toBe(frameCount);
          expect(matrix.binCount).toBe(binCount);
          expect(matrix.magnitude.length).toBe(magnitude.length);
          for (let i = 0; i < matrix.magnitude.length; i++) {
            expect(matrix.magnitude[i]).toBeCloseTo(magnitude[i]!, 4);
          }
        });

        it(`WasmComputeBackend tile computation matches SciPy for ${testCaseName}`, async () => {
          const byteSource = new ByteSource(wavBytes);
          const wavSource = new WavAudioSource(byteSource);
          await wavSource.init();

          const backend = new WasmComputeBackend();
          const matrix = await backend.computeTile({
            source: wavSource,
            channel: 0,
            timeStart: 0,
            timeEnd: wavSource.duration,
            stft: config,
          });

          expect(matrix.frameCount).toBe(frameCount);
          expect(matrix.binCount).toBe(binCount);
          expect(matrix.magnitude.length).toBe(magnitude.length);
          for (let i = 0; i < matrix.magnitude.length; i++) {
            expect(matrix.magnitude[i]).toBeCloseTo(magnitude[i]!, 4);
          }
        });
      }
    });
  }
});
```

- [ ] **Step 2: Run the new parity test suite**

Run: `npx vitest run packages/core/src/viewers/spectrogram/scipy-parity.test.ts`
Expected: All test cases PASS for all 3 signals across pure JS, WASM, MainThread backend, and WasmBackend.

- [ ] **Step 3: Commit the test suite**

```bash
git add packages/core/src/viewers/spectrogram/scipy-parity.test.ts
git commit -m "test(spectrogram): add scipy parity tests for JS, WASM, and compute backends"
```

---

### Task 3: Full Verification, Documentation, and CI Integration

**Files:**
- Modify: `README.md` (Document SciPy validation and baseline fixture generation)

- [ ] **Step 1: Run type checking**

Run: `npm run check:types`
Expected: PASS with 0 errors.

- [ ] **Step 2: Run Biome linter and formatter check**

Run: `npm run check:biome`
Expected: PASS with 0 errors.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: All test suites PASS (including the new 48+ test assertions in `scipy-parity.test.ts`).

- [ ] **Step 4: Update README.md with verification and test instructions**

Document how to regenerate fixtures with `uv` and how the SciPy parity testing works.

- [ ] **Step 5: Commit final documentation updates**

```bash
git add README.md
git commit -m "docs: document scipy ground-truth spectrogram parity testing"
```
