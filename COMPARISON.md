# Audio visualization and spectrogram library comparison

This document provides a technical comparison of JavaScript and TypeScript libraries for audio visualization, spectrogram generation, and digital signal processing (DSP).

---

## Overview of the ecosystem

The web audio ecosystem contains several categories of tools, each optimized for different use cases:

1. **Audio players and multi-track viewers** (such as `wavesurfer.js`, `waveform-playlist`, and `peaks.js`): Focused on audio playback, timeline scrubbing, waveform display, and track editing.
2. **Real-time spectrum visualizers** (such as `audioMotion-analyzer`, `gl-spectrogram`, and `spectrogram-js`): Focused on live microphone input, rolling waterfall displays, and music playback animations.
3. **Bioacoustic and annotation tools** (such as `Spectrolipi`, `audio-annotator`, and `BioSounds`): Focused on segment labeling, bounding-box tagging, and species identification workflows.
4. **Headless DSP and feature extractors** (such as `Essentia.js`, `Meyda`, and `fft.js`): Focused on signal processing algorithms, spectral descriptors, and machine learning feature extraction without UI components.
5. **Interactive analysis ecosystems** (`Sonoscope`): Focused on demand-driven, hardware-accelerated time-frequency visualization, live STFT parameter adjustment, and integration into analysis web apps and Python notebooks.

---

## Feature matrix

| Capability | Sonoscope | wavesurfer.js (spectrogram) | waveform-playlist | peaks.js | audioMotion-analyzer | Spectrolipi | Essentia.js | Web Audio `AnalyserNode` |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Primary focus** | Interactive time-frequency analysis | Audio player UI | Multi-track DAW UI | Waveform navigation | Real-time visualizer | Bioacoustic annotation | Headless MIR / DSP | Low-level browser API |
| **Spectrogram rendering** | WebGL2 GPU shaders (60 FPS) | Canvas 2D | Canvas 2D | None | Canvas 2D | Canvas 2D | None (headless) | Canvas 2D (manual) |
| **Waveform rendering** | Multi-scale pyramid decimation | Canvas 2D / Web Audio | Canvas 2D | Multi-scale peak cache | Canvas 2D | Canvas 2D | None (headless) | Canvas 2D (manual) |
| **STFT computation** | Rust / WASM Worker pool | JavaScript (full buffer) | JavaScript STFT | None | Web Audio FFT | Web Audio / JS | C++ / WASM | Browser C++ FFT |
| **Large audio / soundscapes** | Demand-driven tiled decode | Full-buffer decode | In-memory track buffers | Precomputed peak data | Live playback only | In-memory audio | In-memory buffer | Live playback only |
| **Live STFT tuning** | Window, hop, and FFT updates | Full recomputation | Track recompute | N/A | Limited to FFT size | Canvas redrawing | Frame-by-frame | Limited to FFT size |
| **Frequency scales** | Linear, Mel, Logarithmic | Linear | Linear, Log, Mel | N/A | Linear, Log, Bark, Mel | Linear | Linear, Mel, Bark | Linear |
| **Colormaps** | 35+ Matplotlib maps | Basic gradient | Basic palette | N/A | Preset gradients | Viridis / basic | None | Custom manual code |
| **Data querying & coordinate API** | Time/frequency slices and dB | Limited | Canvas coordinates | None | Frequency array | Bounding box boxes | Full matrix extraction | Byte / float array |
| **App integration & modularity** | Decoupled coordinator & viewers | Plugin architecture | Multi-track container | Event-based UI | Monolithic canvas | Standalone app | Modular functions | Browser audio node |
| **Framework support** | Vanilla JS, React, Python | Vanilla JS, wrappers | React / Vanilla JS | Vanilla JS | Vanilla JS | Vanilla JS | Vanilla JS | Vanilla JS |
| **Mathematical verification** | Tested against SciPy | None | None | None | None | None | Academic C++ tests | None |

---

## Key architectural dimensions

### 1. Rendering pipeline and GPU utilization

- **WebGL2 GPU rendering (Sonoscope)**: Color mapping, dynamic range normalization (dB scaling), and visual filters (such as Sobel edge enhancement and 2.5D terrain relief) execute directly in fragment shaders on the GPU. Changing colormaps, gain, or thresholds updates immediately without re-rasterizing pixel buffers on the CPU.
- **Canvas 2D rendering (`wavesurfer.js`, `waveform-playlist`, `Spectrolipi`, `audioMotion-analyzer`)**: Generates pixel data in JavaScript arrays and draws them to a `<canvas>` context using `putImageData` or 2D image drawing routines. This works well for standard audio tracks, spectrogram previews, and animated spectrum meters.
- **WebGL 1.0 real-time rendering (`gl-spectrogram`, `Chrome Music Lab`)**: Uses WebGL textures to scroll real-time frequency data across a rolling display.
- **Headless libraries (`Essentia.js`, `Meyda`, `fft.js`)**: Pure mathematical engines that do not include a graphical rendering pipeline.

