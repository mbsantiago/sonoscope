import type { ViewportConfig } from "@sonoscope/core";
import type React from "react";
import type { RecordingItem } from "../recordings";
import type { SpectrogramSettings, ViewportState } from "../types";
import {
  Spectrogram,
  type SpectrogramHandle,
  type SpectrogramReadyInfo,
  Waveform,
} from "@sonoscope/react";
import { type RefObject, useMemo } from "react";
import { Minimap } from "./Minimap";

export type SpectrogramPanelProps = {
  spectrogramRef: RefObject<SpectrogramHandle | null>;
  audioRef: RefObject<HTMLAudioElement | null>;
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
    audioRef,
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

      <audio
        ref={audioRef}
        src={recording.url}
        controls
        crossOrigin="anonymous"
        style={{ width: "100%", marginBottom: "12px" }}
      />

      <div style={{ marginBottom: "10px" }}>
        <div
          style={{
            fontSize: "11px",
            color: "#89919f",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: "4px",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          Waveform Envelope (Peak Decimation)
        </div>
        <Waveform
          colorMap={settings.colorMap}
          amplitudeScale={1.2}
          navigation={true}
          style={{ width: "100%", height: "90px" }}
          canvasProps={{
            style: {
              width: "100%",
              height: "100%",
              display: "block",
              borderRadius: "6px",
              border: "1px solid rgba(255,255,255,.12)",
              background: "#080c14",
              cursor: "grab",
            },
          }}
        />
      </div>

      <div>
        <div
          style={{
            fontSize: "11px",
            color: "#89919f",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: "4px",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          Spectrogram Viewport (STFT)
        </div>
        <Spectrogram
          ref={spectrogramRef}
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
              height: "min(42vh, 400px)",
              minHeight: "260px",
              display: "block",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,.12)",
              background: "#050505",
              cursor: "grab",
              touchAction: "none",
            },
          }}
        />
      </div>

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
