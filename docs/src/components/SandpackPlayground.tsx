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

export const DEFAULT_AUDIO_URL =
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
  "/sandbox.config.json": {
    code: JSON.stringify({
      infiniteLoopProtection: false,
      hardReloadOnChange: false,
    }),
    hidden: true,
  },
  "/node_modules/@sonoscope/core/package.json": {
    code: JSON.stringify({
      name: "@sonoscope/core",
      version: "0.1.0",
      type: "module",
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
      version: "0.1.0",
      type: "module",
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

const defaultCss = `* {
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
canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}
`;

function wrapHtml(htmlContent: string, customCss?: string): string {
  if (htmlContent.includes("<html") || htmlContent.includes("<!DOCTYPE")) {
    return htmlContent;
  }
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>Sonoscope Demo</title>
    <style>
${customCss || defaultCss}
    </style>
    <script>
      (function() {
        function preventBrowserZoom(e) {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
          }
        }
        window.addEventListener("wheel", preventBrowserZoom, { passive: false, capture: true });
        document.addEventListener("wheel", preventBrowserZoom, { passive: false, capture: true });
        document.addEventListener("gesturestart", function(e) { e.preventDefault(); }, { passive: false });
        document.addEventListener("gesturechange", function(e) { e.preventDefault(); }, { passive: false });
        document.addEventListener("gestureend", function(e) { e.preventDefault(); }, { passive: false });
      })();
    </script>
  </head>
  <body>
    ${htmlContent.trim()}
  </body>
</html>
`;
}

export interface SandpackPlaygroundProps {
  template?: "vanilla-ts" | "react-ts" | "vanilla" | "react";
  code?: string;
  ts?: string;
  tsx?: string;
  html?: string;
  css?: string;
  files?: Record<string, string | { code: string; active?: boolean; hidden?: boolean }>;
  activeFile?: string;
  visibleFiles?: string[];
  editorHeight?: number;
  previewHeight?: number;
  layout?: "stacked" | "side-by-side";
}

export default function SandpackPlayground({
  template,
  code,
  ts,
  tsx,
  html,
  css,
  files = {},
  activeFile,
  visibleFiles,
  editorHeight = 280,
  previewHeight = 320,
  layout = "stacked",
}: SandpackPlaygroundProps) {
  const isReact = Boolean(tsx || template === "react-ts" || template === "react");
  const resolvedTemplate = template || (isReact ? "react-ts" : "vanilla-ts");
  const baseFiles = isReact ? internalReactFiles : internalCoreFiles;

  const resolvedActiveFile = activeFile || (isReact ? "/App.tsx" : "/index.ts");
  const dynamicFiles: SandpackFiles = {};

  if (isReact) {
    dynamicFiles["/App.tsx"] = {
      code: tsx || code || "",
      active: resolvedActiveFile === "/App.tsx",
    };
    dynamicFiles["/index.tsx"] = {
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
    };
    dynamicFiles["/index.html"] = {
      code: html
        ? wrapHtml(html, css)
        : `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>React Demo</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body, #root { height: 100%; background: #100f0f; overflow: hidden; touch-action: none; -webkit-text-size-adjust: 100%; }
    </style>
    <script>
      (function() {
        function preventBrowserZoom(e) {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
          }
        }
        window.addEventListener("wheel", preventBrowserZoom, { passive: false, capture: true });
        document.addEventListener("wheel", preventBrowserZoom, { passive: false, capture: true });
        document.addEventListener("gesturestart", function(e) { e.preventDefault(); }, { passive: false });
        document.addEventListener("gesturechange", function(e) { e.preventDefault(); }, { passive: false });
        document.addEventListener("gestureend", function(e) { e.preventDefault(); }, { passive: false });
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`,
    };
  } else {
    dynamicFiles["/index.ts"] = {
      code: ts || code || "",
      active: resolvedActiveFile === "/index.ts",
    };
    dynamicFiles["/index.html"] = {
      code: wrapHtml(
        html ||
          `<div id="container">\n  <canvas id="spectrogram"></canvas>\n</div>`,
        css
      ),
    };
    dynamicFiles["/styles.css"] = {
      code: css || defaultCss,
      hidden: true,
    };
  }

  // Normalize custom files
  const normalizedCustomFiles: SandpackFiles = {};
  for (const [path, fileContent] of Object.entries(files)) {
    if (typeof fileContent === "string") {
      normalizedCustomFiles[path] = { code: fileContent };
    } else {
      normalizedCustomFiles[path] = fileContent;
    }
  }

  const mergedFiles: SandpackFiles = {
    ...baseFiles,
    ...dynamicFiles,
    ...normalizedCustomFiles,
  };

  const resolvedVisibleFiles =
    visibleFiles || [resolvedActiveFile, "/index.html"];

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
