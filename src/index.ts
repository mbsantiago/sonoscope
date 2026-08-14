export const version = "0.0.0";
export type { ComputeTileRequest, SpectrogramComputeBackend } from "./backend";
export { MainThreadComputeBackend } from "./backend";
export type { BackendFactoryOptions } from "./backend-factory";
export {
  createSpectrogramBackend,
  isSpectrogramComputeBackend,
  isWasmSupported,
  isWorkerSupported,
} from "./backend-factory";
export type { ByteStreamSource, SeekableByteSource } from "./byte-source";
export {
  concatChunks,
  FetchByteSource,
  isSeekableByteSource,
  readPrefix,
} from "./byte-source";
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
export type { Mp3FrameHeader, Mp3Info } from "./mp3";
export {
  findNextMp3Frame,
  isMp3Bytes,
  parseId3Header,
  parseMp3FrameHeader,
  parseMp3Info,
  parseXingHeader,
} from "./mp3";
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
export { createSpectrogramRenderer } from "./renderer-factory";
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
export { createAudioSourceFromUrl, DecodedAudioSource } from "./source";
export { computeStftMatrix, createWindow } from "./stft";
export { StreamingMp3Source } from "./streaming-mp3-source";
export { StreamingWavSource } from "./streaming-wav-source";
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
export {
  createDefaultWasmWorker,
  WasmComputeBackend,
  WasmWorkerComputeBackend,
} from "./wasm-backend";
export type { WasmStftEngine, WasmStftExports } from "./wasm-stft";
export {
  computeWasmStftMatrix,
  createWasmStftEngine,
  getWasmStftEngine,
} from "./wasm-stft";
export { getWasmStftBinary, WASM_STFT_BASE64 } from "./wasm-stft-binary";
export type { WavInfo } from "./wav";
export {
  decodeWavPcm,
  isWavBytes,
  parseWavHeader,
  wavTimeToByteRange,
} from "./wav";
export type {
  Mp3Decoder,
  Mp3DecoderConfig,
  Mp3DecoderFactory,
} from "./webcodecs-mp3-decoder";
export {
  createWebCodecsMp3Decoder,
  isWebCodecsMp3Supported,
} from "./webcodecs-mp3-decoder";
export type {
  SpectrogramWorkerLike,
  WorkerComputeBackendOptions,
} from "./worker-backend";
export { createDefaultWorker, WorkerComputeBackend } from "./worker-backend";
