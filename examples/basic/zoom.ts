import { createViewer, fullBounds, getUrlFromPage, requiredElement, viewportStatus, type DemoViewport } from './demo-utils';

const form = requiredElement<HTMLFormElement>('form');
const input = requiredElement<HTMLInputElement>('input[name="url"]');
const follow = requiredElement<HTMLInputElement>('input[name="follow"]');
const audio = requiredElement<HTMLAudioElement>('audio');
const canvas = requiredElement<HTMLCanvasElement>('canvas');
const selection = requiredElement<HTMLDivElement>('.selection');
const status = requiredElement<HTMLElement>('[data-status]');
const reset = requiredElement<HTMLButtonElement>('button[data-action="reset"]');
const zoomIn = requiredElement<HTMLButtonElement>('button[data-action="zoom-in"]');
const zoomOut = requiredElement<HTMLButtonElement>('button[data-action="zoom-out"]');

let viewer: Awaited<ReturnType<typeof createViewer>> | undefined;
let resetViewport: DemoViewport | undefined;
let dragStart: { x: number; y: number } | undefined;

async function render() {
  if (!viewer) return;
  await viewer.render();
  status.textContent = viewportStatus(viewer);
}

async function load(url: string) {
  viewer?.destroy();
  status.textContent = 'Loading and rendering...';
  viewer = await createViewer({ audio, canvas, url, follow: follow.checked });
  resetViewport = viewer.getViewport();
  await render();
}

async function setViewport(viewport: Partial<DemoViewport>) {
  viewer?.setViewport(viewport);
  await render();
}

async function zoomTime(factor: number, centerTime?: number) {
  if (!viewer) return;
  const bounds = fullBounds(viewer);
  const viewport = viewer.getViewport();
  const center = centerTime ?? (viewport.startTime + viewport.endTime) / 2;
  const duration = (viewport.endTime - viewport.startTime) * factor;
  const startTime = Math.max(bounds.startTime, center - duration / 2);
  const endTime = Math.min(bounds.endTime, startTime + duration);
  await setViewport({ startTime: Math.max(bounds.startTime, endTime - duration), endTime });
}

function showSelection(start: { x: number; y: number }, end: { x: number; y: number }) {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  selection.style.display = 'block';
  selection.style.left = `${left}px`;
  selection.style.top = `${top}px`;
  selection.style.width = `${Math.abs(end.x - start.x)}px`;
  selection.style.height = `${Math.abs(end.y - start.y)}px`;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const url = input.value.trim();
  if (url) void load(url);
});

follow.addEventListener('change', () => viewer?.setConfig({ playback: { follow: follow.checked } }));
reset.addEventListener('click', () => resetViewport && void setViewport(resetViewport));
zoomIn.addEventListener('click', () => void zoomTime(0.5));
zoomOut.addEventListener('click', () => void zoomTime(2));

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  if (!viewer) return;
  const rect = canvas.getBoundingClientRect();
  const { time } = viewer.canvasToTimeFrequency(event.clientX - rect.left, event.clientY - rect.top);
  void zoomTime(event.deltaY < 0 ? 0.8 : 1.25, time);
});

canvas.addEventListener('pointerdown', (event) => {
  const rect = canvas.getBoundingClientRect();
  dragStart = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
  if (!dragStart) return;
  const rect = canvas.getBoundingClientRect();
  showSelection(dragStart, { x: event.clientX - rect.left, y: event.clientY - rect.top });
});

canvas.addEventListener('pointerup', (event) => {
  if (!viewer || !dragStart) return;
  const rect = canvas.getBoundingClientRect();
  const end = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  selection.style.display = 'none';
  if (Math.abs(end.x - dragStart.x) > 8 || Math.abs(end.y - dragStart.y) > 8) {
    const bounds = fullBounds(viewer);
    const a = viewer.canvasToTimeFrequency(dragStart.x, dragStart.y);
    const b = viewer.canvasToTimeFrequency(end.x, end.y);
    void setViewport({
      startTime: Math.max(bounds.startTime, Math.min(a.time, b.time)),
      endTime: Math.min(bounds.endTime, Math.max(a.time, b.time)),
      minFrequency: Math.max(bounds.minFrequency, Math.min(a.frequency, b.frequency)),
      maxFrequency: Math.min(bounds.maxFrequency, Math.max(a.frequency, b.frequency)),
    });
  }
  dragStart = undefined;
});

canvas.addEventListener('pointercancel', () => {
  dragStart = undefined;
  selection.style.display = 'none';
});

await load(getUrlFromPage(input));
