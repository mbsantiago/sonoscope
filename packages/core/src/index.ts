export const version = "0.0.0";
export { buildColorMap, colorMapToRgb, parseColor } from "./colormap";
export { TypedEventEmitter } from "./events";
export type {
  CanvasDragNavigationOptions,
  CanvasNavigationOptions,
  CanvasWheelNavigationOptions,
  FrequencyBounds,
  NavigableViewer,
  TimeBounds,
} from "./navigation";
export {
  attachCanvasDragNavigation,
  attachCanvasNavigation,
  attachCanvasWheelNavigation,
  panViewportFrequency,
  panViewportTime,
  setViewerViewport,
  zoomViewportFrequency,
  zoomViewportTime,
} from "./navigation";
export type {
  FrameStats,
  PerformanceDetail,
  PerformanceMeasure,
} from "./performance";
export {
  FrameMeter,
  PerformanceProfiler,
  SpectrogramProfiler,
} from "./performance";
export { isSonoscope, Sonoscope } from "./sonoscope";
export type {
  ByteStreamSource,
  SeekableByteSource,
} from "./sources/byte-source";
export {
  concatChunks,
  FetchByteSource,
  isSeekableByteSource,
  readPrefix,
} from "./sources/byte-source";
export type { Mp3FrameHeader, Mp3Info } from "./sources/mp3";
export {
  findNextMp3Frame,
  isMp3Bytes,
  parseId3Header,
  parseMp3FrameHeader,
  parseMp3Info,
  parseXingHeader,
} from "./sources/mp3";
export { createAudioSourceFromUrl, DecodedAudioSource } from "./sources/source";
export { StreamingMp3Source } from "./sources/streaming-mp3-source";
export { StreamingWavSource } from "./sources/streaming-wav-source";
export type { WavInfo } from "./sources/wav";
export {
  decodeWavPcm,
  isWavBytes,
  parseWavHeader,
  wavTimeToByteRange,
} from "./sources/wav";
export type {
  Mp3Decoder,
  Mp3DecoderConfig,
  Mp3DecoderFactory,
} from "./sources/webcodecs-mp3-decoder";
export {
  createWebCodecsMp3Decoder,
  isWebCodecsMp3Supported,
} from "./sources/webcodecs-mp3-decoder";
export type * from "./types";
export type {
  ComputeTileRequest,
  SpectrogramComputeBackend,
} from "./viewers/spectrogram/backends/backend";
export { MainThreadComputeBackend } from "./viewers/spectrogram/backends/backend";
export type { BackendFactoryOptions } from "./viewers/spectrogram/backends/backend-factory";
export {
  createSpectrogramBackend,
  isSpectrogramComputeBackend,
  isWasmSupported,
  isWorkerSupported,
} from "./viewers/spectrogram/backends/backend-factory";
export {
  computeStftMatrix,
  createWindow,
} from "./viewers/spectrogram/backends/stft";
export {
  createDefaultWasmWorker,
  WasmComputeBackend,
  WasmWorkerComputeBackend,
} from "./viewers/spectrogram/backends/wasm-backend";
export type {
  WasmStftEngine,
  WasmStftExports,
} from "./viewers/spectrogram/backends/wasm-stft";
export {
  computeWasmStftMatrix,
  createWasmStftEngine,
  getWasmStftEngine,
} from "./viewers/spectrogram/backends/wasm-stft";
export {
  getWasmStftBinary,
  WASM_STFT_BASE64,
} from "./viewers/spectrogram/backends/wasm-stft-binary";
export type {
  SpectrogramWorkerLike,
  WorkerComputeBackendOptions,
} from "./viewers/spectrogram/backends/worker-backend";
export {
  createDefaultWorker,
  WorkerComputeBackend,
} from "./viewers/spectrogram/backends/worker-backend";
export type { TileKeyParts } from "./viewers/spectrogram/cache";
export {
  createTileKey,
  SpectrogramCache,
} from "./viewers/spectrogram/cache";
export {
  clampViewportTimes,
  resolveConfig,
  stableHash,
} from "./viewers/spectrogram/config";
export {
  canvasToTimeFrequency,
  hzToMel,
  hzToScale,
  melToHz,
  scaleToHz,
  timeFrequencyToCanvas,
} from "./viewers/spectrogram/frequency-scale";
export type {
  RendererKind,
  RenderInput,
  SpectrogramRenderer,
} from "./viewers/spectrogram/renderers/canvas";
export {
  CanvasSpectrogramRenderer,
  pickNearestBin,
  pickNearestFrame,
} from "./viewers/spectrogram/renderers/canvas";
export { createSpectrogramRenderer } from "./viewers/spectrogram/renderers/renderer-factory";
export { WebGL2SpectrogramRenderer } from "./viewers/spectrogram/renderers/webgl2";
export { DitherSpectrogramProgram } from "./viewers/spectrogram/renderers/webgl2-dither-program";
export { NormalSpectrogramProgram } from "./viewers/spectrogram/renderers/webgl2-normal-program";
export type {
  WebGL2Frame,
  WebGL2RenderProgram,
  WebGL2RenderResources,
} from "./viewers/spectrogram/renderers/webgl2-program";
export { WebGL2ShaderProgram } from "./viewers/spectrogram/renderers/webgl2-program";
export { SobelSpectrogramProgram } from "./viewers/spectrogram/renderers/webgl2-sobel-program";
export { TerrainSpectrogramProgram } from "./viewers/spectrogram/renderers/webgl2-terrain-program";
export {
  applyTransforms,
  getTransformPadding,
} from "./viewers/spectrogram/transforms";
export type {
  BackendMode,
  CacheStats,
  ISpectrogramViewer,
  MainThreadBackendConfig,
  RendererMode,
  ResolvedSpectrogramConfig,
  SpectrogramConfig,
  SpectrogramEvents,
  SpectrogramMatrix,
  SpectrogramOptions,
  SpectrogramProfileEvent,
  SpectrogramProfilerOptions,
  SpectrogramProfileStats,
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
  WasmBackendConfig,
  WebGLRendererConfig,
  WebGLRendererProgram,
  WindowName,
  WorkerBackendConfig,
} from "./viewers/spectrogram/types";
export {
  dbFromMagnitude,
  deriveDb,
  derivePower,
  deriveValueArrays,
  normalizeValue,
} from "./viewers/spectrogram/value-scale";
export { SpectrogramViewer } from "./viewers/spectrogram/viewer";
export {
  computePeaks,
  WaveformPeakPyramid,
} from "./viewers/waveform/peaks";
export { CanvasWaveformRenderer } from "./viewers/waveform/renderers/canvas";
export { WebGL2WaveformRenderer } from "./viewers/waveform/renderers/webgl2";
export type {
  IWaveformViewer,
  PeakBlock,
  ResolvedWaveformConfig,
  WaveformConfig,
  WaveformEvents,
  WaveformOptions,
  WaveformRenderer,
  WaveformRenderInput,
  WaveformStatus,
  WaveformViewport,
} from "./viewers/waveform/types";
export { WaveformViewer } from "./viewers/waveform/viewer";
export type {
  CustomViewportStore,
  FollowPlaybackMode,
  ITimeBoundViewer,
  IViewportController,
  ViewportControllerConfig,
  ViewportControllerEvents,
  ViewportState,
} from "./viewport-controller";
export {
  createCustomViewportController,
  linkViewports,
  ViewportController,
} from "./viewport-controller";
