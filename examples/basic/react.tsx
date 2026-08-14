import type { SpectrogramHandle } from "@sonogram/react";
import type React from "react";
import { startTransition, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ControlPanel } from "./react/components/ControlPanel";
import { Header } from "./react/components/Header";
import { SpectrogramPanel } from "./react/components/SpectrogramPanel";
import { RECORDINGS } from "./react/recordings";
import { demoStyles } from "./react/styles";
import type { SpectrogramSettings, ViewportState } from "./react/types";

const initialSettings: SpectrogramSettings = {
  recordingIndex: 0,
  frequencyScale: "mel",
  valueMode: "db",
  colorMap: "magma",
  minDb: -86,
  maxDb: -8,
  windowSize: 1024,
  hopSize: 128,
  window: "hann",
  shaderProgram:
    new URLSearchParams(location.search).get("summon") === "mountains"
      ? "terrain"
      : "auto",
};

export function ReactSpectrogramDemo(): React.ReactElement {
  const spectrogramRef = useRef<SpectrogramHandle | null>(null);
  const [settings, setSettings] =
    useState<SpectrogramSettings>(initialSettings);
  const [duration, setDuration] = useState(30);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [cacheSummary, setCacheSummary] = useState("cache: empty");
  const [viewport, setViewport] = useState<ViewportState>({
    startTime: 0,
    endTime: 12,
    minFrequency: 20,
    maxFrequency: 12_000,
  });
  const [status, setStatus] = useState("Ready");

  const currentRecording =
    RECORDINGS[settings.recordingIndex] ?? RECORDINGS[0]!;

  useEffect(() => {
    const handle = spectrogramRef.current;
    if (!handle) return;
    const audio = handle.getAudio();
    const viewer = handle.getViewer();
    if (!viewer) return;

    setDuration(viewer.getDuration());
    setCacheSummary(formatCacheStats(viewer.getCacheStats()));

    const unsubProfile = viewer.on("renderprofile", () => {
      setCacheSummary(formatCacheStats(viewer.getCacheStats()));
    });
    const unsubComplete = viewer.on("rendercomplete", () => {
      setStatus(
        `Drag to pan. Wheel to zoom. Shader: ${settings.shaderProgram}.`,
      );
    });
    const unsubError = viewer.on("error", (event) => {
      setStatus(`Error: ${event.error.message}`);
    });

    let frame: number | undefined;
    const updateTime = () => setPlayheadTime(audio?.currentTime || 0);
    const tick = () => {
      updateTime();
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (frame === undefined) frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      updateTime();
    };

    if (audio) {
      audio.addEventListener("play", start);
      audio.addEventListener("pause", stop);
      audio.addEventListener("seeked", updateTime);
      audio.addEventListener("timeupdate", updateTime);
      updateTime();
      if (!audio.paused) start();
    }

    return () => {
      unsubProfile();
      unsubComplete();
      unsubError();
      stop();
      if (audio) {
        audio.removeEventListener("play", start);
        audio.removeEventListener("pause", stop);
        audio.removeEventListener("seeked", updateTime);
        audio.removeEventListener("timeupdate", updateTime);
      }
    };
  }, [settings.recordingIndex, settings.shaderProgram]);

  function handleUpdateSettings(update: Partial<SpectrogramSettings>) {
    startTransition(() => {
      setSettings((prev) => ({ ...prev, ...update }));
    });
  }

  function handleUpdateViewport(next: ViewportState) {
    startTransition(() => {
      setViewport(next);
      spectrogramRef.current?.getViewer()?.updateViewport(next);
    });
  }

  function handleResetView() {
    startTransition(() => {
      const next: ViewportState = {
        startTime: 0,
        endTime: Math.min(12, duration),
        minFrequency: 20,
        maxFrequency: 12_000,
      };
      setViewport(next);
      spectrogramRef.current?.getViewer()?.updateViewport(next);
    });
  }

  return (
    <main className="shell">
      <style>{demoStyles}</style>
      <Header />
      <section className="workbench">
        <SpectrogramPanel
          spectrogramRef={spectrogramRef}
          recording={currentRecording}
          settings={settings}
          status={status}
          duration={duration}
          playheadTime={playheadTime}
          viewport={viewport}
          cacheSummary={cacheSummary}
          onViewportChange={handleUpdateViewport}
        />
        <ControlPanel
          settings={settings}
          maxFrequency={viewport.maxFrequency}
          onUpdateSettings={handleUpdateSettings}
          onUpdateMaxFrequency={(maxFrequency) =>
            handleUpdateViewport({ ...viewport, maxFrequency })
          }
          onResetView={handleResetView}
        />
      </section>
    </main>
  );
}

function formatCacheStats(stats: {
  bytes: number;
  peakBytes: number;
  tiles: number;
  peakTiles: number;
}): string {
  return `cache: ${stats.tiles} tiles / ${formatBytes(stats.bytes)} · peak ${stats.peakTiles} tiles / ${formatBytes(stats.peakBytes)}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

createRoot(document.getElementById("root")!).render(<ReactSpectrogramDemo />);
