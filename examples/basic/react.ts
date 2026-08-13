import React, {
  startTransition,
  useEffect,
  useRef,
  useState,
} from "https://esm.sh/react@19.2.1";
import { createRoot } from "https://esm.sh/react-dom@19.2.1/client";
import { attachCanvasNavigation, SpectrogramViewer } from "../../src";
import type {
  BuiltInColorMap,
  FrequencyScale,
  ValueMode,
  WindowName,
} from "../../src/types";

const h = React.createElement;

const RECORDINGS = [
  [
    "https://upload.wikimedia.org/wikipedia/commons/0/01/After_You%27ve_Gone_%28Harris_1918_recording%29.wav?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original",
    "After You’ve Gone (Harris 1918 recording).wav · Wikimedia Commons · Range-enabled WAV",
  ],
  [
    "https://upload.wikimedia.org/wikipedia/commons/2/25/Same.wav",
    "Same.wav",
    "Range-enabled WAV from Wikimedia Commons",
  ],
  [
    "https://xeno-canto.org/944837/download",
    "Western Barbastelle",
    "XC944837 · Xeno-Canto",
  ],
  [
    "https://xeno-canto.org/380406/download",
    "Night Parrot",
    "XC380406 · Xeno-Canto",
  ],
] as const;

type Settings = {
  recording: number;
  frequencyScale: FrequencyScale;
  valueMode: ValueMode;
  colorMap: BuiltInColorMap;
  minDb: number;
  maxDb: number;
  windowSize: number;
  hopSize: number;
  window: WindowName;
  summonMountains: boolean;
};

const initialSettings: Settings = {
  recording: 0,
  frequencyScale: "mel",
  valueMode: "db",
  colorMap: "magma",
  minDb: -86,
  maxDb: -8,
  windowSize: 1024,
  hopSize: 128,
  window: "hann",
  summonMountains: new URLSearchParams(location.search).get("summon") === "mountains",
};

