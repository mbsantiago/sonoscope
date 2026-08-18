import {
  type ColorMapConfig,
  type FrequencyScale,
  Sonoscope,
  attachCanvasNavigation,
  attachPlayheadOverlay,
} from "@sonoscope/core";
import { useEffect, useRef, useState } from "react";

export interface DemoProps {
  initialCmap?: "viridis" | "plasma" | "inferno" | "magma" | "cividis" | "turbo" | "gray";
  initialScale?: FrequencyScale;
  showWaveform?: boolean;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, 1, true); // NumChannels (1 mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function generateSignal(type: "chirp" | "harmonic" | "complex", sampleRate: number, duration: number): Float32Array {
  const nSamples = Math.floor(sampleRate * duration);
  const out = new Float32Array(nSamples);

  if (type === "chirp") {
    for (let i = 0; i < nSamples; i++) {
      const t = i / sampleRate;
      const f = 100 + 7000 * Math.pow(t / duration, 2);
      out[i] = 0.5 * Math.sin(2 * Math.PI * f * t);
    }
  } else if (type === "harmonic") {
    const fundamental = 220;
    for (let i = 0; i < nSamples; i++) {
      const t = i / sampleRate;
      let s = 0;
      for (let h = 1; h <= 8; h++) {
        s += (0.4 / h) * Math.sin(2 * Math.PI * fundamental * h * t);
      }
      out[i] = s;
    }
  } else {
    for (let i = 0; i < nSamples; i++) {
      const t = i / sampleRate;
      const fChirp = 300 + 5000 * Math.pow(t / duration, 2);
      const mod = Math.sin(2 * Math.PI * 4 * t);
      out[i] =
        0.25 * Math.sin(2 * Math.PI * 440 * t) +
        0.2 * Math.sin(2 * Math.PI * 660 * t) +
        0.3 * Math.sin(2 * Math.PI * fChirp * t) * (0.5 + 0.5 * mod);
    }
  }
  return out;
}

