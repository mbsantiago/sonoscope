import { createViewer, getUrlFromPage, requiredElement, viewportStatus } from './demo-utils';
import type { SpectrogramViewer, TileState } from '../../src';

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
  viewer = await createViewer({ audio, canvas, url, follow: true });
  viewer.on('tileload', updateMinimap);
  viewer.on('renderprogress', updateMinimap);
  viewer.on('rendercomplete', updateMinimap);
  viewer.on('viewportchange', updateMinimap);
  await viewer.render();
  updateMinimap();
  startMinimapLoop();
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

await load(getUrlFromPage(input));
