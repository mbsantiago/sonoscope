# STFT Context-Reuse Benchmark Design

**Goal:** Measure the steady-state benefit of reusing WASM STFT window and FFT setup.

**Design:** Add a standalone Vitest benchmark that creates and warms one `WasmStftEngine` before timed work. It benchmarks the same 1024-point Hann configuration with one frame, four frames, and a two-second input. This excludes WASM instantiation while retaining short workloads that expose per-call setup costs and a long workload that represents overall throughput.

**Scope:** This is diagnostic-only. It does not modify production STFT behavior or replace the general performance benchmark.

## Baseline Results

Measured on 2026-08-23 with:

```bash
npx vitest bench packages/core/src/stft-context-reuse.bench.ts
```

| Input | Mean | Throughput |
| --- | ---: | ---: |
| One frame | 0.0475 ms | 21,074 Hz |
| Four frames | 0.0986 ms | 10,141 Hz |
| Two seconds | 6.0624 ms | 165 Hz |

These results are a pre-context-reuse baseline. The benchmark warms the WASM engine before timed samples, so WASM instantiation is excluded.

## Context-Reuse Results

Measured on 2026-08-23 after reusing the native FFT and window context:

| Input | Mean | Throughput |
| --- | ---: | ---: |
| One frame | 0.0360 ms | 27,796 Hz |
| Four frames | 0.0915 ms | 10,931 Hz |
| Two seconds | 7.3143 ms | 137 Hz |

The one-frame case improved by about 24%, which is the expected setup-sensitive workload. The long-input result should be treated as benchmark variation until repeated profiling confirms a throughput trend.