export default function InteractiveSpectrogram({
  initialCmap = "viridis",
  initialScale = "mel",
  showWaveform = true,
}: DemoProps) {
  const specCanvasRef = useRef<HTMLCanvasElement>(null);
  const timeCanvasRef = useRef<HTMLCanvasElement>(null);
  const freqCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [cmap, setCmap] = useState<ColorMapConfig>(initialCmap);
  const [scale, setScale] = useState<FrequencyScale>(initialScale);
  const [signalType, setSignalType] = useState<"complex" | "chirp" | "harmonic">("complex");
  const [scopeInstance, setScopeInstance] = useState<Sonoscope | null>(null);

  useEffect(() => {
    if (!specCanvasRef.current || !audioRef.current) return;

    const sampleRate = 44100;
    const duration = 5.0;
    const audioData = generateSignal(signalType, sampleRate, duration);
    const wavBlob = encodeWav(audioData, sampleRate);
    const wavUrl = URL.createObjectURL(wavBlob);

    const audio = audioRef.current;
    audio.src = wavUrl;

    const scope = Sonoscope.fromArray(audioData, sampleRate, {
      frequencyScale: scale,
      audio,
      followPlayback: "page",
    });
    setScopeInstance(scope);

    const cleanups: Array<() => void> = [];

    const minFreq = scale === "log" ? 20 : 0;
    const maxFreq = Math.floor(sampleRate / 2);

    const spec = scope.createSpectrogram(specCanvasRef.current, {
      colorMap: cmap,
      minValue: -80,
      maxValue: 0,
      frequencyScale: scale,
      minFrequency: minFreq,
      maxFrequency: maxFreq,
    });
    cleanups.push(attachCanvasNavigation(spec, specCanvasRef.current));

    if (timeCanvasRef.current && timeCanvasRef.current.parentElement) {
      const timeRuler = scope.createTimeRuler(timeCanvasRef.current, {
        program: "ticks",
        tickPosition: "top",
        color: "rgba(128, 128, 128, 0.75)",
        tickColor: "rgba(128, 128, 128, 0.35)",
      });
      cleanups.push(attachCanvasNavigation(timeRuler, timeCanvasRef.current));
      const overlay = attachPlayheadOverlay(timeCanvasRef.current.parentElement, scope);
      cleanups.push(() => overlay.destroy());
    }

    if (freqCanvasRef.current) {
      const freqRuler = scope.createFrequencyRuler(freqCanvasRef.current, {
        program: "ticks",
        frequencyScale: scale,
        minFrequency: minFreq,
        maxFrequency: maxFreq,
        color: "rgba(128, 128, 128, 0.75)",
        tickColor: "rgba(128, 128, 128, 0.35)",
        tickPosition: "right",
      });
      cleanups.push(attachCanvasNavigation(freqRuler, freqCanvasRef.current));
    }

    if (waveCanvasRef.current && waveCanvasRef.current.parentElement && showWaveform) {
      const waveform = scope.createWaveform(waveCanvasRef.current, {
        colorMap: cmap,
      });
      cleanups.push(attachCanvasNavigation(waveform, waveCanvasRef.current));
      const overlay = attachPlayheadOverlay(waveCanvasRef.current.parentElement, scope);
      cleanups.push(() => overlay.destroy());
    }

    if (specCanvasRef.current.parentElement) {
      const overlay = attachPlayheadOverlay(specCanvasRef.current.parentElement, scope);
      cleanups.push(() => overlay.destroy());
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
      scope.destroy();
      URL.revokeObjectURL(wavUrl);
    };
  }, [cmap, scale, signalType, showWaveform]);

  return (
    <div
      style={{
        border: "1px solid rgba(128, 128, 128, 0.25)",
        borderRadius: "8px",
        padding: "16px",
        background: "rgba(0, 0, 0, 0.03)",
        margin: "1.5rem 0",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "14px",
          alignItems: "center",
          fontSize: "13px",
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span>Signal:</span>
          <select
            value={signalType}
            onChange={(e) => setSignalType(e.target.value as any)}
            style={{
              padding: "4px 8px",
              borderRadius: "4px",
              border: "1px solid rgba(128, 128, 128, 0.3)",
              background: "transparent",
              color: "inherit",
            }}
          >
            <option value="complex">Multi-tone + Chirp</option>
            <option value="chirp">Logarithmic Chirp (100Hz - 7kHz)</option>
            <option value="harmonic">Harmonic Series (220Hz)</option>
          </select>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span>Colormap:</span>
          <select
            value={typeof cmap === "string" ? cmap : "viridis"}
            onChange={(e) => setCmap(e.target.value as any)}
            style={{
              padding: "4px 8px",
              borderRadius: "4px",
              border: "1px solid rgba(128, 128, 128, 0.3)",
              background: "transparent",
              color: "inherit",
            }}
          >
            <option value="viridis">Viridis</option>
            <option value="plasma">Plasma</option>
            <option value="inferno">Inferno</option>
            <option value="magma">Magma</option>
            <option value="turbo">Turbo</option>
            <option value="cividis">Cividis</option>
            <option value="gray">Gray</option>
          </select>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span>Scale:</span>
          <select
            value={scale}
            onChange={(e) => setScale(e.target.value as any)}
            style={{
              padding: "4px 8px",
              borderRadius: "4px",
              border: "1px solid rgba(128, 128, 128, 0.3)",
              background: "transparent",
              color: "inherit",
            }}
          >
            <option value="mel">Mel</option>
            <option value="log">Logarithmic</option>
            <option value="linear">Linear</option>
          </select>
        </label>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "56px 1fr",
          border: "1px solid rgba(128, 128, 128, 0.25)",
          borderRadius: "4px",
          overflow: "hidden",
          background: "transparent",
        }}
      >
        <div
          style={{
            height: "24px",
            borderRight: "1px solid rgba(128, 128, 128, 0.2)",
            borderBottom: "1px solid rgba(128, 128, 128, 0.2)",
            fontSize: "10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.6,
            fontFamily: "monospace",
          }}
        >
          Hz \ s
        </div>
        <div
          style={{
            position: "relative",
            height: "24px",
            borderBottom: "1px solid rgba(128, 128, 128, 0.2)",
            cursor: "pointer",
          }}
        >
          <canvas ref={timeCanvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
        </div>

        <div
          style={{
            position: "relative",
            width: "56px",
            height: "240px",
            borderRight: "1px solid rgba(128, 128, 128, 0.2)",
          }}
        >
          <canvas ref={freqCanvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
        </div>
        <div style={{ position: "relative", height: "240px" }}>
          <canvas ref={specCanvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
        </div>

        {showWaveform && (
          <>
            <div
              style={{
                height: "60px",
                borderRight: "1px solid rgba(128, 128, 128, 0.2)",
                borderTop: "1px solid rgba(128, 128, 128, 0.2)",
                fontSize: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: 0.6,
                fontFamily: "monospace",
              }}
            >
              WAV
            </div>
            <div
              style={{
                position: "relative",
                height: "60px",
                borderTop: "1px solid rgba(128, 128, 128, 0.2)",
              }}
            >
              <canvas
                ref={waveCanvasRef}
                style={{ width: "100%", height: "100%", display: "block" }}
              />
            </div>
          </>
        )}
      </div>

      <audio
        ref={audioRef}
        controls
        style={{
          width: "100%",
          height: "36px",
          marginTop: "10px",
          outline: "none",
        }}
      />
    </div>
  );
}
