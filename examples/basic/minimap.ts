import { createViewer, getUrlFromPage, requiredElement, viewportStatus } from './demo-utils';
import { WorkerComputeBackend, type SpectrogramViewer, type TileState } from '../../src';

const form = requiredElement<HTMLFormElement>('form');
const input = requiredElement<HTMLInputElement>('input[name="url"]');
const audio = requiredElement<HTMLAudioElement>('audio');
const canvas = requiredElement<HTMLCanvasElement>('canvas');
const status = requiredElement<HTMLElement>('[data-status]');
const tilesElement = requiredElement<HTMLDivElement>('.minimap-tiles');
const viewportElement = requiredElement<HTMLDivElement>('.minimap-viewport');

let viewer: SpectrogramViewer | undefined;
let animationFrame: number | undefined;

async function load(url: string): Promise<void> {
  stopMinimapLoop();
  viewer?.destroy();
  status.textContent = 'Loading and rendering...';
  viewer = await createViewer({ audio, canvas, url, follow: true, backend: new WorkerComputeBackend(), cache: { tileDurationSeconds: 1, maxCachedTiles: 96, prefetchTiles: 24 } });
  viewer.on('tileload', updateMinimap);
  viewer.on('renderprogress', updateMinimap);
  viewer.on('rendercomplete', updateMinimap);
  viewer.on('viewportchange', updateMinimap);
  updateMinimap();
  startMinimapLoop();
  await viewer.render();
  updateMinimap();
}

function updateMinimap(): void {
  if (!viewer) return;
  const source = viewer.getConfig().source;
  if (!source) return;

  tilesElement.replaceChildren(...viewer.getTileStates().map((tile) => tileSegment(tile.state, (tile.timeStart / source.duration) * 100, ((tile.timeEnd - tile.timeStart) / source.duration) * 100)));

  const viewport = viewer.getViewport();
  viewportElement.style.left = `${(viewport.startTime / source.duration) * 100}%`;
  viewportElement.style.width = `${((viewport.endTime - viewport.startTime) / source.duration) * 100}%`;
  status.textContent = `${viewportStatus(viewer)}\n${summarizeStates(viewer)}`;
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

function panTime(delta: number): void {
  if (!viewer) return;
  const source = viewer.getConfig().source;
  if (!source) return;
  const viewport = viewer.getViewport();
  const duration = viewport.endTime - viewport.startTime;
  const startTime = clamp(viewport.startTime + delta, 0, Math.max(0, source.duration - duration));
  viewer.setViewport({ startTime, endTime: startTime + duration });
  void viewer.render();
}

function zoomTimeAt(centerTime: number, factor: number): void {
  if (!viewer) return;
  const source = viewer.getConfig().source;
  if (!source) return;
  const viewport = viewer.getViewport();
  const currentDuration = viewport.endTime - viewport.startTime;
  const duration = clamp(currentDuration * factor, 0.05, source.duration);
  const ratio = (centerTime - viewport.startTime) / currentDuration;
  const startTime = clamp(centerTime - duration * ratio, 0, Math.max(0, source.duration - duration));
  viewer.setViewport({ startTime, endTime: startTime + duration });
  void viewer.render();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function startMinimapLoop(): void {
  const tick = () => {
    updateMinimap();
    animationFrame = requestAnimationFrame(tick);
  };
  animationFrame = requestAnimationFrame(tick);
}

function stopMinimapLoop(): void {
  if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
  animationFrame = undefined;
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
    zoomTimeAt(time, event.deltaY < 0 ? 0.8 : 1.25);
    return;
  }
  panTime((event.deltaY / 600) * (viewport.endTime - viewport.startTime));
});

await load(getUrlFromPage(input));