function ReactSpectrogramDemo() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<SpectrogramViewer | null>(null);
  const dragRef = useRef<{
    x: number;
    startTime: number;
    endTime: number;
  } | null>(null);
  const minimapDragRef = useRef<{
    x: number;
    startTime: number;
    span: number;
  } | null>(null);
  const [settings, setSettings] = useState(initialSettings);
  const [canvasKey, setCanvasKey] = useState(0);
  const [duration, setDuration] = useState(30);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [cacheSummary, setCacheSummary] = useState("cache: empty");
  const [viewport, setViewport] = useState({
    startTime: 0,
    endTime: 12,
    minFrequency: 20,
    maxFrequency: 12_000,
  });
  const [status, setStatus] = useState("Preparing viewer...");

  useEffect(() => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas) return;

    let cancelled = false;
    let cleanupNavigation: (() => void) | undefined;
    let unsubscribeViewport: (() => void) | undefined;
    let unsubscribeProfile: (() => void) | undefined;
    setStatus("Loading source...");
    SpectrogramViewer.fromUrl({
      audio,
      canvas,
      url: RECORDINGS[settings.recording][0],
      stft: {
        windowSize: settings.windowSize,
        fftSize: settings.windowSize,
        hopSize: settings.hopSize,
        window: settings.window,
      },
      viewportConstraints: { minDurationSeconds: 0.08, maxDurationSeconds: 20 },
      valueScale: {
        mode: settings.valueMode,
        min: settings.minDb,
        max: settings.maxDb,
        gamma: 1,
        clamp: true,
      },
      colorMap: settings.colorMap,
      renderer: settings.summonMountains ? { type: "webgl", program: "terrain" } : "auto",
      playback: { follow: true, renderOnSeek: true },
    })
      .then((viewer) => {
        if (cancelled) return;
        viewerRef.current = viewer;
        setDuration(viewer.getDuration());
        unsubscribeViewport = viewer.on("viewportchange", (event) => {
          startTransition(() => setViewport(event.viewport));
        });
        unsubscribeProfile = viewer.on("renderprofile", () => setCacheSummary(formatCacheStats(viewer.getCacheStats())));
        cleanupNavigation = attachCanvasNavigation(viewer, canvas, {
          onNavigate: () => {
            setCacheSummary(formatCacheStats(viewer.getCacheStats()));
          },
        });
        setStatus(`Drag to pan. Wheel to pan; Ctrl+wheel to zoom around the cursor. Mountains: ${settings.summonMountains ? "summoned" : "sleeping"}.`);
        setCacheSummary(formatCacheStats(viewer.getCacheStats()));
        viewer.requestRender();
        if (cancelled) unsubscribeViewport();
      })
      .catch((error) => {
        if (!cancelled)
          setStatus(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
      cleanupNavigation?.();
      unsubscribeViewport?.();
      unsubscribeProfile?.();
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [settings.recording, settings.summonMountains]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let frame: number | undefined;

    const update = () => setPlayheadTime(audio.currentTime || 0);
    const tick = () => {
      update();
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (frame === undefined) frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      update();
    };

    audio.addEventListener("play", start);
    audio.addEventListener("pause", stop);
    audio.addEventListener("seeked", update);
    audio.addEventListener("timeupdate", update);
    update();
    if (!audio.paused) start();

    return () => {
      stop();
      audio.removeEventListener("play", start);
      audio.removeEventListener("pause", stop);
      audio.removeEventListener("seeked", update);
      audio.removeEventListener("timeupdate", update);
    };
  }, [settings.recording]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.updateConfig({
      stft: {
        windowSize: settings.windowSize,
        fftSize: settings.windowSize,
        hopSize: settings.hopSize,
        window: settings.window,
      },
      viewportConstraints: { minDurationSeconds: 0.08, maxDurationSeconds: 20 },
      valueScale: {
        mode: settings.valueMode,
        min: settings.minDb,
        max: settings.maxDb,
        gamma: 1,
        clamp: true,
      },
      colorMap: settings.colorMap,
      renderer: settings.summonMountains ? { type: "webgl", program: "terrain" } : "auto",
    });
    setCacheSummary(formatCacheStats(viewer.getCacheStats()));
  }, [settings.windowSize, settings.hopSize, settings.window, settings.valueMode, settings.minDb, settings.maxDb, settings.colorMap, settings.summonMountains]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.updateViewport({ ...viewport, frequencyScale: settings.frequencyScale });
    setCacheSummary(formatCacheStats(viewer.getCacheStats()));
  }, [viewport, settings.frequencyScale]);

  function updateSettings(update: Partial<Settings>) {
    startTransition(() =>
      setSettings((current) => ({ ...current, ...update })),
    );
  }

  function setSummonMountains(summonMountains: boolean) {
    startTransition(() => {
      setSettings((current) => ({ ...current, summonMountains }));
      setCanvasKey((current) => current + 1);
    });
  }

  function updateViewport(
    update: typeof viewport | ((current: typeof viewport) => typeof viewport),
  ) {
    startTransition(() =>
      setViewport((current) =>
        clampViewport(
          typeof update === "function" ? update(current) : update,
          duration,
        ),
      ),
    );
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      x: event.clientX,
      startTime: viewport.startTime,
      endTime: viewport.endTime,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const secondsPerPixel = (drag.endTime - drag.startTime) / rect.width;
    const delta = (event.clientX - drag.x) * secondsPerPixel;
    updateViewport({
      ...viewport,
      startTime: drag.startTime - delta,
      endTime: drag.endTime - delta,
    });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  const current = RECORDINGS[settings.recording];
  return h(
    "main",
    { className: "shell" },
    h("style", null, styles),
    h(
      "section",
      { className: "hero" },
      h("a", { href: "./index.html" }, "Back to demos"),
      h("p", { className: "eyebrow" }, "React integration"),
      h("h1", null, "One component, live spectrogram controls."),
      h(
        "p",
        null,
        "React owns the form state. ",
        h("code", null, "SpectrogramViewer"),
        " owns decoding, rendering, playback sync, and tile updates.",
      ),
    ),
    h(
      "section",
      { className: "workbench" },
      h(
        "div",
        { className: "display-card" },
        h(
          "div",
          { className: "display-topline" },
          h(
            "div",
            null,
            h("strong", null, current[1]),
            h("span", null, current[2]),
          ),
          h("span", { className: "status" }, status),
        ),
        h("audio", { ref: audioRef, controls: true, crossOrigin: "anonymous" }),
        h("canvas", {
          key: canvasKey,
          ref: canvasRef,
          onPointerDown,
          onPointerMove,
          onPointerUp,
          onPointerCancel: onPointerUp,
        }),
        h(Minimap, {
          duration,
          playheadTime,
          viewport,
          dragRef: minimapDragRef,
          onViewportChange: updateViewport,
        }),
        h("div", { className: "cache-summary" }, cacheSummary),
      ),
      h(
        "aside",
        { className: "controls" },
        h(
          Control,
          { label: "Recording" },
          h(
            "select",
            {
              value: settings.recording,
              onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
                updateSettings({
                  recording: Number(event.currentTarget.value),
                }),
            },
            RECORDINGS.map((recording, index) =>
              h("option", { key: recording[0], value: index }, recording[1]),
            ),
          ),
        ),
        h(
          "div",
          { className: "control-grid" },
          h(
            Control,
            { label: "Frequency" },
            h(
              "select",
              {
                value: settings.frequencyScale,
                onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
                  updateSettings({
                    frequencyScale: event.currentTarget.value as FrequencyScale,
                  }),
              },
              option("linear"),
              option("log"),
              option("mel"),
            ),
          ),
          h(
            Control,
            { label: "Color" },
            h(
              "select",
              {
                value: settings.colorMap,
                onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
                  updateSettings({
                    colorMap: event.currentTarget.value as BuiltInColorMap,
                  }),
              },
              option("magma"),
              option("viridis"),
              option("turbo"),
              option("gray"),
            ),
          ),
          h(
            Control,
            { label: "Value" },
            h(
              "select",
              {
                value: settings.valueMode,
                onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
                  updateSettings({
                    valueMode: event.currentTarget.value as ValueMode,
                  }),
              },
              option("db"),
              option("magnitude"),
              option("power"),
            ),
          ),
          h(
            Control,
            { label: "Window" },
            h(
              "select",
              {
                value: settings.window,
                onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
                  updateSettings({
                    window: event.currentTarget.value as WindowName,
                  }),
              },
              option("hann"),
              option("hamming"),
              option("blackman"),
              option("rectangular"),
            ),
          ),
        ),
        h(Slider, {
          label: "Min dB",
          value: settings.minDb,
          min: -120,
          max: -10,
          step: 1,
          onChange: (minDb: number) => updateSettings({ minDb }),
        }),
        h(Slider, {
          label: "Max dB",
          value: settings.maxDb,
          min: -60,
          max: 12,
          step: 1,
          onChange: (maxDb: number) => updateSettings({ maxDb }),
        }),
        h(Slider, {
          label: "Window size",
          value: settings.windowSize,
          min: 256,
          max: 2048,
          step: 256,
          onChange: (windowSize: number) =>
            updateSettings({
              windowSize,
              hopSize: Math.min(settings.hopSize, windowSize / 2),
            }),
        }),
        h(Slider, {
          label: "Hop size",
          value: settings.hopSize,
          min: 32,
          max: 512,
          step: 32,
          onChange: (hopSize: number) => updateSettings({ hopSize }),
        }),
        h(Slider, {
          label: "Max frequency",
          value: viewport.maxFrequency,
          min: 1000,
          max: 24_000,
          step: 500,
          onChange: (maxFrequency: number) =>
            updateViewport((current) => ({ ...current, maxFrequency })),
        }),
        h(
          "label",
          { className: "toggle", title: "This is not a serious control." },
          h("input", {
            type: "checkbox",
            checked: settings.summonMountains,
            onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
              setSummonMountains(event.currentTarget.checked),
          }),
          h("span", null, "summon mountains"),
        ),
        h(
          "button",
          {
            type: "button",
            onClick: () =>
              updateViewport({
                startTime: 0,
                endTime: Math.min(12, duration),
                minFrequency: 20,
                maxFrequency: 12_000,
              }),
          },
          "Reset view",
        ),
      ),
    ),
  );
}

