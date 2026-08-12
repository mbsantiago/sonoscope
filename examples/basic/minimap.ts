import { createViewer, getUrlFromPage, requiredElement, viewportStatus } from './demo-utils';
import { WorkerComputeBackend, type PerformanceMeasure, type SpectrogramViewer, type TileState } from '../../src';

const form = requiredElement<HTMLFormElement>('form');
const input = requiredElement<HTMLInputElement>('input[name="url"]');
const audio = requiredElement<HTMLAudioElement>('audio');
const canvas = requiredElement<HTMLCanvasElement>('canvas');
const status = requiredElement<HTMLElement>('[data-status]');
const tilesElement = requiredElement<HTMLDivElement>('.minimap-tiles');
const viewportElement = requiredElement<HTMLDivElement>('.minimap-viewport');

let viewer: SpectrogramViewer | undefined;
let minimapFrame: number | undefined;
let renderTimer: ReturnType<typeof setTimeout> | undefined;
let lastPaintSummary = 'paint passes: none yet';
const wheelZoomStep = 0.02;

async function load(url: string): Promise<void> {
  cancelScheduledWork();
  viewer?.destroy();
  status.textContent = 'Loading and rendering...';
  viewer = await createViewer({ audio, canvas, url, follow: true, backend: new WorkerComputeBackend(), cache: { tileDurationSeconds: 1, maxCachedTiles: 96, prefetchTiles: 16 } });
  viewer.on('tileload', scheduleMinimapUpdate);
  viewer.on('renderprogress', scheduleMinimapUpdate);
  viewer.on('rendercomplete', scheduleMinimapUpdate);
  viewer.on('renderprofile', (event) => {
    lastPaintSummary = summarizePaints(event.measures);
    scheduleMinimapUpdate();
  });
  viewer.on('viewportchange', scheduleMinimapUpdate);
  updateMinimap();
  await viewer.render();
  updateMinimap();
}

function scheduleMinimapUpdate(): void {
  if (minimapFrame !== undefined) return;
  minimapFrame = requestAnimationFrame(() => {
    minimapFrame = undefined;
    updateMinimap();
  });
}

function scheduleRender(): void {
  if (!viewer) return;
  if (renderTimer !== undefined) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    renderTimer = undefined;
    void viewer?.render();
  }, 80);
}

function updateMinimap(): void {
  if (!viewer) return;
  const source = viewer.getConfig().source;
  if (!source) return;

  tilesElement.replaceChildren(...viewer.getTileStates().map((tile) => tileSegment(tile.state, (tile.timeStart / source.duration) * 100, ((tile.timeEnd - tile.timeStart) / source.duration) * 100)));

  const viewport = viewer.getViewport();
  viewportElement.style.left = `${(viewport.startTime / source.duration) * 100}%`;
  viewportElement.style.width = `${((viewport.endTime - viewport.startTime) / source.duration) * 100}%`;
  status.textContent = `${viewportStatus(viewer)}\n${summarizeStates(viewer)}\n${lastPaintSummary}`;
}

function tileSegment(state: TileState, left: number, width: number): HTMLDivElement {
  const element = document.createElement('div');
  element.className = `minimap-tile ${state}`;
  element.style.left = `${left}%`;
  element.style.width = `${width}%`;
  return element;
}

function summarizeStates(target: SpectrogramViewer): string {
  const counts = { computed: 0, computing: 0, uncomputed: 0 };
  for (const tile of target.getTileStates()) counts[tile.state] += 1;
  return `tiles: ${counts.computed} computed, ${counts.computing} computing, ${counts.uncomputed} uncomputed`;
}

function summarizePaints(measures: PerformanceMeasure[]): string {
  const count = measures.findLast((measure) => measure.name === 'render.paint.count')?.detail?.count ?? 0;
  const finals = measures.filter((measure) => measure.name === 'render.paint.final').map((measure) => `${measure.detail?.tiles}/${measure.detail?.total}`);
  return `paint passes: ${count}; final [${finals.join(', ') || 'none'}]`;
}

function panTime(delta: number): void {
  if (!viewer) return;
  const source = viewer.getConfig().source;
  if (!source) return;
  const viewport = viewer.getViewport();
  const duration = viewport.endTime - viewport.startTime;
  const startTime = clamp(viewport.startTime + delta, 0, Math.max(0, source.duration - duration));
  viewer.setViewport({ startTime, endTime: startTime + duration });
  scheduleRender();
}

function zoomTimeAt(centerTime: number, factor: number): void {
  if (!viewer) return;
  const source = viewer.getConfig().source;
  if (!source) return;
  const { minDuration, maxDuration } = viewportDurationLimits(viewer);
  const viewport = viewer.getViewport();
  const currentDuration = viewport.endTime - viewport.startTime;
  const duration = clamp(currentDuration * factor, minDuration, maxDuration);
  const ratio = (centerTime - viewport.startTime) / currentDuration;
  const startTime = clamp(centerTime - duration * ratio, 0, Math.max(0, source.duration - duration));
  viewer.setViewport({ startTime, endTime: startTime + duration });
  scheduleRender();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function viewportDurationLimits(target: SpectrogramViewer): { minDuration: number; maxDuration: number } {
  const { tileDurationSeconds, maxCachedTiles } = target.getConfig().cache;
  const source = target.getConfig().source;
  const channels = target.getConfig().source?.channelCount ?? 1;
  const visibleTileBudget = Math.max(1, Math.floor(maxCachedTiles / Math.max(1, channels * 4)));
  const cachedDuration = (maxCachedTiles / Math.max(1, channels)) * tileDurationSeconds;
  const minDuration = Math.max(tileDurationSeconds, tileDurationSeconds * visibleTileBudget * 0.25);
  const maxDuration = Math.max(minDuration, Math.min(source?.duration ?? minDuration, cachedDuration));
  return { minDuration, maxDuration };
}

function cancelScheduledWork(): void {
  if (minimapFrame !== undefined) cancelAnimationFrame(minimapFrame);
  if (renderTimer !== undefined) clearTimeout(renderTimer);
  minimapFrame = undefined;
  renderTimer = undefined;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const url = input.value.trim();
  if (url) void load(url);
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  if (!viewer) return;
  const viewport = viewer.getViewport();
  if (event.shiftKey) {
    const rect = canvas.getBoundingClientRect();
    const { time } = viewer.canvasToTimeFrequency(event.clientX - rect.left, event.clientY - rect.top);
    zoomTimeAt(time, Math.exp((event.deltaY < 0 ? -1 : 1) * wheelZoomStep));
    return;
  }
  panTime((event.deltaY / 600) * (viewport.endTime - viewport.startTime));
});

await load(getUrlFromPage(input));