### 2. Audio scale and computation model

- **Demand-driven tiled computation (Sonoscope)**: Designed for audio of arbitrary length, from short clips to multi-hour environmental soundscapes. Audio is sliced on demand, and STFT calculations only execute for the currently visible time-frequency viewport window.
- **Full-buffer processing (`wavesurfer.js`, `waveform-playlist`, `Spectrolipi`)**: Decodes and transforms the entire audio buffer upon loading. This is effective for typical short-to-medium length tracks (3 to 10 minutes), with memory usage and processing time proportional to recording length.
- **Live stream analysis (Web Audio `AnalyserNode`, `audioMotion-analyzer`, `spectrogram-js`)**: Computes real-time FFTs strictly for the instantaneous audio chunk currently playing through speakers or streaming from a microphone. Does not provide random access across recorded files.

### 3. Application integration and data querying

Complex applications (such as bioacoustic labeling interfaces, audio annotation platforms, or digital audio workstations) require programmatic access to spectral data:

- **Coordinate mapping**: Converting between canvas pixel coordinates and exact physical units (time in seconds, frequency in Hz) via `canvasToTimeFrequency` and `timeFrequencyToCanvas`.
- **Data extraction**: Extracting raw time slices, frequency spectra, and decibel values directly from computed tiles for downstream machine learning or custom metric calculations.
- **Modular architecture**: Decoupled coordinator pattern separating audio loading, viewport bounds, playback synchronization, and navigation from individual visual renderers (spectrogram, waveform, rulers, playhead).
- **Cross-language workflows**: Python bindings via `anywidget` that embed directly into JupyterLab, VS Code, Google Colab, and Marimo with zero external server dependencies.

---

## Empirical performance benchmarks

The following benchmarks were measured in Chromium across repeated trials with warmups to quantify the impact of WebAssembly SIMD signal processing and WebGL2 GPU rendering.

### 1. STFT compute: WASM SIMD vs. Pure JavaScript

Benchmarked on synthetic audio at 48 kHz with a Hann window across different FFT and hop configurations:

| Audio duration | FFT size | Hop size | JS Mean $\pm$ Std | WASM Mean $\pm$ Std | WASM speedup |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **2.0 seconds** (96,000 samples) | 512 | 128 | $35.18 \pm 4.29\text{ ms}$ | $6.58 \pm 0.66\text{ ms}$ | **$5.35\times$** |
| | 1024 | 256 | $33.24 \pm 1.57\text{ ms}$ | $6.71 \pm 0.54\text{ ms}$ | **$4.95\times$** |
| | 2048 | 512 | $34.02 \pm 2.77\text{ ms}$ | $6.98 \pm 0.30\text{ ms}$ | **$4.87\times$** |
| | 4096 | 1024 | $32.97 \pm 1.40\text{ ms}$ | $7.27 \pm 0.46\text{ ms}$ | **$4.54\times$** |
| **10.0 seconds** (480,000 samples) | 512 | 128 | $224.30 \pm 10.12\text{ ms}$ | $34.51 \pm 1.78\text{ ms}$ | **$6.50\times$** |
| | 1024 | 256 | $248.15 \pm 11.79\text{ ms}$ | $37.11 \pm 2.30\text{ ms}$ | **$6.69\times$** |
| | 2048 | 512 | $234.89 \pm 16.32\text{ ms}$ | $35.65 \pm 0.80\text{ ms}$ | **$6.59\times$** |
| | 4096 | 1024 | $222.84 \pm 13.22\text{ ms}$ | $40.89 \pm 2.63\text{ ms}$ | **$5.45\times$** |

*Takeaway:* WASM SIMD provides a $5\times$ to $6.7\times$ compute speedup over pure JavaScript FFT routines. WebAssembly also exhibits significantly lower execution variance because memory is pre-allocated and managed outside V8 garbage collection cycles.

### 2. Spectrogram rendering: WebGL2 vs. Canvas 2D

Benchmarked rendering a 2-second STFT tile matrix (2048 FFT, 512 hop, dB scaling, Magma colormap) across canvas resolutions with `gl.finish()` synchronization ($N=50$ iterations):

