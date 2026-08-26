import type {
  FrequencyBounds,
  NavigableViewer,
  NavigationAxis,
  TimeBounds,
  ViewportConfig,
} from "../types";

export type AxisMode = "time" | "frequency" | "both";

export interface CanvasRect {
  width: number;
  height: number;
}

/**
 * Normalizes the differences between viewer implementations (which methods
 * they expose, how they convert pixels to time/frequency, etc.) behind one
 * object. Wheel/drag handlers talk to this instead of feature-detecting the
 * viewer themselves — add support for a new viewer capability here, once.
 */
export interface ViewerAdapter {
  readonly canvas: HTMLElement;
  readonly axisMode: AxisMode;
  getViewport(): ViewportConfig;
  getTimeBounds(): TimeBounds;
  getFrequencyBounds(): FrequencyBounds;
  /** x/y are canvas-local pixel coordinates. */
  pointToTimeFrequency(
    x: number,
    y: number,
    rect: CanvasRect,
  ): { time?: number; frequency?: number };
}

export function createViewerAdapter(
  viewer: NavigableViewer,
  canvas: HTMLElement | undefined,
  configuredAxis: NavigationAxis | undefined,
): ViewerAdapter {
  const resolvedCanvas = resolveViewerCanvas(viewer, canvas);
  const axisMode = resolveAxisMode(viewer, configuredAxis);

  return {
    canvas: resolvedCanvas,
    axisMode,
    getViewport: () => viewer.getViewport() as ViewportConfig,
    getTimeBounds: () => resolveViewerTimeBounds(viewer),
    getFrequencyBounds: () => resolveViewerFrequencyBounds(viewer),
    pointToTimeFrequency: (x, y, rect) =>
      pointToTimeFrequency(viewer, x, y, rect),
  };
}

function resolveAxisMode(
  viewer: NavigableViewer,
  configuredAxis?: NavigationAxis,
): AxisMode {
  if (configuredAxis && configuredAxis !== "auto") {
    return configuredAxis;
  }
  if ("canvasToTimeFrequency" in viewer) {
    return "both";
  }
  if ("canvasToFrequency" in viewer && !("canvasToTime" in viewer)) {
    return "frequency";
  }
  return "time";
}

export function resolveViewerCanvas(
  viewer: NavigableViewer,
  canvas?: HTMLElement,
): HTMLElement {
  if (canvas) return canvas;
  if ("getCanvas" in viewer && typeof viewer.getCanvas === "function") {
    const fromViewer = viewer.getCanvas();
    if (fromViewer) return fromViewer;
  }
  const config = viewer.getConfig() as { canvas?: HTMLElement };
  if (config.canvas) return config.canvas;
  throw new Error(
    "Canvas or container element is required for navigation attachment",
  );
}

export function resolveViewerTimeBounds(viewer: NavigableViewer): TimeBounds {
  if ("getTimeBounds" in viewer && typeof viewer.getTimeBounds === "function") {
    return viewer.getTimeBounds();
  }
  const config = viewer.getConfig() as {
    minViewportDuration?: number;
    maxViewportDuration?: number;
  };
  const duration =
    "getScope" in viewer && typeof viewer.getScope === "function"
      ? (viewer.getScope()?.getDuration?.() ?? 0)
      : 0;
  return {
    startTime: 0,
    endTime: duration,
    minDurationSeconds: config.minViewportDuration ?? 0.05,
    maxDurationSeconds: config.maxViewportDuration ?? 30,
  };
}

export function resolveViewerFrequencyBounds(
  viewer: NavigableViewer,
): FrequencyBounds {
  if (
    "getFrequencyBounds" in viewer &&
    typeof viewer.getFrequencyBounds === "function"
  ) {
    return viewer.getFrequencyBounds();
  }
  const sampleRate =
    "getScope" in viewer && typeof viewer.getScope === "function"
      ? (viewer.getScope()?.getSampleRate?.() ?? 48000)
      : 48000;
  const nyquist = Math.floor(sampleRate / 2);
  return {
    minFrequency: 0,
    maxFrequency: nyquist,
    minSpanHz: 20,
  };
}

function pointToTimeFrequency(
  viewer: NavigableViewer,
  x: number,
  y: number,
  rect: CanvasRect,
): { time?: number; frequency?: number } {
  if (
    "canvasToTimeFrequency" in viewer &&
    typeof viewer.canvasToTimeFrequency === "function"
  ) {
    return viewer.canvasToTimeFrequency(x, y);
  }

  const result: { time?: number; frequency?: number } = {};

  if ("canvasToTime" in viewer && typeof viewer.canvasToTime === "function") {
    result.time = viewer.canvasToTime(x);
  } else {
    const viewport = viewer.getViewport() as ViewportConfig;
    const ratio = x / (rect.width || 1);
    result.time =
      viewport.startTime + ratio * (viewport.endTime - viewport.startTime);
  }

  if (
    "canvasToFrequency" in viewer &&
    typeof viewer.canvasToFrequency === "function"
  ) {
    result.frequency = viewer.canvasToFrequency(y);
  } else {
    const viewport = viewer.getViewport() as ViewportConfig;
    const bounds = resolveViewerFrequencyBounds(viewer);
    const ratio = 1 - y / (rect.height || 1);
    const minF = viewport.minFrequency ?? bounds.minFrequency;
    const maxF = viewport.maxFrequency ?? bounds.maxFrequency;
    result.frequency = minF + ratio * (maxF - minF);
  }

  return result;
}
