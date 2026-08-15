import type React from "react";
import type { ViewportState } from "../types";
import { useRef } from "react";

function pseudoLevel(index: number): number {
  return Math.abs(Math.sin(index * 0.41) * Math.cos(index * 0.17));
}

export type MinimapProps = {
  duration: number;
  playheadTime: number;
  viewport: ViewportState;
  onViewportChange: (viewport: ViewportState) => void;
};

export function Minimap(props: MinimapProps): React.ReactElement {
  const dragRef = useRef<{
    x: number;
    startTime: number;
    span: number;
  } | null>(null);

  const duration = Math.max(props.duration, 0.001);
  const span = props.viewport.endTime - props.viewport.startTime;
  const left = (props.viewport.startTime / duration) * 100;
  const width = Math.min(100, (span / duration) * 100);
  const playheadLeft = Math.min(
    100,
    Math.max(0, (props.playheadTime / duration) * 100),
  );

  function moveFromPointer(
    event: React.PointerEvent<HTMLDivElement>,
    mode: "center" | "drag",
  ) {
    const rect = event.currentTarget.getBoundingClientRect();
    const secondsPerPixel = duration / rect.width;
    if (mode === "center") {
      const centerTime = (event.clientX - rect.left) * secondsPerPixel;
      const startTime = centerTime - span / 2;
      dragRef.current = { x: event.clientX, startTime, span };
      props.onViewportChange({
        ...props.viewport,
        startTime,
        endTime: startTime + span,
      });
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const startTime =
      drag.startTime + (event.clientX - drag.x) * secondsPerPixel;
    props.onViewportChange({
      ...props.viewport,
      startTime,
      endTime: startTime + drag.span,
    });
  }

  return (
    <div className="minimap-block">
      <div className="minimap-label">
        <span>Recording overview</span>
        <b>
          {props.viewport.startTime.toFixed(2)}s-
          {props.viewport.endTime.toFixed(2)}s / {duration.toFixed(2)}s
        </b>
      </div>
      <div
        className="minimap"
        role="slider"
        tabIndex={0}
        aria-label="Spectrogram viewport position"
        aria-valuemin={0}
        aria-valuemax={Number(duration.toFixed(2))}
        aria-valuenow={Number(props.viewport.startTime.toFixed(2))}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          moveFromPointer(event, "center");
        }}
        onPointerMove={(event) => moveFromPointer(event, "drag")}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const step = span * (event.shiftKey ? 1 : 0.2);
          const delta = event.key === "ArrowLeft" ? -step : step;
          props.onViewportChange({
            ...props.viewport,
            startTime: props.viewport.startTime + delta,
            endTime: props.viewport.endTime + delta,
          });
        }}
      >
        <div className="minimap-wave">
          {Array.from({ length: 72 }, (_, index) => (
            <i
              key={index}
              style={{ height: `${24 + pseudoLevel(index) * 68}%` }}
            />
          ))}
        </div>
        <div
          className="minimap-window"
          style={{ left: `${left}%`, width: `${width}%` }}
        />
        <div
          className="minimap-playhead"
          style={{ left: `${playheadLeft}%` }}
        />
      </div>
    </div>
  );
}