function Control(props: { label: string; children: React.ReactNode }) {
  return h("label", null, h("span", null, props.label), props.children);
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return h(
    "label",
    null,
    h("span", null, props.label, h("b", null, props.value)),
    h("input", {
      type: "range",
      min: props.min,
      max: props.max,
      step: props.step,
      value: props.value,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        props.onChange(Number(event.currentTarget.value)),
    }),
  );
}

function Minimap(props: {
  duration: number;
  playheadTime: number;
  viewport: {
    startTime: number;
    endTime: number;
    minFrequency: number;
    maxFrequency: number;
  };
  dragRef: React.MutableRefObject<{
    x: number;
    startTime: number;
    span: number;
  } | null>;
  onViewportChange: (viewport: {
    startTime: number;
    endTime: number;
    minFrequency: number;
    maxFrequency: number;
  }) => void;
}) {
  const duration = Math.max(props.duration, 0.001);
  const span = props.viewport.endTime - props.viewport.startTime;
  const left = (props.viewport.startTime / duration) * 100;
  const width = Math.min(100, (span / duration) * 100);
  const playheadLeft = Math.min(100, Math.max(0, (props.playheadTime / duration) * 100));

  function moveFromPointer(event: React.PointerEvent<HTMLDivElement>, mode: "center" | "drag") {
    const rect = event.currentTarget.getBoundingClientRect();
    const secondsPerPixel = duration / rect.width;
    if (mode === "center") {
      const centerTime = (event.clientX - rect.left) * secondsPerPixel;
      const startTime = centerTime - span / 2;
      props.dragRef.current = { x: event.clientX, startTime, span };
      props.onViewportChange({ ...props.viewport, startTime, endTime: startTime + span });
      return;
    }

    const drag = props.dragRef.current;
    if (!drag) return;
    const startTime = drag.startTime + (event.clientX - drag.x) * secondsPerPixel;
    props.onViewportChange({ ...props.viewport, startTime, endTime: startTime + drag.span });
  }

  return h(
    "div",
    { className: "minimap-block" },
    h(
      "div",
      { className: "minimap-label" },
      h("span", null, "Recording overview"),
      h("b", null, `${props.viewport.startTime.toFixed(2)}s-${props.viewport.endTime.toFixed(2)}s / ${duration.toFixed(2)}s`),
    ),
    h(
      "div",
      {
        className: "minimap",
        role: "slider",
        tabIndex: 0,
        "aria-label": "Spectrogram viewport position",
        "aria-valuemin": 0,
        "aria-valuemax": Number(duration.toFixed(2)),
        "aria-valuenow": Number(props.viewport.startTime.toFixed(2)),
        onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          moveFromPointer(event, "center");
        },
        onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => moveFromPointer(event, "drag"),
        onPointerUp: () => {
          props.dragRef.current = null;
        },
        onPointerCancel: () => {
          props.dragRef.current = null;
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const step = span * (event.shiftKey ? 1 : 0.2);
          const delta = event.key === "ArrowLeft" ? -step : step;
          props.onViewportChange({ ...props.viewport, startTime: props.viewport.startTime + delta, endTime: props.viewport.endTime + delta });
        },
      },
      h("div", { className: "minimap-wave" }, Array.from({ length: 72 }, (_, index) => h("i", { key: index, style: { height: `${24 + pseudoLevel(index) * 68}%` } }))),
      h("div", { className: "minimap-window", style: { left: `${left}%`, width: `${width}%` } }),
      h("div", { className: "minimap-playhead", style: { left: `${playheadLeft}%` } }),
    ),
  );
}

