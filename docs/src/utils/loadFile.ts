const allDemoFiles = import.meta.glob(
  "/src/content/docs/demos/**/*.{html,ts,tsx,css,js,json}",
  { query: "?raw", import: "default", eager: true }
) as Record<string, string>;

/**
 * Loads the raw string content of a demo file from docs/src/content/docs/demos/
 *
 * Example:
 * loadFile("spectrogram/index.html")
 */
export function loadFile(relativePath: string): string {
  const normalized = relativePath.startsWith("/")
    ? relativePath.slice(1)
    : relativePath;
  const fullPath = `/src/content/docs/demos/${normalized}`;
  const content = allDemoFiles[fullPath];

  if (content === undefined) {
    const available = Object.keys(allDemoFiles)
      .map((k) => k.replace("/src/content/docs/demos/", ""))
      .join(", ");
    throw new Error(
      `loadFile: Could not find file "${fullPath}". Available files: ${available}`
    );
  }

  return content;
}
