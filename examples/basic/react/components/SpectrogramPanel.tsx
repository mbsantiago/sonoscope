import type { ViewportConfig } from "@sonogram/core";
import {
  Spectrogram,
  type SpectrogramHandle,
  type SpectrogramReadyInfo,
} from "@sonogram/react";
import type React from "react";
import { type RefObject, useMemo } from "react";
import type { RecordingItem } from "../recordings";
import type { SpectrogramSettings, ViewportState } from "../types";
import { Minimap } from "./Minimap";

export type SpectrogramPanelProps = {
  spectrogramRef: RefObject<SpectrogramHandle | null>;
  recording: RecordingItem;
  settings: SpectrogramSettings;
  status: string;
  duration: number;
  playheadTime: number;
  viewport: ViewportState;
  cacheSummary: string;
  onViewportChange: (viewport: ViewportState) => void;
  onUserNavigate: (viewport: ViewportState) => void;
  onReady?: (info: SpectrogramReadyInfo) => void;
};

export function SpectrogramPanel(
  props: SpectrogramPanelProps,
): React.ReactElement {
  const {
    spectrogramRef,
    recording,
    settings,
    status,
    duration,
    playheadTime,
    viewport,
    cacheSummary,
    onViewportChange,
    onUserNavigate,
    onReady,
  } = props;

  const rendererConfig = useMemo(() => {
    return settings.shaderProgram === "auto"
      ? "auto"
      : { type: "webgl" as const, program: settings.shaderProgram };
  }, [settings.shaderProgram]);

  return (
    <div className="display-card">
      <div className="display-topline">
        <div>
          <strong>{recording.title}</strong>
          {recording.description && <span>{recording.description}</span>}
        </div>
        <span className="status">{status}</span>
      </div>

      <Spectrogram
        ref={spectrogramRef}
        url={recording.url}
        showAudioControls={true}
        colorMap={settings.colorMap}
        valueMode={settings.valueMode}
        minValue={settings.minDb}
        maxValue={settings.maxDb}
        valueGamma={1}
        clampValues={true}
        windowSize={settings.windowSize}
        fftSize={settings.windowSize}
        hopSize={settings.hopSize}
        window={settings.window}
        frequencyScale={settings.frequencyScale}
        renderer={rendererConfig}
        minViewportDuration={0.08}
        maxViewportDuration={20}
        followPlayback={true}
        renderOnSeek={true}
        navigation={true}
        onReady={onReady}
        onViewportChange={(vp: ViewportConfig) => {
          onViewportChange({
            startTime: vp.startTime,
            endTime: vp.endTime,
            minFrequency: vp.minFrequency,
            maxFrequency: vp.maxFrequency,
          });
        }}
        canvasProps={{
          style: {
            width: "100%",
            height: "min(52vh, 520px)",
            minHeight: "330px",
            display: "block",
            borderRadius: "8px",
            border: "1px solid rgba(255,255,255,.12)",
            background: "#050505",
            cursor: "grab",
            touchAction: "none",
          },
        }}
      />

      <Minimap
        duration={duration}
        playheadTime={playheadTime}
        viewport={viewport}
        onViewportChange={onUserNavigate}
      />

      <div className="cache-summary">{cacheSummary}</div>
    </div>
  );
}
