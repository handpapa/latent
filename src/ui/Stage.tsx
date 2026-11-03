import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lut3D } from '../core/cube';
import type { Raster } from './rasterText';
import type { EditState } from '../core/edit';
import { presetEdit, type Preset } from '../core/presets';
import { createContext } from '../gl/gl';
import { WebGLRenderer } from '../gl/renderer';
import { registerRenderer } from '../dev/hook';
import { bindRender, invalidate } from '../motion/ticker';

/** The shortcut is written for the platform the window is on, and the whole
 *  clause is hidden where there is no keyboard to press it on. */
const OPEN_SHORTCUT = /Mac|iPad|iPhone/.test(navigator.userAgent) ? '⌘O' : 'Ctrl+O';
const THUMB_WIDTH = 176;
const THUMB_HEIGHT = 132;
const thumbScratch = document.createElement('canvas');

export interface OpenedImage {
  bitmap: ImageBitmap;
  name: string;
}

interface StageProps {
  source: OpenedImage | null;
  onFile: (file: File) => void;
  onPick: () => void;
  /** Fires once the context is up: the bar reports CPU rasterisation for good. */
  onSoftware?: (software: boolean) => void;
  edit: EditState;
  presets: readonly Preset[];
  onThumbnails: (urls: Record<string, string>) => void;
  lutId: string | null;
  lut: Lut3D | null;
  watermark: Raster | null;
  onRenderer?: (renderer: WebGLRenderer | null) => void;
}

export function Stage({ source, onFile, onPick, onSoftware, edit, presets, onThumbnails, lutId, lut, watermark, onRenderer }: StageProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  // One context, one renderer. WebGL contexts are per-canvas, so a StrictMode
  // remount gets the same context back and only the objects are rebuilt.
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer(createContext(canvas), canvas);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    rendererRef.current = renderer;
    registerRenderer(renderer);
    onRenderer?.(renderer);
    onSoftware?.(renderer.caps.software);

    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const box = host.getBoundingClientRect();
      const w = Math.max(1, Math.round(box.width * dpr));
      const h = Math.max(1, Math.round(box.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      renderer.setGutter(24 * dpr);
      invalidate();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    const unbind = bindRender(() => renderer.render());

    return () => {
      ro.disconnect();
      unbind();
      registerRenderer(null);
      onRenderer?.(null);
      rendererRef.current = null;
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !source) return;
    try {
      renderer.setSource(source.bitmap);
      invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [source]);

  useEffect(() => {
    rendererRef.current?.setEdit(edit);
    invalidate();
  }, [edit]);

  useEffect(() => {
    rendererRef.current?.setLut(lutId, lut);
    invalidate();
  }, [lutId, lut]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setWatermark(
      watermark ? watermark.canvas : null,
      watermark ? { width: watermark.width, height: watermark.height } : null,
    );
    invalidate();
  }, [watermark]);

  // Each colour card shows the user's own photograph, not a stock strip: the
  // grid renders the file under every preset, once per photo.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !source) {
      onThumbnails({});
      return;
    }
    const images = renderer.thumbnails(
      presets.map((preset) => presetEdit(preset)),
      THUMB_WIDTH,
      THUMB_HEIGHT,
    );
    const urls: Record<string, string> = {};
    const context = thumbScratch.getContext('2d');
    images.forEach((image, index) => {
      const preset = presets[index];
      if (!preset || !context) return;
      thumbScratch.width = image.width;
      thumbScratch.height = image.height;
      context.putImageData(image, 0, 0);
      urls[preset.id] = thumbScratch.toDataURL('image/png');
    });
    onThumbnails(urls);
    invalidate();
  }, [presets, source, onThumbnails]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div
      ref={hostRef}
      className="stage"
      data-drag={drag}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
    >
      <canvas ref={canvasRef} className="stage__canvas" aria-label="照片预览" />

      {error ? (
        <div className="stage__error" role="alert">
          {error}
        </div>
      ) : null}

      {!source && !error ? (
        <div className="board">
          {/* The empty state is the product's own output: a mount board at 3:2 with
              the photo slot in it and the caption band where a watermark will sit. */}
          <div className="board__mat">
            <div className="board__slot">
              <h1 className="board__title">放进一张照片</h1>
              <p className="board__line">界面不着色，颜色留给照片。</p>
              <button type="button" className="btn" onClick={onPick}>
                打开照片
              </button>
            </div>
            <p className="board__caption">
              JPEG · PNG · WebP<span className="board__shortcut"> · 按 {OPEN_SHORTCUT} 打开</span> · 或直接粘贴
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
