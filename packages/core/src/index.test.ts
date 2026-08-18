import { describe, expect, it } from "vitest";
import {
  ArrayAudioSource,
  attachCanvasNavigation,
  BlobByteSource,
  BufferByteSource,
  buildColorMap,
  clampViewportTimes,
  createAudioSourceFromBlob,
  createAudioSourceFromBuffer,
  createAudioSourceFromUrl,
  createSpectrogramBackend,
  createSpectrogramRenderer,
  DecodedAudioSource,
  encodeWavBlob,
  encodeWavBuffer,
  isSonoscope,
  Sonoscope,
  SpectrogramProfiler,
  SpectrogramViewer,
  StreamingMp3Source,
  StreamingWavSource,
  WaveformViewer,
} from "./index";

describe("public entrypoint", () => {
  it("exports Sonoscope coordinator and viewers", () => {
    expect(typeof Sonoscope).toBe("function");
    expect(typeof Sonoscope.fromUrl).toBe("function");
    expect(typeof Sonoscope.fromURL).toBe("function");
    expect(typeof Sonoscope.fromAudio).toBe("function");
    expect(typeof Sonoscope.fromSource).toBe("function");
    expect(typeof Sonoscope.fromAudioBuffer).toBe("function");
    expect(typeof Sonoscope.fromBlob).toBe("function");
    expect(typeof Sonoscope.fromBuffer).toBe("function");
    expect(typeof Sonoscope.fromArray).toBe("function");
    expect(typeof isSonoscope).toBe("function");
    expect(typeof SpectrogramViewer).toBe("function");
    expect(typeof WaveformViewer).toBe("function");
    expect(typeof clampViewportTimes).toBe("function");
  });

  it("exports audio sources", () => {
    expect(typeof createAudioSourceFromUrl).toBe("function");
    expect(typeof createAudioSourceFromBlob).toBe("function");
    expect(typeof createAudioSourceFromBuffer).toBe("function");
    expect(typeof DecodedAudioSource).toBe("function");
    expect(typeof ArrayAudioSource).toBe("function");
    expect(typeof BlobByteSource).toBe("function");
    expect(typeof BufferByteSource).toBe("function");
    expect(typeof StreamingMp3Source).toBe("function");
    expect(typeof StreamingWavSource).toBe("function");
    expect(typeof encodeWavBlob).toBe("function");
    expect(typeof encodeWavBuffer).toBe("function");
  });

  it("exports navigation and visual utilities", () => {
    expect(typeof attachCanvasNavigation).toBe("function");
    expect(typeof buildColorMap).toBe("function");
    expect(typeof SpectrogramProfiler).toBe("function");
    expect(typeof createSpectrogramBackend).toBe("function");
    expect(typeof createSpectrogramRenderer).toBe("function");
  });
});
