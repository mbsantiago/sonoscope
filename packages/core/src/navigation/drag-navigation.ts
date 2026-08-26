import type {
  DragNavigationOptions,
  NavigableViewer,
  ViewportConfig,
} from "../types";
import { setViewerViewport } from "./apply-viewport";
import { type ModifierKeyState, modifierPressed } from "./modifiers";
import { createFrameCoalescer } from "./raf-coalescer";
import { createViewerAdapter } from "./viewer-adapter";
import { panViewportFrequency, panViewportTime } from "./viewport-axes";

interface PointerState extends ModifierKeyState {
  clientX: number;
  clientY: number;
}

export function attachDragNavigation(
  viewer: NavigableViewer,
  canvas?: HTMLElement,
  options: DragNavigationOptions = {},
): () => void {
  const adapter = createViewerAdapter(viewer, canvas, options.axis);
  const targetButton = options.button ?? 0;
  const dragThreshold = options.dragThreshold ?? 3;
  const manageCursor = options.cursor ?? true;
  const freqModifier = options.frequencyModifier ?? "shift";
  const originalCursor = adapter.canvas.style?.cursor ?? "";

  if (manageCursor && adapter.canvas.style) {
    adapter.canvas.style.cursor = "grab";
  }

  const apply = (viewport: ViewportConfig) => {
    const newViewport = setViewerViewport(viewer, viewport);
    options.onNavigate?.(newViewport);
  };

  let isPointerDown = false;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startViewport: ViewportConfig | undefined;
  let activePointerId: number | undefined;

  // A pointer only "owns" the drag once it started one. This keeps a second
  // finger/pointer landing on the canvas mid-drag from hijacking or
  // prematurely ending the active drag.
  const isActivePointer = (event: PointerEvent | MouseEvent): boolean =>
    !("pointerId" in event) ||
    activePointerId === undefined ||
    event.pointerId === activePointerId;

  const coalescer = createFrameCoalescer<PointerState>((pointer) => {
    if (!startViewport) return;
    const currentDx = pointer.clientX - startX;
    const currentDy = pointer.clientY - startY;

    const isFreqDrag =
      adapter.axisMode === "frequency" ||
      (adapter.axisMode === "both" && modifierPressed(pointer, freqModifier));

    if (isFreqDrag) {
      const rect = adapter.canvas.getBoundingClientRect?.() ?? { height: 0 };
      const canvasHeight = rect.height || adapter.canvas.clientHeight || 1;
      const bounds = adapter.getFrequencyBounds();
      const minF = startViewport.minFrequency ?? bounds.minFrequency;
      const maxF = startViewport.maxFrequency ?? bounds.maxFrequency;
      const deltaHz = (currentDy / canvasHeight) * (maxF - minF);
      apply(panViewportFrequency(startViewport, bounds, deltaHz));
      return;
    }

    const rect = adapter.canvas.getBoundingClientRect?.() ?? { width: 0 };
    const canvasWidth = rect.width || adapter.canvas.clientWidth || 1;
    const duration = startViewport.endTime - startViewport.startTime;
    const deltaSeconds = -(currentDx / canvasWidth) * duration;
    apply(
      panViewportTime(startViewport, adapter.getTimeBounds(), deltaSeconds),
    );
  });

  const onPointerDown = (event: PointerEvent | MouseEvent) => {
    if (event.button !== targetButton) return;
    if (options.modifier && !modifierPressed(event, options.modifier)) return;
    if (isPointerDown) return; // a drag is already active on another pointer
    isPointerDown = true;
    isDragging = false;
    startX = event.clientX;
    startY = event.clientY;
    startViewport = adapter.getViewport();
    if ("pointerId" in event) {
      activePointerId = event.pointerId;
      try {
        adapter.canvas.setPointerCapture?.(event.pointerId);
      } catch {
        // pointer capture may not be supported in some environments
      }
    }
  };

  const onPointerMove = (event: PointerEvent | MouseEvent) => {
    if (!isPointerDown || !startViewport || !isActivePointer(event)) return;

    if (!isDragging) {
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.hypot(dx, dy) < dragThreshold) return;
      isDragging = true;
      if (manageCursor && adapter.canvas.style) {
        adapter.canvas.style.cursor = "grabbing";
      }
      options.onDragStart?.(event);
    }

    coalescer.push({
      clientX: event.clientX,
      clientY: event.clientY,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    });
  };

  const onPointerUp = (event: PointerEvent | MouseEvent) => {
    if (!isPointerDown || !isActivePointer(event)) return;
    isPointerDown = false;
    coalescer.cancel();

    if (
      activePointerId !== undefined &&
      "releasePointerCapture" in adapter.canvas &&
      typeof adapter.canvas.releasePointerCapture === "function"
    ) {
      try {
        adapter.canvas.releasePointerCapture(activePointerId);
      } catch {
        // ignore release capture error
      }
    }
    activePointerId = undefined;

    if (isDragging) {
      isDragging = false;
      if (manageCursor && adapter.canvas.style) {
        adapter.canvas.style.cursor = "grab";
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

  adapter.canvas.addEventListener(downEvent, onPointerDown as EventListener);
  adapter.canvas.addEventListener(moveEvent, onPointerMove as EventListener);
  adapter.canvas.addEventListener(upEvent, onPointerUp as EventListener);
  adapter.canvas.addEventListener(cancelEvent, onPointerUp as EventListener);

  return () => {
    adapter.canvas.removeEventListener(
      downEvent,
      onPointerDown as EventListener,
    );
    adapter.canvas.removeEventListener(
      moveEvent,
      onPointerMove as EventListener,
    );
    adapter.canvas.removeEventListener(upEvent, onPointerUp as EventListener);
    adapter.canvas.removeEventListener(
      cancelEvent,
      onPointerUp as EventListener,
    );
    coalescer.cancel();
    if (manageCursor && adapter.canvas.style) {
      adapter.canvas.style.cursor = originalCursor;
    }
  };
}
