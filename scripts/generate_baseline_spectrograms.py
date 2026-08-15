# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "numpy>=1.24.0",
#     "scipy>=1.11.0",
# ]
# ///

import json
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import ShortTimeFFT, chirp
from scipy.signal.windows import get_window

FIXTURES_DIR = (
    Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "synthetic"
)

SAMPLE_RATE = 16000
DURATION = 1.0
NUM_SAMPLES = int(SAMPLE_RATE * DURATION)
STFT_CONFIGS = [
    {"window": "hann", "windowSize": 512, "hopSize": 256, "fftSize": 512},
    {"window": "hamming", "windowSize": 512, "hopSize": 128, "fftSize": 512},
    {"window": "blackman", "windowSize": 256, "hopSize": 128, "fftSize": 512},
    {"window": "rectangular", "windowSize": 512, "hopSize": 256, "fftSize": 512},
]


def generate_sine() -> np.ndarray:
    """Pure sine wave at 440 Hz."""
    t = np.linspace(0, DURATION, NUM_SAMPLES, endpoint=False, dtype=np.float32)
    return np.sin(2 * np.pi * 440.0 * t).astype(np.float32)


def generate_chirp() -> np.ndarray:
    """Logarithmic chirp from 100 Hz to 7500 Hz."""
    t = np.linspace(0, DURATION, NUM_SAMPLES, endpoint=False, dtype=np.float32)
    return chirp(t, f0=100.0, t1=DURATION, f1=7500.0, method="logarithmic").astype(
        np.float32
    )


def generate_impulse() -> np.ndarray:
    """Discrete unit impulses at 0.1s, 0.5s, 0.9s."""
    samples = np.zeros(NUM_SAMPLES, dtype=np.float32)
    for pos_sec in [0.1, 0.5, 0.9]:
        idx = int(pos_sec * SAMPLE_RATE)
        if idx < NUM_SAMPLES:
            samples[idx] = 1.0
    return samples


def compute_scipy_spectrogram(
    samples: np.ndarray, sample_rate: int, config: dict
) -> dict:
    """Compute spectrogram matching Sonoscope STFT conventions using SciPy ShortTimeFFT."""
    window_name = config["window"]
    window_size = config["windowSize"]
    hop_size = config["hopSize"]
    fft_size = config["fftSize"]

    # Generate window (matching Sonoscope's symmetric formulas)
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

    # Verify ShortTimeFFT instantiability
    sft = ShortTimeFFT(
        win,
        hop=hop_size,
        fs=sample_rate,
        mfft=fft_size,
        scale_to=None,
        phase_shift=None,
    )

    # -------------------------------------------------------------------------
    # Frame Indexing & Parameter Explanation (p0, p1, k_offset):
    #
    # 1. `p0` and `p1` (Frame Range):
    #    - In SciPy's ShortTimeFFT, frames are indexed by integer p in [p0, p1).
    #    - By default, SciPy computes extra pre-roll frames (p < 0) where the window
    #      overhangs before sample 0 and is padded with zeros.
    #    - Setting `p0 = 0` and `p1 = frame_count` restricts calculation strictly to
    #      valid frames spanning the actual recording without pre-roll padding.
    #
    # 2. `k_offset` (Window Anchor Offset):
    #    - `k_offset` defines the sample index where frame p=0 is centered:
    #      center_sample(p) = p * hop_size + k_offset.
    #    - By default in sft.spectrogram(), k_offset = 0, which centers frame 0
    #      at sample 0 (requiring window_size // 2 samples of padding before the audio).
    #    - Setting `k_offset = window_size // 2` (sft.m_num_mid) anchors frame 0 to
    #      samples [0, window_size], placing its acoustic center at window_size // 2.
    #    - This ensures:
    #        a) The STFT analyzes true audio data starting from sample 0.
    #        b) `sft.t(...)` frame timestamps reflect true acoustic window centers
    #           (t_center = (p * hop + window_size / 2) / fs), aligning 1:1 with
    #           interactive audio tracker playback lines.
    # -------------------------------------------------------------------------

    frame_count = max(0, (len(samples) - window_size) // hop_size + 1)
    bin_count = fft_size // 2

    # Compute spectrogram via SciPy ShortTimeFFT.spectrogram()
    # (returns squared magnitude |STFT|^2 for specified frame range)
    spec = sft.spectrogram(
        samples,
        p0=0,
        p1=frame_count,
        k_offset=window_size // 2,
        padding="zeros",
    )

    # Slice first N/2 frequency bins and transpose to shape (frame_count, bin_count)
    spec_sliced = spec[:bin_count, :frame_count].T
    # Scale by 1/N^2 for power, 1/N for magnitude
    power = (spec_sliced / (fft_size**2)).astype(np.float32)
    magnitude = np.sqrt(power)

    # Get frame center timestamps matching the k_offset configuration
    times = sft.t(
        len(samples), p0=0, p1=frame_count, k_offset=sft.m_num_mid
    ).astype(np.float32)
    frequencies = sft.f[:bin_count].astype(np.float32)

    db_floor = 1e-12
    db = 20.0 * np.log10(np.maximum(magnitude, db_floor))

    return {
        "config": config,
        "frameCount": int(frame_count),
        "binCount": int(bin_count),
        "times": times.tolist(),
        "frequencies": frequencies.tolist(),
        "magnitude": magnitude.flatten().tolist(),
        "power": power.flatten().tolist(),
        "db": db.flatten().tolist(),
    }


def save_wav(filename: Path, samples: np.ndarray, sample_rate: int):
    # Save as 32-bit float WAV to preserve full IEEE float32 fidelity
    wavfile.write(str(filename), sample_rate, samples.astype(np.float32))


def main():
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    signals = {
        "sine": generate_sine(),
        "chirp": generate_chirp(),
        "impulse": generate_impulse(),
    }

    manifest = {"sampleRate": SAMPLE_RATE, "duration": DURATION, "signals": {}}

    for name, raw_samples in signals.items():
        wav_path = FIXTURES_DIR / f"{name}.wav"
        save_wav(wav_path, raw_samples, SAMPLE_RATE)
        print(f"Saved {wav_path}")

        # Read back from WAV to ensure exact identical samples
        sr, samples = wavfile.read(str(wav_path))
        samples = samples.astype(np.float32)

        reference_runs = []
        for config in STFT_CONFIGS:
            ref = compute_scipy_spectrogram(samples, SAMPLE_RATE, config)
            reference_runs.append(ref)

        ref_json_path = FIXTURES_DIR / f"{name}_reference.json"
        with open(ref_json_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "signal": name,
                    "sampleRate": SAMPLE_RATE,
                    "duration": DURATION,
                    "sampleCount": len(samples),
                    "runs": reference_runs,
                },
                f,
                indent=2,
            )
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
