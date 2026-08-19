const demoFiles = import.meta.glob(
  "/src/content/docs/demos/**/*.{html,ts,tsx,css,js,json}",
  { query: "?raw", import: "default", eager: true }
) as Record<string, string>;

/**
 * Loads all demo files from docs/src/content/docs/demos/<demoName>/
 * returning a virtual file map formatted for Sandpack (e.g. { "/index.html": "...", "/index.ts": "..." }).
 */
export function getDemoFiles(demoName: string): Record<string, string> {
  const prefix = `/src/content/docs/demos/${demoName}/`;
  const result: Record<string, string> = {};

  for (const [path, content] of Object.entries(demoFiles)) {
    if (path.startsWith(prefix)) {
      const filename = "/" + path.slice(prefix.length);
      result[filename] = content;
    }
  }

  return result;
}