function option(value: string) {
  return h("option", { value }, value);
}

function pseudoLevel(index: number) {
  return Math.abs(Math.sin(index * 0.41) * Math.cos(index * 0.17));
}

function formatCacheStats(stats: { bytes: number; peakBytes: number; tiles: number; peakTiles: number }) {
  return `cache: ${stats.tiles} tiles / ${formatBytes(stats.bytes)} · peak ${stats.peakTiles} tiles / ${formatBytes(stats.peakBytes)}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function clampViewport(
  viewport: {
    startTime: number;
    endTime: number;
    minFrequency: number;
    maxFrequency: number;
  },
  duration: number,
) {
  const span = Math.min(
    Math.max(viewport.endTime - viewport.startTime, 0.08),
    Math.max(duration, 0.08),
  );
  const startTime = Math.min(
    Math.max(0, viewport.startTime),
    Math.max(0, duration - span),
  );
  return {
    ...viewport,
    startTime,
    endTime: startTime + span,
    minFrequency: Math.max(0, viewport.minFrequency),
    maxFrequency: Math.max(viewport.minFrequency + 10, viewport.maxFrequency),
  };
}

const styles = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: #0d0f12; color: #f4efe7; font-family: Georgia, 'Times New Roman', serif; }
  .shell { width: min(1120px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 48px; }
  .hero { display: grid; gap: 10px; max-width: 720px; margin-bottom: 22px; }
  a { color: #d7dce5; text-decoration-thickness: 1px; text-underline-offset: 4px; }
  .eyebrow { margin: 18px 0 0; color: #a9b0bd; font: 700 12px ui-monospace, monospace; letter-spacing: .22em; text-transform: uppercase; }
  h1 { margin: 0; font-size: clamp(2rem, 4vw, 3.7rem); line-height: .98; letter-spacing: -.045em; max-width: 760px; }
  p { margin: 0; max-width: 640px; color: #b9bec8; font-size: 1.05rem; line-height: 1.6; }
  code { color: #eef1f6; }
  .workbench { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 18px; align-items: start; }
  .display-card, .controls { border: 1px solid rgba(255,255,255,.13); background: #12151a; box-shadow: 0 18px 48px rgba(0,0,0,.28); }
  .display-card { padding: 14px; border-radius: 12px; }
  .display-topline { display: flex; justify-content: space-between; gap: 18px; align-items: start; padding: 8px 6px 14px; font-family: ui-monospace, monospace; }
  .display-topline strong, .display-topline span { display: block; }
  .display-topline strong { color: #f4efe7; }
  .display-topline span { color: #89919f; font-size: .82rem; margin-top: 3px; }
  .status { text-align: right; max-width: 310px; }
  audio { width: 100%; margin-bottom: 12px; opacity: .92; }
  canvas { width: 100%; height: min(52vh, 520px); min-height: 330px; display: block; border-radius: 8px; border: 1px solid rgba(255,255,255,.12); background: #050505; cursor: grab; touch-action: none; }
  canvas:active { cursor: grabbing; }
  .minimap-block { display: grid; gap: 8px; padding: 14px 4px 2px; }
  .minimap-label { display: flex; justify-content: space-between; gap: 12px; color: #89919f; font: 700 12px ui-monospace, monospace; text-transform: uppercase; letter-spacing: .12em; }
  .minimap-label b { color: #d7dce5; font-weight: 700; text-transform: none; letter-spacing: 0; }
  .minimap { position: relative; height: 54px; overflow: hidden; border: 1px solid rgba(255,255,255,.12); border-radius: 8px; background: #0d0f12; cursor: pointer; touch-action: none; }
  .minimap:focus-visible { outline: 2px solid #d7dce5; outline-offset: 3px; }
  .minimap-wave { position: absolute; inset: 8px 10px; display: flex; align-items: center; gap: 3px; opacity: .58; }
  .minimap-wave i { flex: 1; min-width: 2px; background: #7d8591; }
  .minimap-window { position: absolute; inset-block: 0; min-width: 18px; border: 2px solid #f4efe7; border-radius: 6px; background: rgba(244,239,231,.08); box-shadow: 0 0 0 999px rgba(0,0,0,.28); cursor: grab; }
  .minimap-window::before, .minimap-window::after { content: ''; position: absolute; top: 14px; bottom: 14px; width: 2px; background: rgba(244,239,231,.68); }
  .minimap-window::before { left: 8px; }
  .minimap-window::after { right: 8px; }
  .minimap-playhead { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: #f4efe7; box-shadow: 0 0 0 1px rgba(0,0,0,.45); pointer-events: none; }
  .cache-summary { padding: 6px 4px 0; color: #89919f; font: 700 12px ui-monospace, monospace; }
  .controls { display: grid; gap: 16px; padding: 18px; border-radius: 12px; position: sticky; top: 16px; }
  .control-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  label { display: grid; gap: 7px; color: #89919f; font: 700 12px ui-monospace, monospace; text-transform: uppercase; letter-spacing: .12em; }
  label span { display: flex; justify-content: space-between; gap: 10px; }
  label b { color: #d7dce5; font-weight: 700; }
  select, button { width: 100%; border: 1px solid rgba(255,255,255,.12); border-radius: 6px; background: #171a20; color: #f4efe7; padding: 10px 12px; font: 700 13px ui-monospace, monospace; }
  button { background: #e6e9ef; color: #101216; cursor: pointer; text-transform: uppercase; letter-spacing: .12em; }
  .toggle { display: flex; grid-template-columns: none; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid rgba(255,255,255,.12); border-radius: 6px; background: #171a20; color: #f4efe7; cursor: pointer; }
  .toggle span { display: block; }
  .toggle input { accent-color: #f4efe7; }
  input[type='range'] { accent-color: #d7dce5; width: 100%; }
  @media (max-width: 900px) { .workbench { grid-template-columns: 1fr; } .controls { position: static; } h1 { letter-spacing: -.05em; } }
`;

createRoot(document.getElementById("root")!).render(h(ReactSpectrogramDemo));
