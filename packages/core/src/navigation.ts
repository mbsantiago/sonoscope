import type { ViewportConfig } from "./types";
import type { FrequencyRulerViewer } from "./viewers/frequency-ruler/viewer";
import type { SpectrogramViewer } from "./viewers/spectrogram/viewer";
import type { TimeRulerViewer } from "./viewers/time-ruler/viewer";
import type { WaveformViewer } from "./viewers/waveform/viewer";

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
  getScope?(): { getDuration(): number; [key: string]: unknown };
  getConfig(): {
    minViewportDuration?: number;
    maxViewportDuration?: number;
    [key: string]: unknown;
  };
  getTimeBounds?: () => TimeBounds;
  canvasToTimeFrequency?: (
    x: number,
    y: number,
  ) => { time: number; frequency: number };
  canvasToTime?: (x: number) => number;
}

export type TimeBounds = {
  startTime: number;
  endTime: number;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
};

export type CanvasWheelNavigationOptions = {
  panSensitivity?: number;
  zoomSensitivity?: number;
  zoomModifier?: "shift" | "ctrl" | "alt" | "meta";
  onNavigate?: (viewport: ViewportConfig) => void;
};

export type CanvasDragNavigationOptions = {
  button?: number;
  modifier?: "shift" | "ctrl" | "alt" | "meta";
  dragThreshold?: number;
  cursor?: boolean;
  onNavigate?: (viewport: ViewportConfig) => void;
  onDragStart?: (event: PointerEvent | MouseEvent) => void;
  onDragEnd?: (event: PointerEvent | MouseEvent) => void;
};

export type CanvasNavigationOptions = CanvasWheelNavigationOptions &
  CanvasDragNavigationOptions & {
    enableWheel?: boolean;
    enableDrag?: boolean;
  };

export type FrequencyBounds = {
  minFrequency: number;
  maxFrequency: number;
  minSpanHz?: number;
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

function resolveViewerTimeBounds(
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
      ? viewer.getScope()?.getDuration?.() ?? 0
      : 0;
  return {
    startTime: 0,
    endTime: duration,
    minDurationSeconds: config.minViewportDuration ?? 0.05,
    maxDurationSeconds: config.maxViewportDuration ?? 30,
  };
}

export function attachCanvasWheelNavigation(
  viewer: AnyNavigableViewer,
  canvas?: HTMLCanvasElement,
  options: CanvasWheelNavigationOptions = {},
): () => void {
  const targetCanvas = resolveViewerCanvas(viewer, canvas);
  const panSensitivity = options.panSensitivity ?? 260;
  const zoomSensitivity = options.zoomSensitivity ?? 0.055;
  const zoomModifier = options.zoomModifier ?? "ctrl";
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
      const bounds = resolveViewerTimeBounds(viewer);
      if (modifierPressed(wheel, zoomModifier)) {
        const rect = targetCanvas.getBoundingClientRect?.() ?? {
          left: 0,
          top: 0,
          width: 0,
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
  const targetButton = options.button ?? 0;
  const dragThreshold = options.dragThreshold ?? 3;
  const manageCursor = options.cursor ?? true;

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

  if (options.enableWheel !== false) {
    cleanups.push(attachCanvasWheelNavigation(viewer, targetCanvas, options));
  }

  if (options.enableDrag !== false) {
    cleanups.push(attachCanvasDragNavigation(viewer, targetCanvas, options));
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
  modifier: NonNullable<CanvasWheelNavigationOptions["zoomModifier"]>,
): boolean {
  if (modifier === "shift") return event.shiftKey;
  if (modifier === "ctrl") return event.ctrlKey;
  if (modifier === "alt") return event.altKey;
  return event.metaKey;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
