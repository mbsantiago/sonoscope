import {
  SandpackCodeEditor,
  SandpackLayout,
  SandpackPreview,
  SandpackProvider,
  type SandpackFiles,
  type SandpackTheme,
} from "@codesandbox/sandpack-react";
import coreBundle from "../../../packages/core/dist/index.js?raw";
import reactBundle from "../../../packages/react/dist/index.js?raw";

const DEFAULT_AUDIO_URL =
  "https://upload.wikimedia.org/wikipedia/commons/c/c5/Marico_Sunbird_%28Nectarinia_mariquensis%29_%28W1CDR0000941_BD17%29.ogg?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original";

const flexokiTheme: SandpackTheme = {
  colors: {
    surface1: "#100f0f",
    surface2: "#1c1b1a",
    surface3: "#282726",
    clickable: "#b7b5ac",
    base: "#cecdc3",
    disabled: "#6f6e69",
    hover: "#fffcf0",
    accent: "#3aa99f",
    error: "#d14d41",
    errorSurface: "#261312",
  },
  syntax: {
    plain: "#cecdc3",
    comment: { color: "#878580", fontStyle: "italic" },
    keyword: "#af3029",
    definition: "#4385be",
    punctuation: "#878580",
    property: "#3aa99f",
    tag: "#205ea6",
    string: "#879a39",
    static: "#d0a215",
  },
  font: {
    body: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    size: "13px",
    lineHeight: "20px",
  },
};

const internalCoreFiles: SandpackFiles = {
  "/node_modules/@sonoscope/core/package.json": {
    code: JSON.stringify({
      name: "@sonoscope/core",
      main: "./index.js",
      module: "./index.js",
    }),
    hidden: true,
  },
  "/node_modules/@sonoscope/core/index.js": {
    code: coreBundle,
    hidden: true,
  },
};

const internalReactFiles: SandpackFiles = {
  ...internalCoreFiles,
  "/node_modules/@sonoscope/react/package.json": {
    code: JSON.stringify({
      name: "@sonoscope/react",
      main: "./index.js",
      module: "./index.js",
    }),
    hidden: true,
  },
  "/node_modules/@sonoscope/react/index.js": {
    code: reactBundle,
    hidden: true,
  },
};

const presets: Record<
  "spectrogram" | "waveform" | "rulers" | "react",
  {
    template: "vanilla-ts" | "react-ts";
    activeFile: string;
    visibleFiles: string[];
    files: SandpackFiles;
  }
