import type { ViewportConfig } from "./types";
import type { FrequencyRulerViewer } from "./viewers/frequency-ruler/viewer";
import type { SpectrogramViewer } from "./viewers/spectrogram/viewer";
import type { TimeRulerViewer } from "./viewers/time-ruler/viewer";
import type { WaveformViewer } from "./viewers/waveform/viewer";

export type TimeBounds = {
  startTime: number;
  endTime: number;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
};

export type FrequencyBounds = {
  minFrequency: number;
  maxFrequency: number;
  minSpanHz?: number;
};

export interface NavigableViewer {
  setViewport(viewport: Partial<ViewportConfig>): void;
  requestRender(): void;
  getViewport(): {
    startTime: number;
    endTime: number;
    minFrequency?: number;
    maxFrequency?: number;
    frequencyScale?: string;
  };
  getCanvas?(): HTMLCanvasElement;
  getScope?(): {
    getDuration(): number;
    getSampleRate?(): number;
    [key: string]: unknown;
  };
  getConfig(): {
    minViewportDuration?: number;
    maxViewportDuration?: number;
    minFrequency?: number;
    maxFrequency?: number;
    [key: string]: unknown;
  };
  getTimeBounds?: () => TimeBounds;
  getFrequencyBounds?: () => FrequencyBounds;
  canvasToTimeFrequency?: (
    x: number,
    y: number,
  ) => { time: number; frequency: number };
  canvasToTime?: (x: number) => number;
  canvasToFrequency?: (y: number) => number;
}

export type NavigationAxis = "time" | "frequency" | "both" | "auto";

export type ModifierKey = "ctrl" | "shift" | "alt" | "meta" | "none";

export interface WheelNavigationOptions {
  axis?: NavigationAxis | undefined;
  panSensitivity?: number | undefined;
  zoomSensitivity?: number | undefined;
  frequencyPanSensitivity?: number | undefined;
  frequencyZoomSensitivity?: number | undefined;
  zoomModifier?: ModifierKey | undefined;
  frequencyModifier?: ModifierKey | undefined;
  onNavigate?: ((viewport: ViewportConfig) => void) | undefined;
}

export interface DragNavigationOptions {
  axis?: NavigationAxis | undefined;
  button?: number | undefined;
  modifier?: ModifierKey | undefined;
  frequencyModifier?: ModifierKey | undefined;
  dragThreshold?: number | undefined;
  cursor?: boolean | undefined;
  onNavigate?: ((viewport: ViewportConfig) => void) | undefined;
  onDragStart?: ((event: PointerEvent | MouseEvent) => void) | undefined;
  onDragEnd?: ((event: PointerEvent | MouseEvent) => void) | undefined;
}

export interface NavigationOptions {
  axis?: NavigationAxis | undefined;
  wheel?: boolean | WheelNavigationOptions | undefined;
  drag?: boolean | DragNavigationOptions | undefined;
  onNavigate?: ((viewport: ViewportConfig) => void) | undefined;
}

export type CanvasWheelNavigationOptions = WheelNavigationOptions;
export type CanvasDragNavigationOptions = DragNavigationOptions;

export type CanvasNavigationOptions = NavigationOptions &
  CanvasWheelNavigationOptions &
  CanvasDragNavigationOptions & {
    enableWheel?: boolean | undefined;
    enableDrag?: boolean | undefined;
  };

export type AnyNavigableViewer =
  | NavigableViewer
  | SpectrogramViewer
  | WaveformViewer
  | TimeRulerViewer
  | FrequencyRulerViewer;

export function setViewerViewport(
  viewer: AnyNavigableViewer,
  viewport: Partial<ViewportConfig>,
): ViewportConfig {
  viewer.setViewport(viewport);
  viewer.requestRender();
  return viewer.getViewport() as ViewportConfig;
}

