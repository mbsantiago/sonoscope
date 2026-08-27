const allDemoFiles = import.meta.glob(
  [
    "/src/content/docs/demos/**/*.{html,ts,tsx,css,js,json}",
    "/src/content/docs/plugins/**/*.{html,ts,tsx,css,js,json}",
  ],
  { query: "?raw", import: "default", eager: true }
) as Record<string, string>;

/**
 * Loads the raw string content of a demo or plugin sandbox file.
 *
 * Example:
 * loadFile("spectrogram/index.html")
 * loadFile("plugins/halftone/index.ts")
 */
export function loadFile(relativePath: string): string {
  const normalized = relativePath.startsWith("/")
    ? relativePath.slice(1)
    : relativePath;

  let fullPath = `/src/content/docs/${normalized}`;
  if (allDemoFiles[fullPath]) {
    return allDemoFiles[fullPath];
  }

  fullPath = `/src/content/docs/demos/${normalized}`;
  if (allDemoFiles[fullPath]) {
    return allDemoFiles[fullPath];
  }

  fullPath = `/src/content/docs/plugins/${normalized}`;
  if (allDemoFiles[fullPath]) {
    return allDemoFiles[fullPath];
  }

  const available = Object.keys(allDemoFiles)
    .map((k) => k.replace("/src/content/docs/", ""))
    .join(", ");
  throw new Error(
    `loadFile: Could not find file "${relativePath}". Available files: ${available}`
  );
}