| Canvas resolution | Pixel count | Canvas 2D Mean $\pm$ Std | Canvas 2D throughput | WebGL2 Mean $\pm$ Std | WebGL2 throughput | Speedup |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **$400 \times 240$** (Compact) | 96,000 | $3.22 \pm 2.66\text{ ms}$ | $\sim 310\text{ FPS}$ | $0.060 \pm 0.08\text{ ms}$ | $>1000\text{ FPS}$ | **$54\times$** |
| **$800 \times 480$** (Standard) | 384,000 | $10.94 \pm 2.20\text{ ms}$ | $\sim 91\text{ FPS}$ | $0.086 \pm 0.13\text{ ms}$ | $>1000\text{ FPS}$ | **$127\times$** |
| **$1920 \times 1080$** (Full HD) | 2,073,600 | $54.04 \pm 7.48\text{ ms}$ | $\sim 18.5\text{ FPS}$ | $0.042 \pm 0.07\text{ ms}$ | $>1000\text{ FPS}$ | **$1,280\times$** |

*Takeaway:* Canvas 2D is efficient at compact dimensions ($<400\times 240$), but CPU-side pixel loops scale with total canvas resolution ($O(W \times H)$). At Full HD resolutions, Canvas 2D paint times drop to $\sim 18.5\text{ FPS}$, leading to visual frame drops during continuous drag panning. WebGL2 shifts color mapping and coordinate interpolation into parallel GPU fragment shaders, keeping frame render times under $0.1\text{ ms}$ regardless of viewport resolution.

---

## Detailed library profiles

### 1. File-based viewers and audio players

#### wavesurfer.js

