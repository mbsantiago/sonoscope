export const version = "0.0.0";
export type {
  ComputeTileRequest,
  SpectrogramComputeBackend,
} from "./backends/backend";
export { MainThreadComputeBackend } from "./backends/backend";
export type { BackendFactoryOptions } from "./backends/backend-factory";
export {
  createSpectrogramBackend,
  isSpectrogramComputeBackend,
  isWasmSupported,
  isWorkerSupported,
} from "./backends/backend-factory";
export { computeStftMatrix, createWindow } from "./backends/stft";
export {
  createDefaultWasmWorker,
  WasmComputeBackend,
  WasmWorkerComputeBackend,
} from "./backends/wasm-backend";
export type { WasmStftEngine, WasmStftExports } from "./backends/wasm-stft";
export {
  computeWasmStftMatrix,
  createWasmStftEngine,
  getWasmStftEngine,
} from "./backends/wasm-stft";
export {
  getWasmStftBinary,
  WASM_STFT_BASE64,
} from "./backends/wasm-stft-binary";
export type {
  SpectrogramWorkerLike,
  WorkerComputeBackendOptions,
} from "./backends/worker-backend";
export {
  createDefaultWorker,
  WorkerComputeBackend,
} from "./backends/worker-backend";
export type { TileKeyParts } from "./cache";
export { createTileKey, SpectrogramCache } from "./cache";
export { buildColorMap, parseColor } from "./colormap";
export { resolveConfig, stableHash } from "./config";
export { TypedEventEmitter } from "./events";
export {
  canvasToTimeFrequency,
  hzToMel,
  hzToScale,
  melToHz,
  scaleToHz,
  timeFrequencyToCanvas,
} from "./frequency-scale";
export type { CanvasNavigationOptions, TimeBounds } from "./navigation";
export {
  attachCanvasNavigation,
  panViewportTime,
  setViewerViewport,
  zoomViewportTime,
} from "./navigation";
export type {
  FrameStats,
  PerformanceDetail,
  PerformanceMeasure,
} from "./performance";
export { FrameMeter } from "./performance";
export type {
  RendererKind,
  RenderInput,
  SpectrogramRenderer,
} from "./renderers/canvas";
export {
  CanvasSpectrogramRenderer,
  pickNearestBin,
  pickNearestFrame,
} from "./renderers/canvas";
export { createSpectrogramRenderer } from "./renderers/renderer-factory";
export { WebGL2SpectrogramRenderer } from "./renderers/webgl2";
export { DitherSpectrogramProgram } from "./renderers/webgl2-dither-program";
export { NormalSpectrogramProgram } from "./renderers/webgl2-normal-program";
export type {
  WebGL2Frame,
  WebGL2RenderProgram,
  WebGL2RenderResources,
} from "./renderers/webgl2-program";
export { WebGL2ShaderProgram } from "./renderers/webgl2-program";
export { SobelSpectrogramProgram } from "./renderers/webgl2-sobel-program";
export { TerrainSpectrogramProgram } from "./renderers/webgl2-terrain-program";
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
export { applyTransforms, getTransformPadding } from "./transforms";
export type * from "./types";
export {
  dbFromMagnitude,
  deriveDb,
  derivePower,
  deriveValueArrays,
  normalizeValue,
} from "./value-scale";
export { SpectrogramViewer } from "./viewer";
