// Core Coordinator

// Auto-Resize Utilities
export type { AutoResizeOptions } from "./auto-resize";
// Performance Types
export type {
  FrameStats,
  PerformanceDetail,
  PerformanceMeasure,
} from "./performance";
// Playhead Types
export type {
  IPlayheadOverlay,
  PlayheadOverlayOptions,
} from "./playhead";
// Common & Coordinator Types
export type {
  AudioRange,
  AudioSource,
  BuiltInColorMap,
  ColorMapConfig,
  ColorPoint,
  CustomViewerFactory,
  DragNavigationOptions,
  FollowPlaybackMode,
  FrequencyBounds,
  FrequencyScale,
  IDataViewer,
  ISonoscope,
  ISonoscopeViewer,
  IViewportController,
  IViewportViewer,
  ModifierKey,
  NavigableViewer,
  NavigationAxis,
  NavigationOptions,
  Rgba,
  SonoscopeEvents,
  SonoscopeOptions,
  TimeBounds,
  ViewportConfig,
  ViewportConstraints,
  ViewportControllerOptions,
  ViewportEvents,
  ViewportState,
  WheelNavigationOptions,
} from "./types";
// FrequencyRuler Types
export type {
  FrequencyFormatMode,
  FrequencyRulerConfig,
  FrequencyRulerEvents,
  FrequencyRulerFrame,
  FrequencyRulerOptions,
  FrequencyRulerRenderer,
  FrequencyRulerRendererName,
  FrequencyRulerRenderInput,
  FrequencyRulerStatus,
  FrequencyRulerViewport,
  FrequencyTicksResult,
  IFrequencyRulerViewer,
  ResolvedFrequencyRulerConfig,
} from "./viewers/frequency-ruler";
export type {
  ComputeTileRequest,
  SpectrogramComputeBackend,
} from "./viewers/spectrogram/backends/backend";
export type {
  RendererKind,
  RenderInput,
  SpectrogramRenderer,
} from "./viewers/spectrogram/renderers/canvas";
export type {
  WebGL2Frame,
  WebGL2RenderProgram,
  WebGL2RenderResources,
} from "./viewers/spectrogram/renderers/webgl2-program";
// Spectrogram Types
export type {
  AutoRendererConfig,
  BackendMode,
  CacheStats,
  Canvas2DRendererConfig,
  ISpectrogramViewer,
  RendererMode,
  ResolvedSpectrogramConfig,
  SpectrogramConfig,
  SpectrogramEvents,
  SpectrogramLoadingMode,
  SpectrogramMatrix,
  SpectrogramOptions,
  SpectrogramProfileEvent,
  SpectrogramProfilerOptions,
  SpectrogramProfileStats,
  SpectrogramRendererConfig,
  SpectrogramRendererFactory,
  SpectrogramStatus,
  SpectrogramTransform,
  SpectrumPoint,
  SpectrumSlice,
  StftConfig,
  TileState,
  TileStateInfo,
  TransformContext,
  ValueMode,
  ValueScaleConfig,
  WebGL2SpectrogramProgramFactory,
  WebGLRendererConfig,
  WebGLRendererProgram,
  WebGLRendererProgramName,
  WindowName,
} from "./viewers/spectrogram/types";
// TimeRuler Types
export type {
  ITimeRulerViewer,
  ResolvedTimeRulerConfig,
  TimeFormatMode,
  TimeRulerConfig,
  TimeRulerEvents,
  TimeRulerFrame,
  TimeRulerOptions,
  TimeRulerRenderer,
  TimeRulerRendererName,
  TimeRulerRenderInput,
  TimeRulerStatus,
  TimeRulerViewport,
  TimeTicksResult,
} from "./viewers/time-ruler";
// Waveform Types
export type {
  BarPeakBlock,
  BarsWaveformRendererConfig,
  BarsWaveformRendererOptions,
  Canvas2DWaveformRendererConfig,
  IWaveformViewer,
  PeakBlock,
  ResolvedWaveformConfig,
  WaveformConfig,
  WaveformEvents,
  WaveformOptions,
  WaveformRenderer,
  WaveformRendererFactory,
  WaveformRendererKind,
  WaveformRendererMode,
  WaveformRenderInput,
  WaveformStatus,
  WaveformViewport,
  WebGL2WaveformRendererConfig,
} from "./viewers/waveform/types";
export { attachAutoResize } from "./auto-resize";
// Colormap Utilities
export {
  buildColorMap,
  colorMapToRgb,
  parseColor,
} from "./colormap";
// Navigation & Coordinate Helpers
export {
  attachDragNavigation,
  attachNavigation,
  attachWheelNavigation,
  panViewportFrequency,
  panViewportTime,
  setViewerViewport,
  zoomViewportFrequency,
  zoomViewportTime,
} from "./navigation/index";
// Performance & Profiling
export {
  FrameMeter,
  PerformanceProfiler,
} from "./performance";
export { attachPlayheadOverlay, PlayheadOverlay } from "./playhead";
// Plugins & Registries
export {
  clearRegisteredSpectrogramPrograms,
  clearRegisteredSpectrogramRenderers,
  clearRegisteredViewers,
  clearRegisteredWaveformRenderers,
  getRegisteredSpectrogramProgram,
  getRegisteredSpectrogramRenderer,
  getRegisteredViewer,
  getRegisteredWaveformRenderer,
  hasRegisteredSpectrogramProgram,
  hasRegisteredSpectrogramRenderer,
  hasRegisteredViewer,
  hasRegisteredWaveformRenderer,
  registerSpectrogramProgram,
  registerSpectrogramRenderer,
  registerViewer,
  registerWaveformRenderer,
  unregisterSpectrogramProgram,
  unregisterSpectrogramRenderer,
  unregisterViewer,
  unregisterWaveformRenderer,
} from "./plugins";
export { isSonoscope, Sonoscope } from "./sonoscope";
// Audio Sources & Byte Sources
export { ArrayAudioSource } from "./sources/array-source";
export {
  BlobByteSource,
  BufferByteSource,
  FetchByteSource,
  isSeekableByteSource,
  readPrefix,
} from "./sources/byte-source";
export {
  type ClipBounds,
  ClippedAudioSource,
  type ClippedSourceEvents,
  clipAudioSource,
} from "./sources/clipped-source";
export {
  createAudioSourceFromBlob,
  createAudioSourceFromBuffer,
  createAudioSourceFromUrl,
  DecodedAudioSource,
} from "./sources/source";
export { StreamingMp3Source } from "./sources/streaming-mp3-source";
export { StreamingWavSource } from "./sources/streaming-wav-source";
export { encodeWavBlob, encodeWavBuffer } from "./sources/wav-encoder";
export {
  BoxesFrequencyRulerRenderer,
  computeFrequencyTicks,
  FrequencyRulerViewer,
  formatFrequencyLabel,
  TicksFrequencyRulerRenderer,
} from "./viewers/frequency-ruler";
// Compute Backends & Renderers
export { MainThreadComputeBackend } from "./viewers/spectrogram/backends/backend";
export {
  createSpectrogramBackend,
  isSpectrogramComputeBackend,
  isWasmSupported,
  isWorkerSupported,
} from "./viewers/spectrogram/backends/backend-factory";
export {
  WasmComputeBackend,
  WasmWorkerComputeBackend,
} from "./viewers/spectrogram/backends/wasm-backend";
export { WorkerComputeBackend } from "./viewers/spectrogram/backends/worker-backend";
export {
  canvasToTimeFrequency,
  hzToMel,
  hzToScale,
  melToHz,
  scaleToHz,
  timeFrequencyToCanvas,
} from "./viewers/spectrogram/frequency-scale";
export { SpectrogramProfiler } from "./viewers/spectrogram/profiler";
export { CanvasSpectrogramRenderer } from "./viewers/spectrogram/renderers/canvas";
export { createSpectrogramRenderer } from "./viewers/spectrogram/renderers/renderer-factory";
export { WebGL2SpectrogramRenderer } from "./viewers/spectrogram/renderers/webgl2";
export {
  tileFrequencyRange,
  tileTimeRange,
} from "./viewers/spectrogram/renderers/webgl2-geometry";
export { NormalSpectrogramProgram } from "./viewers/spectrogram/renderers/webgl2-normal-program";
export {
  frequencyScaleCode,
  WEBGL2_FRAGMENT_UNIFORMS,
  WEBGL2_OVERLAY_CHECK,
  WEBGL2_SCALE_HELPERS,
  WebGL2ShaderProgram,
  WebGL2TileProgramBase,
} from "./viewers/spectrogram/renderers/webgl2-program";
export {
  createShaderProgram,
  createSpectrogramProgram,
} from "./viewers/spectrogram/renderers/webgl2-program-factory";
export {
  locateSamplePosition,
  sampleValueDataPosition,
  valueDataForMode,
} from "./viewers/spectrogram/spectrogram-sampling";
export { normalizeValue } from "./viewers/spectrogram/value-scale";
// Viewers
export { SpectrogramViewer } from "./viewers/spectrogram/viewer";
export {
  BoxesTimeRulerRenderer,
  computeTimeTicks,
  formatTimeLabel,
  TicksTimeRulerRenderer,
  TimeRulerViewer,
} from "./viewers/time-ruler";
export { BarsWaveformRenderer } from "./viewers/waveform/renderers/bars";
export { CanvasWaveformRenderer } from "./viewers/waveform/renderers/canvas";
export { createWaveformRenderer } from "./viewers/waveform/renderers/renderer-factory";
export { WebGL2WaveformRenderer } from "./viewers/waveform/renderers/webgl2";
export { WaveformViewer } from "./viewers/waveform/viewer";
// Viewport
export { ViewportController } from "./viewport";
export { clampViewportTimes } from "./viewport-math";
