import type { NavigableViewer, ViewportConfig } from "../types";

export function setViewerViewport(
  viewer: NavigableViewer,
  viewport: Partial<ViewportConfig>,
): ViewportConfig {
  viewer.setViewport(viewport);
  viewer.requestRender();
  return viewer.getViewport() as ViewportConfig;
}
