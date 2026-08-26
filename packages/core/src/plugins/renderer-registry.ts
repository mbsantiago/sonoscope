import type { SpectrogramRendererFactory } from "../viewers/spectrogram/types";
import type { WaveformRendererFactory } from "../viewers/waveform/types";

const spectrogramRendererRegistry = new Map<
  string,
  SpectrogramRendererFactory
>();
const waveformRendererRegistry = new Map<string, WaveformRendererFactory>();

/**
 * Registers a custom spectrogram renderer factory under a unique name.
 */
export function registerSpectrogramRenderer(
  name: string,
  factory: SpectrogramRendererFactory,
): void {
  spectrogramRendererRegistry.set(name, factory);
}

/**
 * Unregisters a custom spectrogram renderer factory.
 */
export function unregisterSpectrogramRenderer(name: string): boolean {
  return spectrogramRendererRegistry.delete(name);
}

/**
 * Gets a registered spectrogram renderer factory by name.
 */
export function getRegisteredSpectrogramRenderer(
  name: string,
): SpectrogramRendererFactory | undefined {
  return spectrogramRendererRegistry.get(name);
}

/**
 * Checks if a spectrogram renderer factory is registered.
 */
export function hasRegisteredSpectrogramRenderer(name: string): boolean {
  return spectrogramRendererRegistry.has(name);
}

/**
 * Clears all registered custom spectrogram renderers.
 */
export function clearRegisteredSpectrogramRenderers(): void {
  spectrogramRendererRegistry.clear();
}

/**
 * Registers a custom waveform renderer factory under a unique name.
 */
export function registerWaveformRenderer(
  name: string,
  factory: WaveformRendererFactory,
): void {
  waveformRendererRegistry.set(name, factory);
}

/**
 * Unregisters a custom waveform renderer factory.
 */
export function unregisterWaveformRenderer(name: string): boolean {
  return waveformRendererRegistry.delete(name);
}

/**
 * Gets a registered waveform renderer factory by name.
 */
export function getRegisteredWaveformRenderer(
  name: string,
): WaveformRendererFactory | undefined {
  return waveformRendererRegistry.get(name);
}

/**
 * Checks if a waveform renderer factory is registered.
 */
export function hasRegisteredWaveformRenderer(name: string): boolean {
  return waveformRendererRegistry.has(name);
}

/**
 * Clears all registered custom waveform renderers.
 */
export function clearRegisteredWaveformRenderers(): void {
  waveformRendererRegistry.clear();
}
