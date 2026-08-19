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

export interface SandpackPlaygroundProps {
  files: Record<string, string | { code: string; active?: boolean; hidden?: boolean }>;
  template?: "vanilla-ts" | "react-ts" | "vanilla" | "react";
  activeFile?: string;
  visibleFiles?: string[];
  editorHeight?: number;
  previewHeight?: number;
  layout?: "stacked" | "side-by-side";
}

export default function SandpackPlayground({
  files,
  template = "vanilla-ts",
  activeFile,
  visibleFiles,
  editorHeight = 280,
  previewHeight = 320,
  layout = "stacked",
}: SandpackPlaygroundProps) {
  const isReact =
    template === "react-ts" ||
    template === "react" ||
    Boolean(files["/App.tsx"] || files["App.tsx"]);

  const baseFiles = isReact ? internalReactFiles : internalCoreFiles;

  const normalizedFiles: SandpackFiles = {};
  for (const [path, fileContent] of Object.entries(files)) {
    let normalizedPath = path.startsWith("/") ? path : `/${path}`;
    if (isReact && normalizedPath === "/index.html") {
      normalizedPath = "/public/index.html";
    }
    if (typeof fileContent === "string") {
      normalizedFiles[normalizedPath] = { code: fileContent };
    } else {
      normalizedFiles[normalizedPath] = fileContent;
    }
  }

  // Determine active file if not explicitly set
  const resolvedActiveFile =
    activeFile ||
    (normalizedFiles["/App.tsx"]
      ? "/App.tsx"
      : normalizedFiles["/index.ts"]
        ? "/index.ts"
        : Object.keys(normalizedFiles)[0] || "/index.ts");

  // Determine visible files (hide internal react index.tsx and index.html if App.tsx is the demo entry)
  const defaultVisible = Object.keys(normalizedFiles).filter((path) => {
    if (
      (path === "/index.tsx" ||
        path === "/public/index.html" ||
        path === "/index.html") &&
      normalizedFiles["/App.tsx"]
    ) {
      return false;
    }
    return true;
  });

  const resolvedVisibleFiles = visibleFiles || defaultVisible;

  const mergedFiles: SandpackFiles = {
    ...baseFiles,
    ...normalizedFiles,
  };

  const isStacked = layout === "stacked";

  return (
    <div className="not-content my-6 overflow-hidden rounded border border-[var(--sl-color-hairline-light,rgba(128,128,128,0.25))] bg-[#100f0f]">
      <SandpackProvider
        template={template}
        theme={flexokiTheme}
        files={mergedFiles}
        options={{
          activeFile: resolvedActiveFile,
          visibleFiles: resolvedVisibleFiles,
          autorun: true,
          autoReload: true,
          showConsole: true,
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
