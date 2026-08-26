import type { CustomViewerFactory, ISonoscopeViewer } from "../types";

const viewerRegistry = new Map<string, CustomViewerFactory>();

/**
 * Registers a custom viewer factory under a unique name.
 */
export function registerViewer<
  TOptions = unknown,
  TViewer extends ISonoscopeViewer = ISonoscopeViewer,
>(name: string, factory: CustomViewerFactory<TOptions, TViewer>): void {
  viewerRegistry.set(name, factory as CustomViewerFactory);
}

/**
 * Unregisters a custom viewer factory.
 */
export function unregisterViewer(name: string): boolean {
  return viewerRegistry.delete(name);
}

/**
 * Gets a registered viewer factory by name.
 */
export function getRegisteredViewer<
  TOptions = unknown,
  TViewer extends ISonoscopeViewer = ISonoscopeViewer,
>(name: string): CustomViewerFactory<TOptions, TViewer> | undefined {
  return viewerRegistry.get(name) as
    | CustomViewerFactory<TOptions, TViewer>
    | undefined;
}

/**
 * Checks if a viewer factory is registered.
 */
export function hasRegisteredViewer(name: string): boolean {
  return viewerRegistry.has(name);
}

/**
 * Clears all registered custom viewers.
 */
export function clearRegisteredViewers(): void {
  viewerRegistry.clear();
}