export function panViewportTime(
  viewport: ViewportConfig,
  bounds: TimeBounds,
  deltaSeconds: number,
): ViewportConfig {
  const duration = viewport.endTime - viewport.startTime;
  const startTime = clamp(
    viewport.startTime + deltaSeconds,
    bounds.startTime,
    Math.max(bounds.startTime, bounds.endTime - duration),
  );
  return { ...viewport, startTime, endTime: startTime + duration };
}

export function panViewportFrequency(
  viewport: ViewportConfig,
  bounds: FrequencyBounds,
  deltaHz: number,
): ViewportConfig {
  const span = viewport.maxFrequency - viewport.minFrequency;
  const minFrequency = clamp(
    viewport.minFrequency + deltaHz,
    bounds.minFrequency,
    Math.max(bounds.minFrequency, bounds.maxFrequency - span),
  );
  return { ...viewport, minFrequency, maxFrequency: minFrequency + span };
}

export function zoomViewportTime(
  viewport: ViewportConfig,
  bounds: TimeBounds,
  centerTime: number,
  factor: number,
): ViewportConfig {
  const currentDuration = viewport.endTime - viewport.startTime;
  const minDuration = bounds.minDurationSeconds ?? 0.001;
  const maxDuration = Math.min(
    bounds.maxDurationSeconds ?? bounds.endTime - bounds.startTime,
    bounds.endTime - bounds.startTime,
  );
  const duration = clamp(currentDuration * factor, minDuration, maxDuration);
  if (Math.abs(duration - currentDuration) < 1e-9) return viewport;
  const ratio =
    currentDuration <= 0
      ? 0.5
      : (centerTime - viewport.startTime) / currentDuration;
  const startTime = clamp(
    centerTime - duration * ratio,
    bounds.startTime,
    Math.max(bounds.startTime, bounds.endTime - duration),
  );
  return { ...viewport, startTime, endTime: startTime + duration };
}

export function zoomViewportFrequency(
  viewport: ViewportConfig,
  bounds: FrequencyBounds,
  centerFrequency: number,
  factor: number,
): ViewportConfig {
  const currentSpan = viewport.maxFrequency - viewport.minFrequency;
  const maxSpan = bounds.maxFrequency - bounds.minFrequency;
  const minSpan = Math.min(bounds.minSpanHz ?? 10, maxSpan);
  const span = clamp(currentSpan * factor, minSpan, maxSpan);
  if (Math.abs(span - currentSpan) < 1e-9) return viewport;
  const ratio =
    currentSpan <= 0
      ? 0.5
      : (centerFrequency - viewport.minFrequency) / currentSpan;
  const minFrequency = clamp(
    centerFrequency - span * ratio,
    bounds.minFrequency,
    Math.max(bounds.minFrequency, bounds.maxFrequency - span),
  );
  return { ...viewport, minFrequency, maxFrequency: minFrequency + span };
}