> = {
  spectrogram: {
    template: "vanilla-ts",
    activeFile: "/index.ts",
    visibleFiles: ["/index.ts", "/index.html"],
    files: {
      "/index.ts": {
        code: `import { Sonoscope } from "@sonoscope/core";

async function main() {
  const canvas = document.getElementById("spectrogram") as HTMLCanvasElement;
  const audioUrl = "${DEFAULT_AUDIO_URL}";

  const scope = await Sonoscope.fromUrl(audioUrl, {
    frequencyScale: "mel",
  });

  const spec = scope.createSpectrogram(canvas, {
    colorMap: "inferno",
    minValue: -80,
    maxValue: 0,
  });

  scope.attachNavigation(canvas);
}

main();
`,
        active: true,
      },
      "/index.html": {
        code: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Spectrogram Demo</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <div id="container">
      <canvas id="spectrogram"></canvas>
    </div>
  </body>
</html>
`,
      },
      "/styles.css": {
        code: `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
html, body {
  height: 100%;
  background: #100f0f;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
#container {
  width: 100%;
  height: 100%;
}
#spectrogram {
  width: 100%;
  height: 100%;
  display: block;
}
`,
        hidden: true,
      },
    },
  },

  waveform: {
    template: "vanilla-ts",
    activeFile: "/index.ts",
    visibleFiles: ["/index.ts", "/index.html"],
    files: {
      "/index.ts": {
        code: `import { Sonoscope } from "@sonoscope/core";

async function main() {
  const canvas = document.getElementById("waveform") as HTMLCanvasElement;
  const audioUrl = "${DEFAULT_AUDIO_URL}";

  const scope = await Sonoscope.fromUrl(audioUrl);
  const wave = scope.createWaveform(canvas, {
    colorMap: "inferno",
  });

  scope.attachNavigation(canvas, { axis: "time" });
}

main();
`,
        active: true,
      },
      "/index.html": {
        code: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Waveform Demo</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <div id="container">
      <canvas id="waveform"></canvas>
    </div>
  </body>
</html>
`,
      },
      "/styles.css": {
        code: `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
html, body {
  height: 100%;
  background: #100f0f;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
#container {
  width: 100%;
  height: 100%;
}
#waveform {
  width: 100%;
  height: 100%;
  display: block;
}
`,
        hidden: true,
      },
    },
  },

  rulers: {
    template: "vanilla-ts",
    activeFile: "/index.ts",
    visibleFiles: ["/index.ts", "/index.html"],
    files: {
      "/index.ts": {
        code: `import { Sonoscope } from "@sonoscope/core";

async function main() {
  const audioUrl = "${DEFAULT_AUDIO_URL}";

  const scope = await Sonoscope.fromUrl(audioUrl, {
    frequencyScale: "mel",
  });

  const timeCanvas = document.getElementById("time-ruler") as HTMLCanvasElement;
  scope.createTimeRuler(timeCanvas, { tickPosition: "bottom" });

  const freqCanvas = document.getElementById("freq-ruler") as HTMLCanvasElement;
  scope.createFrequencyRuler(freqCanvas, { tickPosition: "right" });

  const specCanvas = document.getElementById("spectrogram") as HTMLCanvasElement;
  scope.createSpectrogram(specCanvas, { colorMap: "viridis" });

  scope.attachNavigation(specCanvas, { axis: "both" });
  scope.attachNavigation(timeCanvas, { axis: "time" });
  scope.attachNavigation(freqCanvas, { axis: "frequency" });
}

main();
`,
        active: true,
      },
      "/index.html": {
        code: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Rulers Demo</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <div class="grid">
      <div class="corner">Hz \\ s</div>
      <canvas id="time-ruler"></canvas>
      <canvas id="freq-ruler"></canvas>
      <canvas id="spectrogram"></canvas>
    </div>
  </body>
</html>
`,
      },
      "/styles.css": {
        code: `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
html, body {
  height: 100%;
  background: #100f0f;
  overflow: hidden;
}
.grid {
  display: grid;
  grid-template-columns: 56px 1fr;
  grid-template-rows: 24px 1fr;
  width: 100%;
  height: 100%;
}
.corner {
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: monospace;
  font-size: 10px;
  color: #878580;
  border-right: 1px solid rgba(128, 128, 128, 0.2);
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
}
#time-ruler {
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
}
#freq-ruler {
  border-right: 1px solid rgba(128, 128, 128, 0.2);
}
`,
        hidden: true,
      },
    },
  },

  react: {
    template: "react-ts",
    activeFile: "/App.tsx",
    visibleFiles: ["/App.tsx", "/index.html"],
    files: {
      "/App.tsx": {
        code: `import {
  FrequencyRuler,
  SonoscopeProvider,
  Spectrogram,
  TimeRuler,
  Waveform,
} from "@sonoscope/react";

const audioUrl = "${DEFAULT_AUDIO_URL}";

export default function App() {
  return (
    <div style={{ height: "100vh", background: "#100f0f", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif" }}>
      <SonoscopeProvider url={audioUrl} frequencyScale="mel" followPlayback="page">
        <div style={{ display: "grid", gridTemplateColumns: "56px 1fr", flex: 1, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: "#878580", fontFamily: "monospace", borderRight: "1px solid rgba(128, 128, 128, 0.2)", borderBottom: "1px solid rgba(128, 128, 128, 0.2)" }}>
            Hz \\ s
          </div>
          <div style={{ height: "24px", borderBottom: "1px solid rgba(128, 128, 128, 0.2)" }}>
            <TimeRuler height={24} tickPosition="top" color="rgba(128, 128, 128, 0.75)" tickColor="rgba(128, 128, 128, 0.35)" />
          </div>
          <div style={{ width: "56px", borderRight: "1px solid rgba(128, 128, 128, 0.2)" }}>
            <FrequencyRuler width={56} tickPosition="right" color="rgba(128, 128, 128, 0.75)" tickColor="rgba(128, 128, 128, 0.35)" />
          </div>
          <div style={{ position: "relative" }}>
            <Spectrogram colorMap="plasma" minValue={-80} maxValue={0} />
          </div>
        </div>
        <div style={{ height: "60px", borderTop: "1px solid rgba(128, 128, 128, 0.2)" }}>
          <Waveform height={60} colorMap="plasma" />
        </div>
      </SonoscopeProvider>
    </div>
  );
}
`,
        active: true,
      },
      "/index.tsx": {
        code: `import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const rootElement = document.getElementById("root");
const root = createRoot(rootElement!);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
`,
        hidden: true,
      },
      "/index.html": {
        code: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React Spectrogram Demo</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body, #root { height: 100%; background: #100f0f; overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`,
      },
    },
  },
};

