import type {
  DragNavigationOptions,
  NavigableViewer,
  NavigationOptions,
  WheelNavigationOptions,
} from "../types";
import { attachDragNavigation } from "./drag-navigation";
import { resolveViewerCanvas } from "./viewer-adapter";
import { attachWheelNavigation } from "./wheel-navigation";

export { setViewerViewport } from "./apply-viewport";
export { attachDragNavigation } from "./drag-navigation";
export {
  resolveViewerFrequencyBounds,
  resolveViewerTimeBounds,
} from "./viewer-adapter";
export {
  panViewportFrequency,
  panViewportTime,
  zoomViewportFrequency,
  zoomViewportTime,
} from "./viewport-axes";
export { attachWheelNavigation } from "./wheel-navigation";

/**
 * Merges the shared top-level options (axis, onNavigate) with a per-mode
 * option object or boolean flag. Shared options apply first, so an explicit
 * value in the per-mode object always wins.
 */
function resolveModeOptions<T extends { axis?: NavigationOptions["axis"] }>(
  shared: Pick<NavigationOptions, "axis" | "onNavigate">,
  modeOption: T | boolean | undefined,
): T {
  const base = {
    ...(shared.axis !== undefined ? { axis: shared.axis } : {}),
    ...(shared.onNavigate !== undefined
      ? { onNavigate: shared.onNavigate }
      : {}),
  } as T;
  if (typeof modeOption === "object" && modeOption !== null) {
    return { ...base, ...modeOption };
  }
  return base;
}

export function attachNavigation(
  viewer: NavigableViewer,
  canvas?: HTMLElement,
  options: NavigationOptions = {},
): () => void {
  const targetCanvas = resolveViewerCanvas(viewer, canvas);
  const cleanups: Array<() => void> = [];

  if (options.wheel !== false) {
    cleanups.push(
      attachWheelNavigation(
        viewer,
        targetCanvas,
        resolveModeOptions<WheelNavigationOptions>(options, options.wheel),
      ),
    );
  }

  if (options.drag !== false) {
    cleanups.push(
      attachDragNavigation(
        viewer,
        targetCanvas,
        resolveModeOptions<DragNavigationOptions>(options, options.drag),
      ),
    );
  }

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
