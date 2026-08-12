export const version = '0.0.0';
export { buildColorMap, parseColor } from './colormap';
export { resolveConfig, stableHash } from './config';
export { TypedEventEmitter } from './events';
export { canvasToTimeFrequency, hzToMel, hzToScale, melToHz, scaleToHz, timeFrequencyToCanvas } from './frequency-scale';
export { DecodedAudioSource } from './source';
export { dbFromMagnitude, deriveDb, derivePower, deriveValueArrays, normalizeValue } from './value-scale';
export type * from './types';