export interface SandpackDemoProps {
  type?: "spectrogram" | "waveform" | "rulers" | "react";
  template?: "vanilla-ts" | "react-ts" | "vanilla" | "react";
  files?: SandpackFiles;
  activeFile?: string;
  visibleFiles?: string[];
  editorHeight?: number;
  previewHeight?: number;
  layout?: "stacked" | "side-by-side";
}

export default function SandpackDemo({
  type,
  template,
  files,
  activeFile,
  visibleFiles,
  editorHeight = 280,
  previewHeight = 320,
  layout = "stacked",
}: SandpackDemoProps) {
  const preset = type ? presets[type] : null;

  const resolvedTemplate = template || preset?.template || "vanilla-ts";
  const resolvedActiveFile = activeFile || preset?.activeFile || "/index.ts";
  const resolvedVisibleFiles =
    visibleFiles || preset?.visibleFiles || [resolvedActiveFile, "/index.html"];

  const baseInternalFiles =
    resolvedTemplate === "react" || resolvedTemplate === "react-ts"
      ? internalReactFiles
      : internalCoreFiles;

  const mergedFiles: SandpackFiles = {
    ...baseInternalFiles,
    ...(preset?.files || {}),
    ...(files || {}),
  };

  const isStacked = layout === "stacked";

  return (
    <div className="not-content my-6 overflow-hidden rounded border border-[var(--sl-color-hairline-light,rgba(128,128,128,0.25))] bg-[#100f0f]">
      <SandpackProvider
        template={resolvedTemplate}
        theme={flexokiTheme}
        files={mergedFiles}
        options={{
          activeFile: resolvedActiveFile,
          visibleFiles: resolvedVisibleFiles,
          autorun: true,
          autoReload: true,
        }}
      >
        <SandpackLayout
          style={{
            display: "flex",
            flexDirection: isStacked ? "column" : "row",
            height: "auto",
          }}
        >
          <SandpackCodeEditor
            showTabs={true}
            showLineNumbers={true}
            showInlineErrors={true}
            wrapContent={true}
            closableTabs={false}
            style={{
              height: editorHeight,
              minHeight: editorHeight,
              flex: isStacked ? "0 0 auto" : 1,
              borderBottom: isStacked
                ? "1px solid var(--sl-color-hairline, rgba(128, 128, 128, 0.2))"
                : "none",
              borderRight: !isStacked
                ? "1px solid var(--sl-color-hairline, rgba(128, 128, 128, 0.2))"
                : "none",
            }}
          />
          <SandpackPreview
            showRefreshButton={true}
            showOpenInCodeSandbox={false}
            style={{
              height: previewHeight,
              minHeight: previewHeight,
              flex: isStacked ? "0 0 auto" : 1,
            }}
          />
        </SandpackLayout>
      </SandpackProvider>
    </div>
  );
}