[wavesurfer.js](https://github.com/katspaugh/wavesurfer.js) is the most widely adopted audio visualization library in the JavaScript ecosystem.

- **Primary use case**: Web audio players, waveform visualization, and timeline scrubbing.
- **Strengths**: Polished audio playback API, large community, and rich plugin ecosystem (regions, timeline, markers, minimap).
- **Design focus**: The spectrogram plugin is a visual companion to standard audio playback. It uses Canvas 2D and single-threaded JavaScript FFTs over the full audio buffer, without Mel/Logarithmic scaling, GPU shader effects, or tiled streaming for long recordings.

#### @waveform-playlist/spectrogram

[@waveform-playlist/spectrogram](https://github.com/waveform-playlist/waveform-playlist) is the spectrogram rendering module of the Waveform Playlist multi-track web audio editor.

- **Primary use case**: Multi-track web audio editing and Audacity-style timeline visualization.
- **Strengths**: Supports linear, logarithmic, and Mel frequency scales with viewport-aware rendering across multiple audio tracks.
- **Design focus**: Integrated within the Waveform Playlist multi-track editing model; uses Canvas 2D for drawing rather than hardware-accelerated WebGL shaders.

#### peaks.js

[peaks.js](https://github.com/bbc/peaks.js) was created by BBC R&D for browser-based audio waveform navigation and editing.

- **Primary use case**: High-performance audio waveform display and segment annotation.
- **Strengths**: Highly efficient waveform rendering using multi-resolution peak pyramids, dual zoomable views, and solid region annotation UI.
- **Design focus**: Strictly focused on audio waveforms; does not include spectrogram or frequency analysis components.

---

### 2. Real-time stream and microphone visualizers

#### audioMotion-analyzer

[audioMotion-analyzer](https://github.com/hvianna/audioMotion-analyzer) is a high-resolution real-time audio visualizer.

- **Primary use case**: Real-time audio spectrum visualization for music players and microphone inputs.
- **Strengths**: Fluid real-time animations, customizable gradient presets, radial spectrum modes, and low latency for live streams.
- **Design focus**: Built for real-time visualizer animations during playback or microphone input, rather than navigating, zooming, or inspecting arbitrary time ranges in static audio files.

#### gl-spectrogram

[gl-spectrogram](https://github.com/dy/gl-spectrogram) is a lightweight WebGL/Canvas spectrogram module.

- **Primary use case**: Real-time scrolling spectrogram displays for streaming data.
- **Strengths**: Lightweight WebGL 1.0 texture-based waterfall rendering with configurable colormaps.
- **Design focus**: Designed for live rolling data feeds rather than document-level seeking, viewport zooming, or multi-viewer synchronization across audio files.

#### spectrogram-js

[spectrogram-js](https://github.com/anyshake/spectrogram-js) is a minimalist waterfall display library.

- **Primary use case**: Real-time sensor, seismic, and audio data streams.
- **Strengths**: Zero dependencies, simple Canvas 2D waterfall rendering, and built-in colormaps.
- **Design focus**: Rolling waterfall monitoring for incoming buffers; not designed for interactive audio file navigation or timeline control.

#### Chrome Music Lab Spectrogram

[Chrome Music Lab Spectrogram](https://github.com/googlecreativelab/chrome-music-lab) is an interactive educational demonstration built by Google Creative Lab.

- **Primary use case**: Interactive educational demonstration of audio frequencies.
- **Strengths**: Production-quality WebGL shader implementation with smooth frequency transitions.
- **Design focus**: Standalone educational demo rather than a modular, reusable library or component ecosystem.

---

### 3. Bioacoustic and scientific annotation tools

#### Spectrolipi

[Spectrolipi](https://github.com/nishantnnb/spectrolipi) is a browser-based bioacoustic annotation and machine learning tool.

- **Primary use case**: In-browser bird vocalization labeling and automated detection using BirdNET (TensorFlow.js).
- **Strengths**: Integrates machine learning inference directly in the browser with manual bounding box annotation.
- **Design focus**: An integrated end-user application rather than a decoupled visualization library; uses standard Canvas 2D and Web Audio playback.

#### audio-annotator

[audio-annotator](https://github.com/CrowdCurio/audio-annotator) is an established open-source audio bounding-box annotation interface.

- **Primary use case**: Crowdsourced audio labeling for acoustic research.
- **Strengths**: Clear workflow for drawing time-frequency bounding boxes on spectrograms and waveforms.
- **Design focus**: Legacy Canvas 2D architecture designed as a web UI template for crowdsourcing platforms.

#### BioSounds

[BioSounds](https://soundefforts.uni-goettingen.de/biosounds/) is an online platform for ecoacoustics archiving and analysis.

- **Primary use case**: Centralized database and review platform for ecological soundscapes.
- **Strengths**: Multi-user acoustic database, structured metadata cataloging, and collaboration tools.
- **Design focus**: Server-centric architecture that computes and renders spectrogram tiles on a backend server (e.g., Python / SoX) rather than computing on the client.

---

### 4. Headless DSP and feature extraction engines

#### Essentia.js

[Essentia.js](https://github.com/MTG/essentia.js) is the WebAssembly port of the Essentia C++ library from Music Technology Group (UPF).

- **Primary use case**: Music Information Retrieval (MIR), audio analysis, and machine learning feature extraction.
- **Strengths**: Comprehensive, battle-tested algorithms for spectral descriptors, Mel bands, pitch tracking, and audio feature extraction running in WebAssembly.
- **Design focus**: Pure computational library. Provides mathematical building blocks and intentionally does not include UI components, canvas renderers, or timeline controls.

#### Meyda

[Meyda](https://github.com/meyda/meyda) is a JavaScript audio feature extraction library.

- **Primary use case**: Real-time extraction of spectral audio descriptors.
- **Strengths**: Simple API for extracting features (loudness, spectral centroid, MFCCs, chroma) directly from Web Audio nodes in real time.
- **Design focus**: Headless feature extraction for audio analysis or reactive visuals, not document-level spectrogram navigation.

#### fft.js and kissfft-js

[fft.js](https://github.com/indutny/fft.js) and [kissfft-js](https://github.com/Menci/kissfft-js) are low-level discrete Fourier transform libraries.

- **Primary use case**: Fast 1D FFT primitives in JavaScript and WebAssembly.
- **Strengths**: Lightweight, fast Radix-4 / Cooley-Tukey 1D FFT implementations.
- **Design focus**: Low-level math primitives without audio decoding, windowing coordinators, or rendering components.

---

## Summary

| If your primary requirement is... | Recommended library |
| :--- | :--- |
| Audio player with waveform UI and timeline markers | `wavesurfer.js` |
| Multi-track audio timeline and DAW interface | `waveform-playlist` |
| Waveform-only navigation with precomputed peak data | `peaks.js` |
| Real-time live music visualizer or audio spectrum meter | `audioMotion-analyzer` |
| Real-time rolling waterfall display for live streams | `gl-spectrogram` or `spectrogram-js` |
| End-to-end bioacoustic labeling app with BirdNET ML | `Spectrolipi` |
| Headless audio feature extraction for machine learning in JS | `Essentia.js` |
| Interactive, scientific spectrogram and waveform analysis for web apps and Python notebooks | `Sonoscope` |
