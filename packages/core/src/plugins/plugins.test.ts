import type { AudioSource, IDataViewer } from "../types";
import type { SpectrogramRenderer } from "../viewers/spectrogram/renderers/canvas";
import type {
  SpectrogramRendererFactory,
  WebGL2SpectrogramProgramFactory,
} from "../viewers/spectrogram/types";
import type {
  WaveformRenderer,
  WaveformRendererFactory,
} from "../viewers/waveform/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sonoscope } from "../sonoscope";
import { createSpectrogramRenderer } from "../viewers/spectrogram/renderers/renderer-factory";
import { createSpectrogramProgram } from "../viewers/spectrogram/renderers/webgl2-program-factory";
import { createWaveformRenderer } from "../viewers/waveform/renderers/renderer-factory";
import {
  clearRegisteredSpectrogramPrograms,
  clearRegisteredSpectrogramRenderers,
  clearRegisteredViewers,
  clearRegisteredWaveformRenderers,
  getRegisteredSpectrogramProgram,
  hasRegisteredSpectrogramProgram,
  hasRegisteredSpectrogramRenderer,
  hasRegisteredViewer,
  hasRegisteredWaveformRenderer,
  registerSpectrogramProgram,
  registerSpectrogramRenderer,
  registerWaveformRenderer,
  unregisterSpectrogramProgram,
  unregisterSpectrogramRenderer,
  unregisterWaveformRenderer,
} from "./index";

afterEach(() => {
  clearRegisteredSpectrogramPrograms();
  clearRegisteredSpectrogramRenderers();
  clearRegisteredWaveformRenderers();
  clearRegisteredViewers();
});

describe("WebGL2 Spectrogram Program Registry", () => {
  it("registers, queries, and unregisters custom shader programs", () => {
    const mockProgram = { paint: vi.fn(), delete: vi.fn() };
    const factory: WebGL2SpectrogramProgramFactory = vi.fn(() => mockProgram);

    expect(hasRegisteredSpectrogramProgram("custom-glow")).toBe(false);
    registerSpectrogramProgram("custom-glow", factory);
    expect(hasRegisteredSpectrogramProgram("custom-glow")).toBe(true);
    expect(getRegisteredSpectrogramProgram("custom-glow")).toBe(factory);

    const mockGl = {} as WebGL2RenderingContext;
    const instance = createSpectrogramProgram(mockGl, "custom-glow");
    expect(factory).toHaveBeenCalledWith(mockGl, {});
    expect(instance).toBe(mockProgram);

    expect(unregisterSpectrogramProgram("custom-glow")).toBe(true);
    expect(hasRegisteredSpectrogramProgram("custom-glow")).toBe(false);
  });
});

describe("Spectrogram & Waveform Renderer Registries", () => {
  it("registers and creates custom spectrogram renderers by name", () => {
    const mockRenderer: SpectrogramRenderer = {
      kind: "canvas2d",
      render: vi.fn(),
      invalidate: vi.fn(),
      destroy: vi.fn(),
    };
    const factory: SpectrogramRendererFactory = vi.fn(() => mockRenderer);

    registerSpectrogramRenderer("custom-svg", factory);
    expect(hasRegisteredSpectrogramRenderer("custom-svg")).toBe(true);

    const mockCanvas = {} as HTMLCanvasElement;
    const renderer = createSpectrogramRenderer(mockCanvas, "custom-svg");
    expect(renderer).toBe(mockRenderer);
    expect(factory).toHaveBeenCalledWith(mockCanvas);

    expect(unregisterSpectrogramRenderer("custom-svg")).toBe(true);
    expect(hasRegisteredSpectrogramRenderer("custom-svg")).toBe(false);
  });

  it("supports passing custom spectrogram renderer function directly", () => {
    const mockRenderer: SpectrogramRenderer = {
      kind: "canvas2d",
      render: vi.fn(),
      invalidate: vi.fn(),
    };
    const mockCanvas = {} as HTMLCanvasElement;
    const renderer = createSpectrogramRenderer(mockCanvas, () => mockRenderer);
    expect(renderer).toBe(mockRenderer);
  });

  it("registers and creates custom waveform renderers", () => {
    const mockWaveformRenderer: WaveformRenderer = {
      kind: "canvas2d",
      render: vi.fn(),
    };
    const factory: WaveformRendererFactory = vi.fn(() => mockWaveformRenderer);

    registerWaveformRenderer("custom-bars", factory);
    expect(hasRegisteredWaveformRenderer("custom-bars")).toBe(true);

    const mockCanvas = {} as HTMLCanvasElement;
    const renderer = createWaveformRenderer("custom-bars", mockCanvas);
    expect(renderer).toBe(mockWaveformRenderer);
    expect(factory).toHaveBeenCalledWith(mockCanvas);

    expect(unregisterWaveformRenderer("custom-bars")).toBe(true);
  });
});

describe("Viewer Registry on Sonoscope", () => {
  it("registers and instantiates custom data-bound viewers with source sync", () => {
    class CustomPitchViewer implements IDataViewer {
      source: AudioSource;
      constructor(
        public scope: Sonoscope,
        public canvas: HTMLCanvasElement,
        _options?: { pitchThreshold?: number },
      ) {
        this.source = scope.source;
      }
      setSource(source: AudioSource) {
        this.source = source;
      }
      destroy() {}
    }

    Sonoscope.registerViewer("pitch-viewer", (scope, canvas, opts) => {
      return new CustomPitchViewer(
        scope as Sonoscope,
        canvas,
        opts as { pitchThreshold?: number },
      );
    });

    expect(hasRegisteredViewer("pitch-viewer")).toBe(true);

    const initialSource: AudioSource = {
      id: "source-1",
      duration: 10,
      sampleRate: 44100,
      channelCount: 1,
      read: () => new Float32Array(10),
    };
    const nextSource: AudioSource = {
      id: "source-2",
      duration: 15,
      sampleRate: 44100,
      channelCount: 1,
      read: () => new Float32Array(10),
    };

    const scope = new Sonoscope(initialSource);
    const mockCanvas = {} as HTMLCanvasElement;
    const viewer = scope.createViewer<
      { pitchThreshold?: number },
      CustomPitchViewer
    >("pitch-viewer", mockCanvas, { pitchThreshold: 50 });

    expect(viewer).toBeInstanceOf(CustomPitchViewer);
    expect(viewer.source).toBe(initialSource);

    // Verify source update propagation
    scope.setSource(nextSource);
    expect(viewer.source).toBe(nextSource);

    scope.destroy();
    expect(Sonoscope.unregisterViewer("pitch-viewer")).toBe(true);
  });

  it("throws when creating an unregistered viewer name", () => {
    const source: AudioSource = {
      id: "source-1",
      duration: 10,
      sampleRate: 44100,
      channelCount: 1,
      read: () => new Float32Array(10),
    };
    const scope = new Sonoscope(source);
    expect(() =>
      scope.createViewer("non-existent-viewer", {} as HTMLCanvasElement),
    ).toThrow(/No viewer registered with name "non-existent-viewer"/);
    scope.destroy();
  });
});
