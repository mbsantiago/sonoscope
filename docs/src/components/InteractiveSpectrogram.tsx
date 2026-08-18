import {
  type ColorMapConfig,
  type FrequencyRulerViewer,
  type FrequencyScale,
  Sonoscope,
  type SpectrogramViewer,
  type TimeRulerViewer,
  type WaveformViewer,
  attachPlayheadOverlay,
} from "@sonoscope/core";
import { useEffect, useRef, useState } from "react";

export const DEFAULT_AUDIO_URL =
  "https://upload.wikimedia.org/wikipedia/commons/c/c5/Marico_Sunbird_%28Nectarinia_mariquensis%29_%28W1CDR0000941_BD17%29.ogg?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original";

export interface DemoProps {
  audioUrl?: string;
  initialCmap?: "viridis" | "plasma" | "inferno" | "magma" | "cividis" | "turbo" | "gray";
  initialScale?: FrequencyScale;
  showWaveform?: boolean;
}

export default function InteractiveSpectrogram({
  audioUrl = DEFAULT_AUDIO_URL,
  initialCmap = "viridis",
  initialScale = "mel",
  showWaveform = true,
}: DemoProps) {
  const specCanvasRef = useRef<HTMLCanvasElement>(null);
  const timeCanvasRef = useRef<HTMLCanvasElement>(null);
  const freqCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // References to long-lived viewer instances
  const scopeRef = useRef<Sonoscope | null>(null);
  const specRef = useRef<SpectrogramViewer | null>(null);
  const waveformRef = useRef<WaveformViewer | null>(null);
  const freqRulerRef = useRef<FrequencyRulerViewer | null>(null);
  const timeRulerRef = useRef<TimeRulerViewer | null>(null);

  const [cmap, setCmap] = useState<ColorMapConfig>(initialCmap);
  const [scale, setScale] = useState<FrequencyScale>(initialScale);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Core audio loading and viewer instantiation (ONLY runs on audioUrl / layout change)
  useEffect(() => {
    let active = true;
    const cleanups: Array<() => void> = [];

    async function init() {
      if (!specCanvasRef.current || !audioRef.current) return;
      setLoading(true);
      setError(null);

      try {
        const audio = audioRef.current;
        audio.crossOrigin = "anonymous";
        audio.src = audioUrl;

        let scope: Sonoscope;
        try {
          scope = await Sonoscope.fromUrl(audioUrl, {
            audio,
            frequencyScale: scale,
            followPlayback: "page",
          });
        } catch (err) {
          // If remote URL fails (e.g. offline/network), try local fallback
          if (audioUrl.startsWith("http")) {
            const fallbackUrl = "/audio/marico-sunbird.ogg";
            audio.src = fallbackUrl;
            scope = await Sonoscope.fromUrl(fallbackUrl, {
              audio,
              frequencyScale: scale,
              followPlayback: "page",
            });
          } else {
            throw err;
          }
        }

        if (!active) {
          scope.destroy();
          return;
        }

        scopeRef.current = scope;

        const minFreq = scale === "log" ? 20 : 0;
        const maxFreq = Math.floor(scope.getSampleRate() / 2);

        const spec = scope.createSpectrogram(specCanvasRef.current, {
          colorMap: cmap,
          minValue: -80,
          maxValue: 0,
          frequencyScale: scale,
          minFrequency: minFreq,
          maxFrequency: maxFreq,
        });
        specRef.current = spec;
        cleanups.push(spec.attachNavigation());

        if (timeCanvasRef.current && timeCanvasRef.current.parentElement) {
          const timeRuler = scope.createTimeRuler(timeCanvasRef.current, {
            program: "ticks",
            tickPosition: "top",
            color: "rgba(128, 128, 128, 0.75)",
            tickColor: "rgba(128, 128, 128, 0.35)",
          });
          timeRulerRef.current = timeRuler;
          cleanups.push(timeRuler.attachNavigation());
          const overlay = attachPlayheadOverlay(
            timeCanvasRef.current.parentElement,
            scope,
          );
          cleanups.push(() => overlay.destroy());

          const onTimeClick = (e: MouseEvent) => {
            if (!timeCanvasRef.current) return;
            const rect = timeCanvasRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            scope.seek(timeRuler.canvasToTime(x));
          };
          timeCanvasRef.current.addEventListener("click", onTimeClick);
          cleanups.push(() =>
            timeCanvasRef.current?.removeEventListener("click", onTimeClick),
          );
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
          freqRulerRef.current = freqRuler;
          cleanups.push(freqRuler.attachNavigation());
        }

        if (
          waveCanvasRef.current &&
          waveCanvasRef.current.parentElement &&
          showWaveform
        ) {
          const waveform = scope.createWaveform(waveCanvasRef.current, {
            colorMap: cmap,
          });
          waveformRef.current = waveform;
          cleanups.push(waveform.attachNavigation());
          const overlay = attachPlayheadOverlay(
            waveCanvasRef.current.parentElement,
            scope,
          );
          cleanups.push(() => overlay.destroy());

          const onWaveClick = (e: MouseEvent) => {
            if (!waveCanvasRef.current) return;
            const rect = waveCanvasRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            scope.seek(waveform.canvasToTime(x));
          };
          waveCanvasRef.current.addEventListener("click", onWaveClick);
          cleanups.push(() =>
            waveCanvasRef.current?.removeEventListener("click", onWaveClick),
          );
        }

        if (specCanvasRef.current.parentElement) {
          const overlay = attachPlayheadOverlay(
            specCanvasRef.current.parentElement,
            scope,
          );
          cleanups.push(() => overlay.destroy());

          const onSpecDblClick = (e: MouseEvent) => {
            if (!specCanvasRef.current) return;
            const rect = specCanvasRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const { time } = spec.canvasToTimeFrequency(x, y);
            scope.seek(time);
          };
          specCanvasRef.current.addEventListener("dblclick", onSpecDblClick);
          cleanups.push(() =>
            specCanvasRef.current?.removeEventListener(
              "dblclick",
              onSpecDblClick,
            ),
          );
        }

        cleanups.push(() => {
          specRef.current = null;
          waveformRef.current = null;
          freqRulerRef.current = null;
          timeRulerRef.current = null;
          scope.destroy();
          scopeRef.current = null;
        });
        setLoading(false);
      } catch (err: any) {
        if (active) {
          setError(err?.message || "Failed to load audio");
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      active = false;
      for (const cleanup of cleanups) cleanup();
    };
  }, [audioUrl, showWaveform]);

  // 2. Colormap change (Instantly swaps WebGL shader texture without re-decoding or recomputing STFT)
  useEffect(() => {
    specRef.current?.updateConfig({ colorMap: cmap });
    waveformRef.current?.updateConfig({ colorMap: cmap });
  }, [cmap]);

  // 3. Frequency Scale change (Instantly updates projection and rulers without re-decoding)
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    const minFreq = scale === "log" ? 20 : 0;
    const maxFreq = Math.floor(scope.getSampleRate() / 2);

    scope.setViewport({ frequencyScale: scale, minFrequency: minFreq, maxFrequency: maxFreq });
    specRef.current?.updateConfig({ frequencyScale: scale, minFrequency: minFreq, maxFrequency: maxFreq });
    freqRulerRef.current?.updateConfig({ frequencyScale: scale, minFrequency: minFreq, maxFrequency: maxFreq });
  }, [scale]);

  return (
    <div
      className="not-content"
      style={{
        border: "1px solid rgba(128, 128, 128, 0.25)",
        borderRadius: "8px",
        padding: "16px",
        background: "rgba(0, 0, 0, 0.03)",
        margin: "0.75rem 0 2rem 0",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          marginBottom: "20px",
          fontSize: "13px",
          lineHeight: 1,
          margin: "0 0 20px 0",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "16px",
            alignItems: "center",
            margin: 0,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              margin: 0,
            }}
          >
            <span style={{ fontWeight: 500, opacity: 0.85, fontSize: "12px" }}>
              Colormap:
            </span>
            <select
              value={typeof cmap === "string" ? cmap : "viridis"}
              onChange={(e) => setCmap(e.target.value as any)}
              style={{
                height: "28px",
                padding: "2px 24px 2px 8px",
                borderRadius: "4px",
                border: "1px solid rgba(128, 128, 128, 0.3)",
                background: "rgba(128, 128, 128, 0.08)",
                color: "inherit",
                fontSize: "12px",
                fontWeight: 500,
                outline: "none",
                cursor: "pointer",
                appearance: "none",
                WebkitAppearance: "none",
                backgroundImage:
                  "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 6px center",
                backgroundSize: "12px",
              }}
            >
              <option value="viridis" style={{ background: "#18181b", color: "#fff" }}>
                Viridis
              </option>
              <option value="plasma" style={{ background: "#18181b", color: "#fff" }}>
                Plasma
              </option>
              <option value="inferno" style={{ background: "#18181b", color: "#fff" }}>
                Inferno
              </option>
              <option value="magma" style={{ background: "#18181b", color: "#fff" }}>
                Magma
              </option>
              <option value="turbo" style={{ background: "#18181b", color: "#fff" }}>
                Turbo
              </option>
              <option value="cividis" style={{ background: "#18181b", color: "#fff" }}>
                Cividis
              </option>
              <option value="gray" style={{ background: "#18181b", color: "#fff" }}>
                Gray
              </option>
            </select>
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              margin: 0,
            }}
          >
            <span style={{ fontWeight: 500, opacity: 0.85, fontSize: "12px" }}>
              Scale:
            </span>
            <select
              value={scale}
              onChange={(e) => setScale(e.target.value as any)}
              style={{
                height: "28px",
                padding: "2px 24px 2px 8px",
                borderRadius: "4px",
                border: "1px solid rgba(128, 128, 128, 0.3)",
                background: "rgba(128, 128, 128, 0.08)",
                color: "inherit",
                fontSize: "12px",
                fontWeight: 500,
                outline: "none",
                cursor: "pointer",
                appearance: "none",
                WebkitAppearance: "none",
                backgroundImage:
                  "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 6px center",
                backgroundSize: "12px",
              }}
            >
              <option value="mel" style={{ background: "#18181b", color: "#fff" }}>
                Mel (Perceptual)
              </option>
              <option value="log" style={{ background: "#18181b", color: "#fff" }}>
                Logarithmic
              </option>
              <option value="linear" style={{ background: "#18181b", color: "#fff" }}>
                Linear
              </option>
            </select>
          </div>
        </div>

        <div
          style={{
            fontSize: "12px",
            opacity: 0.7,
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          🎵 Marico Sunbird (<em>Nectarinia mariquensis</em>)
        </div>
      </div>

      {error ? (
        <div
          style={{
            padding: "1rem",
            color: "#ef4444",
            background: "rgba(239, 68, 68, 0.1)",
            borderRadius: "4px",
            fontSize: "14px",
          }}
        >
          Error loading audio: {error}
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          {loading && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0, 0, 0, 0.2)",
                backdropFilter: "blur(2px)",
                zIndex: 20,
                borderRadius: "4px",
                fontSize: "14px",
                fontWeight: 500,
              }}
            >
              Loading & decoding audio...
            </div>
          )}

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
              <canvas
                ref={timeCanvasRef}
                style={{ width: "100%", height: "100%", display: "block" }}
              />
            </div>

            <div
              style={{
                position: "relative",
                width: "56px",
                height: "280px",
                borderRight: "1px solid rgba(128, 128, 128, 0.2)",
              }}
            >
              <canvas
                ref={freqCanvasRef}
                style={{ width: "100%", height: "100%", display: "block" }}
              />
            </div>
            <div style={{ position: "relative", height: "280px" }}>
              <canvas
                ref={specCanvasRef}
                style={{ width: "100%", height: "100%", display: "block" }}
              />
            </div>

            {showWaveform && (
              <>
                <div
                  style={{
                    height: "70px",
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
                    height: "70px",
                    borderTop: "1px solid rgba(128, 128, 128, 0.2)",
                    cursor: "pointer",
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
              marginTop: "12px",
              outline: "none",
            }}
          />
        </div>
      )}
    </div>
  );
}
