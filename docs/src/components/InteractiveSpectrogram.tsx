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
import { DEFAULT_AUDIO_URL } from "../constants";

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
            followPlayback: "page",
          });
        } catch (err) {
          // If remote URL fails (e.g. offline/network), try local fallback
          if (audioUrl.startsWith("http")) {
            const fallbackUrl = `${import.meta.env.BASE_URL}audio/marico-sunbird.ogg`;
            audio.src = fallbackUrl;
            scope = await Sonoscope.fromUrl(fallbackUrl, {
              audio,
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
        scope.setViewport({ minFrequency: minFreq, maxFrequency: maxFreq });

        const spec = scope.createSpectrogram(specCanvasRef.current, {
          colorMap: cmap,
          minDb: -80,
          maxDb: 0,
          frequencyScale: scale,
        });
        specRef.current = spec;
        cleanups.push(scope.attachNavigation(specCanvasRef.current));

        if (timeCanvasRef.current && timeCanvasRef.current.parentElement) {
          const timeRuler = scope.createTimeRuler(timeCanvasRef.current, {
            program: "ticks",
            tickPosition: "top",
            color: "rgba(128, 128, 128, 0.75)",
            tickColor: "rgba(128, 128, 128, 0.35)",
          });
          timeRulerRef.current = timeRuler;
          cleanups.push(
            scope.attachNavigation(timeCanvasRef.current, { axis: "time" }),
          );
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
            color: "rgba(128, 128, 128, 0.75)",
            tickColor: "rgba(128, 128, 128, 0.35)",
            tickPosition: "right",
          });
          freqRulerRef.current = freqRuler;
          cleanups.push(
            scope.attachNavigation(freqCanvasRef.current, {
              axis: "frequency",
            }),
          );
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
          cleanups.push(
            scope.attachNavigation(waveCanvasRef.current, { axis: "time" }),
          );
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

  // 2. Colormap change
  useEffect(() => {
    specRef.current?.updateConfig({ colorMap: cmap });
    waveformRef.current?.updateConfig({ colorMap: cmap });
  }, [cmap]);

  // 3. Frequency Scale change
  useEffect(() => {
    scopeRef.current?.setViewport({
      minFrequency: scale === "log" ? 20 : 0,
    });
    specRef.current?.updateConfig({ frequencyScale: scale });
    freqRulerRef.current?.updateConfig({ frequencyScale: scale });
  }, [scale]);

  return (
    <div className="not-content my-4 font-sans">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-xs leading-none">
        <div className="flex flex-wrap items-center gap-4">
          <div className="inline-flex items-center gap-2">
            <span className="text-xs font-medium opacity-85">Colormap:</span>
            <select
              value={typeof cmap === "string" ? cmap : "viridis"}
              onChange={(e) => setCmap(e.target.value as any)}
              className="h-7 cursor-pointer appearance-none rounded border py-0.5 pr-6 pl-2 text-xs font-medium text-inherit outline-none"
            >
              <option value="viridis" className="bg-zinc-900 text-white">
                Viridis
              </option>
              <option value="plasma" className="bg-zinc-900 text-white">
                Plasma
              </option>
              <option value="inferno" className="bg-zinc-900 text-white">
                Inferno
              </option>
              <option value="magma" className="bg-zinc-900 text-white">
                Magma
              </option>
              <option value="turbo" className="bg-zinc-900 text-white">
                Turbo
              </option>
              <option value="cividis" className="bg-zinc-900 text-white">
                Cividis
              </option>
              <option value="gray" className="bg-zinc-900 text-white">
                Gray
              </option>
            </select>
          </div>

          <div className="inline-flex items-center gap-2">
            <span className="text-xs font-medium opacity-85">Scale:</span>
            <select
              value={scale}
              onChange={(e) => setScale(e.target.value as any)}
              className="h-7 cursor-pointer appearance-none rounded border border-[var(--sl-color-hairline-light,rgba(128,128,128,0.3))] bg-[var(--sl-color-gray-6,rgba(128,128,128,0.08))] bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27currentColor%27%20stroke-width=%272%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3e%3cpolyline%20points=%276%209%2012%2015%2018%209%27%3e%3c/polyline%3e%3c/svg%3e')] bg-[length:12px] bg-[right_6px_center] bg-no-repeat py-0.5 pr-6 pl-2 text-xs font-medium text-inherit outline-none"
            >
              <option value="mel" className="bg-zinc-900 text-white">
                Mel
              </option>
              <option value="log" className="bg-zinc-900 text-white">
                Logarithmic
              </option>
              <option value="linear" className="bg-zinc-900 text-white">
                Linear
              </option>
            </select>
          </div>
        </div>

        <div className="inline-flex items-center gap-1 text-xs opacity-70">
          Himalayan Rubythroat · <em>Calliope pectoralis</em> · Cedric Mroczko, XC1145817. Accessible at <a href="https://www.xeno-canto.org/1145817">www.xeno-canto.org/1145817</a>
        </div>
      </div>

      {error ? (
        <div className="rounded bg-red-500/10 p-4 text-sm text-red-500">
          Error loading audio: {error}
        </div>
      ) : (
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded bg-black/20 text-sm font-medium backdrop-blur-xs">
              Loading & decoding audio...
            </div>
          )}

          <div className="grid grid-cols-[56px_1fr] overflow-hidden bg-transparent">
            <div className="flex h-6 items-center justify-center font-mono text-[10px] opacity-60">
              Hz \ s
            </div>
            <div className="relative h-6 cursor-pointer">
              <canvas
                ref={timeCanvasRef}
                className="block h-full w-full"
              />
            </div>

            <div className="relative h-70">
              <canvas
                ref={freqCanvasRef}
                className="block h-full w-full"
              />
            </div>
            <div className="relative h-70">
              <canvas
                ref={specCanvasRef}
                className="block h-full w-full"
              />
            </div>

            {showWaveform && (
              <>
                <div className="flex h-18 items-center justify-center font-mono text-[10px] opacity-60">
                  WAV
                </div>
                <div className="relative h-18 cursor-pointer">
                  <canvas
                    ref={waveCanvasRef}
                    className="block h-full w-full"
                  />
                </div>
              </>
            )}
          </div>

          <audio
            ref={audioRef}
            controls
            className="mt-3 h-9 w-full outline-none"
          />
        </div>
      )}
    </div>
  );
}
