import type { WebGL2SpectrogramProgramFactory } from "../viewers/spectrogram/types";

const programRegistry = new Map<string, WebGL2SpectrogramProgramFactory>();

/**
 * Registers a custom WebGL2 spectrogram shader program factory under a unique name.
 */
export function registerSpectrogramProgram(
  name: string,
  factory: WebGL2SpectrogramProgramFactory,
): void {
  programRegistry.set(name, factory);
}

/**
 * Unregisters a custom WebGL2 spectrogram shader program factory.
 */
export function unregisterSpectrogramProgram(name: string): boolean {
  return programRegistry.delete(name);
}

/**
 * Gets a registered WebGL2 spectrogram shader program factory by name.
 */
export function getRegisteredSpectrogramProgram(
  name: string,
): WebGL2SpectrogramProgramFactory | undefined {
  return programRegistry.get(name);
}

/**
 * Checks if a WebGL2 spectrogram shader program factory is registered.
 */
export function hasRegisteredSpectrogramProgram(name: string): boolean {
  return programRegistry.has(name);
}

/**
 * Clears all registered custom spectrogram programs.
 */
export function clearRegisteredSpectrogramPrograms(): void {
  programRegistry.clear();
}
