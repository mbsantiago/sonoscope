import type {
  NavigableViewer,
  ViewportConfig,
  WheelNavigationOptions,
} from "../types";
import { setViewerViewport } from "./apply-viewport";
import { type ModifierKeyState, modifierPressed } from "./modifiers";
import { createFrameCoalescer } from "./raf-coalescer";
import { createViewerAdapter } from "./viewer-adapter";
import {
  panViewportFrequency,
  panViewportTime,
  zoomViewportFrequency,
  zoomViewportTime,
} from "./viewport-axes";

interface WheelState extends ModifierKeyState {
  deltaY: number;
  clientX: number;
  clientY: number;
}

export function attachWheelNavigation(
  viewer: NavigableViewer,
  canvas?: HTMLElement,
  options: WheelNavigationOptions = {},
): () => void {
  const adapter = createViewerAdapter(viewer, canvas, options.axis);
  const panSensitivity = options.panSensitivity ?? 260;
  const zoomSensitivity = options.zoomSensitivity ?? 0.055;
  const zoomModifier = options.zoomModifier ?? "ctrl";
  const freqModifier = options.frequencyModifier ?? "shift";
  const freqPanSensitivity = options.frequencyPanSensitivity ?? 200;
  const freqZoomSensitivity = options.frequencyZoomSensitivity ?? 0.055;

  const apply = (viewport: ViewportConfig) => {
    const newViewport = setViewerViewport(viewer, viewport);
    options.onNavigate?.(newViewport);
  };

  function handleFrequencyWheel(wheel: WheelState, viewport: ViewportConfig) {
    const bounds = adapter.getFrequencyBounds();

    if (modifierPressed(wheel, zoomModifier)) {
      const rect = adapter.canvas.getBoundingClientRect?.() ?? {
        left: 0,
        top: 0,
        width: 0,
        height: 0,
      };
      const { frequency } = adapter.pointToTimeFrequency(
        wheel.clientX - rect.left,
        wheel.clientY - rect.top,
        rect,
      );
      apply(
        zoomViewportFrequency(
          viewport,
          bounds,
          frequency ?? (bounds.minFrequency + bounds.maxFrequency) / 2,
          Math.exp((wheel.deltaY < 0 ? -1 : 1) * freqZoomSensitivity),
        ),
      );
      return;
    }

    const minF = viewport.minFrequency ?? bounds.minFrequency;
    const maxF = viewport.maxFrequency ?? bounds.maxFrequency;
    const deltaHz = -(wheel.deltaY / freqPanSensitivity) * (maxF - minF);
    apply(panViewportFrequency(viewport, bounds, deltaHz));
  }

  function handleTimeWheel(wheel: WheelState, viewport: ViewportConfig) {
    const bounds = adapter.getTimeBounds();

    if (modifierPressed(wheel, zoomModifier)) {
      const rect = adapter.canvas.getBoundingClientRect?.() ?? {
        left: 0,
        top: 0,
        width: 0,
        height: 0,
      };
      const { time } = adapter.pointToTimeFrequency(
        wheel.clientX - rect.left,
        wheel.clientY - rect.top,
        rect,
      );
      apply(
        zoomViewportTime(
          viewport,
          bounds,
          time ?? viewport.startTime,
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
  }

  const coalescer = createFrameCoalescer<WheelState>((wheel) => {
    const viewport = adapter.getViewport();
    const isFreqAction =
      adapter.axisMode === "frequency" ||
      (adapter.axisMode === "both" && modifierPressed(wheel, freqModifier));

    if (isFreqAction) {
      handleFrequencyWheel(wheel, viewport);
    } else {
      handleTimeWheel(wheel, viewport);
    }
  });

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    coalescer.push({
      deltaY: event.deltaY,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  };

  adapter.canvas.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    adapter.canvas.removeEventListener("wheel", onWheel);
    coalescer.cancel();
  };
}
