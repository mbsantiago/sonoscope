import type { SpectrogramHandle, SpectrogramReadyInfo } from "@sonoscope/react";
import type React from "react";
import type { SpectrogramSettings, ViewportState } from "./react/types";
import { SonoscopeProvider, useSonoscope } from "@sonoscope/react";
import { startTransition, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ControlPanel } from "./react/components/ControlPanel";
import { Header } from "./react/components/Header";
import { SpectrogramPanel } from "./react/components/SpectrogramPanel";
import { RECORDINGS } from "./react/recordings";
import { demoStyles } from "./react/styles";

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
  shaderProgram: "auto",
};

export function ReactSpectrogramDemo(): React.ReactElement {
  const spectrogramRef = useRef<SpectrogramHandle | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [settings, setSettings] =
    useState<SpectrogramSettings>(initialSettings);
  const [duration, setDuration] = useState(30);
  const [nyquist, setNyquist] = useState(22050);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [cacheSummary, setCacheSummary] = useState("cache: empty");
  const [viewport, setViewport] = useState<ViewportState>({
    startTime: 0,
    endTime: 12,
    minFrequency: 0,
    maxFrequency: 22050,
  });
  const [status, setStatus] = useState("Ready");

  const currentRecording =
    RECORDINGS[settings.recordingIndex] ?? RECORDINGS[0]!;

  const { scope, loading, error } = useSonoscope({
    url: currentRecording.url,
    startTime: 0,
    endTime: 12,
    followPlayback: "page",
  });

  function handleSpectrogramReady(info: SpectrogramReadyInfo) {
    const { duration: dur, nyquist: nq, viewer } = info;
    startTransition(() => {
      setDuration(dur);
      setNyquist(nq);
      const nextVp: ViewportState = {
        startTime: 0,
        endTime: Math.min(12, dur),
        minFrequency: 0,
        maxFrequency: nq,
      };
      setViewport(nextVp);
      setCacheSummary(formatCacheStats(viewer.getCacheStats()));
    });
  }

  useEffect(() => {
    if (!scope) return;
    const audio = audioRef.current;
    if (audio) {
      scope.attachAudio(audio);
    }
  }, [scope]);

  useEffect(() => {
    if (!scope) return;

    const unsubVp = scope.on("viewportchange", (event) => {
      setViewport((prev) => ({
        ...prev,
        startTime: event.viewport.startTime,
        endTime: event.viewport.endTime,
        minFrequency: event.viewport.minFrequency ?? prev.minFrequency,
        maxFrequency: event.viewport.maxFrequency ?? prev.maxFrequency,
      }));
    });

    const unsubTime = scope.on("timeupdate", (event) => {
      setPlayheadTime(event.currentTime);
    });

    return () => {
      unsubVp();
      unsubTime();
    };
  }, [scope]);

  useEffect(() => {
    const handle = spectrogramRef.current;
    if (!handle) return;
    const viewer = handle.getViewer();
    if (!viewer) return;

    const unsubComp = viewer.on("rendercomplete", () => {
      setCacheSummary(formatCacheStats(viewer.getCacheStats()));
      const liveNyquist = viewer.getNyquist();
      if (liveNyquist > 0) {
        setNyquist(liveNyquist);
      }
      setStatus(
        `Drag to pan. Wheel to zoom. Shader: ${settings.shaderProgram}.`,
      );
    });
    const unsubError = viewer.on("error", (event) => {
      setStatus(`Error: ${event.error.message}`);
    });

    return () => {
      unsubComp();
      unsubError();
    };
  }, [settings.recordingIndex, settings.shaderProgram, scope]);

  function handleUpdateSettings(update: Partial<SpectrogramSettings>) {
    startTransition(() => {
      setSettings((prev) => ({ ...prev, ...update }));
    });
  }

  function handlePassiveViewportChange(next: ViewportState) {
    startTransition(() => {
      setViewport(next);
      const viewer = spectrogramRef.current?.getViewer();
      if (viewer) {
        const liveNyquist = viewer.getNyquist();
        if (liveNyquist > 0 && liveNyquist !== nyquist) {
          setNyquist(liveNyquist);
        }
      }
    });
  }

  function handleUserNavigate(next: ViewportState) {
    startTransition(() => {
      setViewport(next);
      if (scope) {
        scope.setViewport({
          startTime: next.startTime,
          endTime: next.endTime,
          minFrequency: next.minFrequency,
          maxFrequency: next.maxFrequency,
        });
      }
    });
  }

  function handleResetView() {
    startTransition(() => {
      const next: ViewportState = {
        startTime: 0,
        endTime: Math.min(12, duration),
        minFrequency: 0,
        maxFrequency: nyquist,
      };
      setViewport(next);
      if (scope) {
        scope.setViewport({
          startTime: next.startTime,
          endTime: next.endTime,
          minFrequency: next.minFrequency,
          maxFrequency: next.maxFrequency,
        });
      }
    });
  }

  return (
    <main className="shell">
      <style>{demoStyles}</style>
      <Header />
      <section className="workbench">
        <SonoscopeProvider value={scope}>
          <SpectrogramPanel
            spectrogramRef={spectrogramRef}
            audioRef={audioRef}
            recording={currentRecording}
            settings={settings}
            status={
              error
                ? `Error: ${error.message}`
                : loading
                  ? "Loading audio..."
                  : status
            }
            duration={duration}
            playheadTime={playheadTime}
            viewport={viewport}
            cacheSummary={cacheSummary}
            onReady={handleSpectrogramReady}
            onViewportChange={handlePassiveViewportChange}
            onUserNavigate={handleUserNavigate}
          />
        </SonoscopeProvider>
        <ControlPanel
          settings={settings}
          minFrequency={viewport.minFrequency}
          maxFrequency={viewport.maxFrequency}
          nyquist={nyquist}
          onUpdateSettings={handleUpdateSettings}
          onUpdateFrequencyRange={(minFrequency, maxFrequency) =>
            handleUserNavigate({ ...viewport, minFrequency, maxFrequency })
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
