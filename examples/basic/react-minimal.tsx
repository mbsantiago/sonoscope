import type React from "react";
import {
  SonoscopeProvider,
  Spectrogram,
  useSonoscope,
  Waveform,
} from "@sonoscope/react";
import { useState } from "react";
import { createRoot } from "react-dom/client";

const RECORDINGS = [
  {
    title: "1. After You've Gone (Harris, 1918)",
    url: "https://upload.wikimedia.org/wikipedia/commons/0/01/After_You%27ve_Gone_%28Harris_1918_recording%29.wav?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original",
  },
  {
    title: "2. Birdsong Bourne Lincolnshire",
    url: "https://upload.wikimedia.org/wikipedia/commons/0/01/20210321_0900_Birdsong_Bourne_Lincolnshire.mp3?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original",
  },
  {
    title: "3. Backyard Ambience",
    url: "https://upload.wikimedia.org/wikipedia/commons/0/0c/Backyard_ambience_%28Gravity_Sound%29.wav?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original",
  },
];

export function MinimalReactDemo(): React.ReactElement {
  const [selectedUrl, setSelectedUrl] = useState(RECORDINGS[0]!.url);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
    null,
  );

  const { scope, loading, error } = useSonoscope({
    url: selectedUrl,
    audio: audioElement ?? undefined,
    followPlayback: "page",
  });

  return (
    <main
      style={{
        maxWidth: 900,
        margin: "2rem auto",
        fontFamily: "system-ui, sans-serif",
        color: "#f8fafc",
      }}
    >
      <p>
        <a href="./index.html" style={{ color: "#93c5fd" }}>
          ← Back to demos
        </a>
      </p>
      <h1>React Minimal Audio Player</h1>
      <p style={{ color: "#94a3b8" }}>
        Minimal synchronized audio player powered entirely by{" "}
        <code>@sonoscope/react</code> components (
        <code>&lt;SonoscopeProvider&gt;</code>, <code>&lt;Waveform&gt;</code>,{" "}
        <code>&lt;Spectrogram&gt;</code>, and <code>useSonoscope</code>).
      </p>

      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span>Track:</span>
          <select
            value={selectedUrl}
            onChange={(e) => setSelectedUrl(e.target.value)}
            style={{
              padding: "0.4rem 0.6rem",
              background: "#1e293b",
              color: "#f8fafc",
              border: "1px solid #334155",
              borderRadius: "4px",
            }}
          >
            {RECORDINGS.map((rec) => (
              <option key={rec.url} value={rec.url}>
                {rec.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <audio
        ref={setAudioElement}
        src={selectedUrl}
        controls
        crossOrigin="anonymous"
        style={{ width: "100%", marginBottom: "1rem" }}
      />

      {loading && (
        <p style={{ color: "#38bdf8" }}>Loading audio source stream...</p>
      )}
      {error && <p style={{ color: "#f87171" }}>Error: {error.message}</p>}

      <SonoscopeProvider value={scope}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <div
              style={{
                fontSize: "11px",
                color: "#94a3b8",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: "4px",
                fontFamily: "monospace",
              }}
            >
              Waveform (Peak Decimation)
            </div>
            <Waveform
              colorMap="magma"
              amplitudeScale={1.2}
              navigation
              style={{ width: "100%", height: 80 }}
            />
          </div>

          <div>
            <div
              style={{
                fontSize: "11px",
                color: "#94a3b8",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: "4px",
                fontFamily: "monospace",
              }}
            >
              Spectrogram (WebGL2 / WASM STFT)
            </div>
            <Spectrogram
              colorMap="magma"
              frequencyScale="mel"
              valueMode="db"
              navigation
              style={{ width: "100%", height: 320 }}
            />
          </div>
        </div>
      </SonoscopeProvider>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<MinimalReactDemo />);
