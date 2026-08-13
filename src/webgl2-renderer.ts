import { CanvasSpectrogramRenderer, type LoadingRenderInput, type PlayheadRenderInput, type RenderInput, type SpectrogramRenderer } from './renderer';

export class WebGL2SpectrogramRenderer implements SpectrogramRenderer {
  readonly kind = 'webgl2' as const;
  private readonly fallback = new CanvasSpectrogramRenderer();

  constructor(private readonly gl: WebGL2RenderingContext) {}

  static create(canvas: HTMLCanvasElement): WebGL2SpectrogramRenderer | undefined {
    const gl = canvas.getContext('webgl2');
    return gl ? new WebGL2SpectrogramRenderer(gl) : undefined;
  }

  invalidate(): void {
    this.fallback.invalidate();
  }

  render(input: RenderInput): void {
    this.fallback.render(input);
  }

  renderPlayhead(input: PlayheadRenderInput): boolean {
    return this.fallback.renderPlayhead(input);
  }

  renderLoading(input: LoadingRenderInput): void {
    this.fallback.renderLoading(input);
  }

  destroy(): void {
    this.fallback.invalidate();
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