function resolveViewerAxis(
  viewer: AnyNavigableViewer,
  configuredAxis?: NavigationAxis,
): "time" | "frequency" | "both" {
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

function resolveViewerCanvas(
  viewer: AnyNavigableViewer,
  canvas?: HTMLCanvasElement,
): HTMLCanvasElement {
  if (canvas) return canvas;
  if ("getCanvas" in viewer && typeof viewer.getCanvas === "function") {
    const fromViewer = viewer.getCanvas();
    if (fromViewer) return fromViewer;
  }
  const config = viewer.getConfig() as { canvas?: HTMLCanvasElement };
  if (config.canvas) return config.canvas;
  throw new Error("Canvas is required for navigation attachment");
}

export function resolveViewerTimeBounds(
  viewer: AnyNavigableViewer,
): TimeBounds {
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
  viewer: AnyNavigableViewer,
): FrequencyBounds {
  if (
    "getFrequencyBounds" in viewer &&
    typeof (viewer as unknown as { getFrequencyBounds?: () => FrequencyBounds })
      .getFrequencyBounds === "function"
  ) {
    return (
      viewer as unknown as { getFrequencyBounds: () => FrequencyBounds }
    ).getFrequencyBounds();
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

export function attachCanvasWheelNavigation(
  viewer: AnyNavigableViewer,
  canvas?: HTMLCanvasElement,
  options: CanvasWheelNavigationOptions = {},
): () => void {
  const targetCanvas = resolveViewerCanvas(viewer, canvas);
  const axis = resolveViewerAxis(viewer, options.axis);
  const panSensitivity = options.panSensitivity ?? 260;
  const zoomSensitivity = options.zoomSensitivity ?? 0.055;
  const zoomModifier = options.zoomModifier ?? "ctrl";
  const freqModifier = options.frequencyModifier ?? "shift";
  const freqPanSensitivity = options.frequencyPanSensitivity ?? 200;
  const freqZoomSensitivity = options.frequencyZoomSensitivity ?? 0.055;

  let pendingWheel:
    | {
        deltaY: number;
        shiftKey: boolean;
        ctrlKey: boolean;
        altKey: boolean;
        metaKey: boolean;
        clientX: number;
        clientY: number;
      }
    | undefined;
  let wheelFrame: number | undefined;

  const apply = (viewport: ViewportConfig) => {
    const next = setViewerViewport(viewer, viewport);
    options.onNavigate?.(next);
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    pendingWheel = {
      deltaY: event.deltaY,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    if (wheelFrame !== undefined) return;
    wheelFrame = requestAnimationFrame(() => {
      wheelFrame = undefined;
      if (!pendingWheel) return;
      const wheel = pendingWheel;
      pendingWheel = undefined;
      const viewport = viewer.getViewport() as ViewportConfig;

      const isFreqAction =
        axis === "frequency" ||
        (axis === "both" && modifierPressed(wheel, freqModifier));

      if (isFreqAction) {
        const isZooming = modifierPressed(wheel, zoomModifier);
        const freqBounds = resolveViewerFrequencyBounds(viewer);

        if (isZooming) {
          const rect = targetCanvas.getBoundingClientRect?.() ?? {
            left: 0,
            top: 0,
            width: 0,
            height: 0,
          };
          const freq =
            "canvasToTimeFrequency" in viewer &&
            typeof viewer.canvasToTimeFrequency === "function"
              ? viewer.canvasToTimeFrequency(
                  wheel.clientX - rect.left,
                  wheel.clientY - rect.top,
                ).frequency
              : "canvasToFrequency" in viewer &&
                  typeof viewer.canvasToFrequency === "function"
                ? viewer.canvasToFrequency(wheel.clientY - rect.top)
                : (() => {
                    const height =
                      rect.height || targetCanvas.clientHeight || 1;
                    const ratio = 1 - (wheel.clientY - rect.top) / height;
                    return (
                      viewport.minFrequency +
                      ratio * (viewport.maxFrequency - viewport.minFrequency)
                    );
                  })();

          apply(
            zoomViewportFrequency(
              viewport,
              freqBounds,
              freq,
              Math.exp((wheel.deltaY < 0 ? -1 : 1) * freqZoomSensitivity),
            ),
          );
          return;
        }

        // Panning frequency
        const deltaHz =
          -(wheel.deltaY / freqPanSensitivity) *
          (viewport.maxFrequency - viewport.minFrequency);
        apply(panViewportFrequency(viewport, freqBounds, deltaHz));
        return;
      }

      // Time Navigation
      const isZooming = modifierPressed(wheel, zoomModifier);
      const bounds = resolveViewerTimeBounds(viewer);

      if (isZooming) {
        const rect = targetCanvas.getBoundingClientRect?.() ?? {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
        };
        const time =
          "canvasToTimeFrequency" in viewer &&
          typeof viewer.canvasToTimeFrequency === "function"
            ? viewer.canvasToTimeFrequency(
                wheel.clientX - rect.left,
                wheel.clientY - rect.top,
              ).time
            : "canvasToTime" in viewer &&
                typeof viewer.canvasToTime === "function"
              ? viewer.canvasToTime(wheel.clientX - rect.left)
              : (() => {
                  const width = rect.width || targetCanvas.clientWidth || 1;
                  const ratio = (wheel.clientX - rect.left) / width;
                  return (
                    viewport.startTime +
                    ratio * (viewport.endTime - viewport.startTime)
                  );
                })();
        apply(
          zoomViewportTime(
            viewport,
            bounds,
            time,
            Math.exp((wheel.deltaY < 0 ? -1 : 1) * zoomSensitivity),
          ),
        );
        return;
      }

      apply(
        panViewportTime(
          viewport,
          bounds,
          (wheel.deltaY / panSensitivity) *
            (viewport.endTime - viewport.startTime),
        ),
      );
    });
  };

  targetCanvas.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    targetCanvas.removeEventListener("wheel", onWheel);
    if (wheelFrame !== undefined) cancelAnimationFrame(wheelFrame);
  };
}

export function attachCanvasDragNavigation(
  viewer: AnyNavigableViewer,
  canvas?: HTMLCanvasElement,
  options: CanvasDragNavigationOptions = {},
): () => void {
  const targetCanvas = resolveViewerCanvas(viewer, canvas);
  const axis = resolveViewerAxis(viewer, options.axis);
  const targetButton = options.button ?? 0;
  const dragThreshold = options.dragThreshold ?? 3;
  const manageCursor = options.cursor ?? true;
  const freqModifier = options.frequencyModifier ?? "shift";

  let isPointerDown = false;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startViewport: ViewportConfig | undefined;
  let activePointerId: number | undefined;
  const originalCursor = targetCanvas.style?.cursor ?? "";

  if (manageCursor && targetCanvas.style) {
    targetCanvas.style.cursor = "grab";
  }

  const apply = (viewport: ViewportConfig) => {
    const next = setViewerViewport(viewer, viewport);
    options.onNavigate?.(next);
  };

  const onPointerDown = (event: PointerEvent | MouseEvent) => {
    if (event.button !== targetButton) return;
    if (options.modifier && !modifierPressed(event, options.modifier)) return;
    isPointerDown = true;
    isDragging = false;
    startX = event.clientX;
    startY = event.clientY;
    startViewport = viewer.getViewport() as ViewportConfig;
    if ("pointerId" in event) {
      activePointerId = event.pointerId;
      try {
        targetCanvas.setPointerCapture?.(event.pointerId);
      } catch {
        // pointer capture may not be supported in some environments
      }
    }
  };

  const onPointerMove = (event: PointerEvent | MouseEvent) => {
    if (!isPointerDown || !startViewport) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!isDragging) {
      if (Math.hypot(dx, dy) < dragThreshold) return;
      isDragging = true;
      if (manageCursor && targetCanvas.style) {
        targetCanvas.style.cursor = "grabbing";
      }
      options.onDragStart?.(event);
    }

    const isFreqDrag =
      axis === "frequency" ||
      (axis === "both" && modifierPressed(event, freqModifier));

    if (isFreqDrag) {
      const rect = targetCanvas.getBoundingClientRect?.() ?? { height: 0 };
      const canvasHeight = rect.height || targetCanvas.clientHeight || 1;
      const span = startViewport.maxFrequency - startViewport.minFrequency;
      const deltaHz = (dy / canvasHeight) * span;
      const freqBounds = resolveViewerFrequencyBounds(viewer);
      apply(panViewportFrequency(startViewport, freqBounds, deltaHz));
      return;
    }

    // Time Drag
    const rect = targetCanvas.getBoundingClientRect?.() ?? { width: 0 };
    const canvasWidth = rect.width || targetCanvas.clientWidth || 1;
    const duration = startViewport.endTime - startViewport.startTime;
    const deltaSeconds = -(dx / canvasWidth) * duration;
    const bounds = resolveViewerTimeBounds(viewer);
    apply(panViewportTime(startViewport, bounds, deltaSeconds));
  };

  const onPointerUp = (event: PointerEvent | MouseEvent) => {
    if (!isPointerDown) return;
    isPointerDown = false;
    if (
      activePointerId !== undefined &&
      "releasePointerCapture" in targetCanvas &&
      typeof targetCanvas.releasePointerCapture === "function"
    ) {
      try {
        targetCanvas.releasePointerCapture(activePointerId);
      } catch {
        // ignore release capture error
      }
      activePointerId = undefined;
    }
    if (isDragging) {
      isDragging = false;
      if (manageCursor && targetCanvas.style) {
        targetCanvas.style.cursor = "grab";
      }
      options.onDragEnd?.(event);
    }
    startViewport = undefined;
  };

  const hasPointerEvents =
    typeof window !== "undefined" && "PointerEvent" in window;
  const downEvent = hasPointerEvents ? "pointerdown" : "mousedown";
  const moveEvent = hasPointerEvents ? "pointermove" : "mousemove";
  const upEvent = hasPointerEvents ? "pointerup" : "mouseup";
  const cancelEvent = hasPointerEvents ? "pointercancel" : "mouseleave";

  targetCanvas.addEventListener(downEvent, onPointerDown as EventListener);
  targetCanvas.addEventListener(moveEvent, onPointerMove as EventListener);
  targetCanvas.addEventListener(upEvent, onPointerUp as EventListener);
  targetCanvas.addEventListener(cancelEvent, onPointerUp as EventListener);

  return () => {
    targetCanvas.removeEventListener(downEvent, onPointerDown as EventListener);
    targetCanvas.removeEventListener(moveEvent, onPointerMove as EventListener);
    targetCanvas.removeEventListener(upEvent, onPointerUp as EventListener);
    targetCanvas.removeEventListener(cancelEvent, onPointerUp as EventListener);
    if (manageCursor && targetCanvas.style) {
      targetCanvas.style.cursor = originalCursor;
    }
  };
}

export function attachCanvasNavigation(
  viewer: AnyNavigableViewer,
  canvas?: HTMLCanvasElement,
  options: CanvasNavigationOptions = {},
): () => void {
  const targetCanvas = resolveViewerCanvas(viewer, canvas);
  const cleanups: Array<() => void> = [];

  if (options.wheel !== false && options.enableWheel !== false) {
    const wheelOpts: WheelNavigationOptions =
      typeof options.wheel === "object" && options.wheel !== null
        ? {
            ...(options.axis !== undefined ? { axis: options.axis } : {}),
            ...(options.onNavigate !== undefined
              ? { onNavigate: options.onNavigate }
              : {}),
            ...options,
            ...options.wheel,
          }
        : options;
    cleanups.push(attachCanvasWheelNavigation(viewer, targetCanvas, wheelOpts));
  }

  if (options.drag !== false && options.enableDrag !== false) {
    const dragOpts: DragNavigationOptions =
      typeof options.drag === "object" && options.drag !== null
        ? {
            ...(options.axis !== undefined ? { axis: options.axis } : {}),
            ...(options.onNavigate !== undefined
              ? { onNavigate: options.onNavigate }
              : {}),
            ...options,
            ...options.drag,
          }
        : options;
    cleanups.push(attachCanvasDragNavigation(viewer, targetCanvas, dragOpts));
  }

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}

function modifierPressed(
  event: {
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
  },
  modifier?: ModifierKey | undefined,
): boolean {
  if (!modifier || modifier === "none") return true;
  if (modifier === "shift") return event.shiftKey;
  if (modifier === "ctrl") return event.ctrlKey;
  if (modifier === "alt") return event.altKey;
  if (modifier === "meta") return event.metaKey;
  return false;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
