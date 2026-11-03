import type { FrameLayout } from './frame';

export type Anchor = 'tl' | 't' | 'tr' | 'l' | 'c' | 'r' | 'bl' | 'b' | 'br';

export interface WatermarkParams {
  kind: 'none' | 'text' | 'image';
  text: string;
  colour: string;
  /** Height as a fraction of the photo's short edge. */
  size: number;
  anchor: Anchor;
  /** Fractions of the short edge, applied after the anchor. */
  offsetX: number;
  offsetY: number;
  opacity: number;
  /** Degrees, clockwise. */
  rotation: number;
  tile: boolean;
  /** Anchored to the photograph, or to the whole board (a caption on the mat). */
  target: 'photo' | 'frame';
}

export const NO_WATERMARK: WatermarkParams = {
  kind: 'none',
  text: '',
  colour: '#ffffff',
  size: 0.035,
  anchor: 'br',
  offsetX: -0.03,
  offsetY: -0.03,
  opacity: 0.85,
  rotation: 0,
  tile: false,
  target: 'photo',
};

export interface MarkRect {
  /** Composed-space uv rectangle. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Radians. */
  angle: number;
  tile: boolean;
}

/**
 * Places the mark. Sizes are fractions of the photo's short edge, so the same
 * numbers put the watermark in the same place on a 200px card and a 6000px
 * export — which is the only way preview and export can agree.
 */
export function markRect(
  layout: FrameLayout,
  params: WatermarkParams,
  natural: { width: number; height: number },
): MarkRect | null {
  if (params.kind === 'none' || natural.width <= 0 || natural.height <= 0) return null;

  const short = Math.min(layout.photo.w, layout.photo.h);
  const height = params.size * short;
  const width = height * (natural.width / natural.height);

  const target =
    params.target === 'frame'
      ? { x: 0, y: 0, w: layout.width, h: layout.height }
      : layout.photo;

  const margin = 0.02 * short;
  // Two-letter anchors carry both axes; one-letter anchors centre the other one.
  const a = params.anchor;
  const vertical = a === 't' || a === 'tl' || a === 'tr' ? 't' : a === 'b' || a === 'bl' || a === 'br' ? 'b' : 'c';
  const horizontal = a === 'l' || a === 'tl' || a === 'bl' ? 'l' : a === 'r' || a === 'tr' || a === 'br' ? 'r' : 'c';

  let x = target.x + margin;
  if (horizontal === 'c') x = target.x + (target.w - width) / 2;
  if (horizontal === 'r') x = target.x + target.w - width - margin;

  let y = target.y + margin;
  if (vertical === 'c') y = target.y + (target.h - height) / 2;
  if (vertical === 'b') y = target.y + target.h - height - margin;

  x += params.offsetX * short;
  y += params.offsetY * short;

  return {
    x: x / layout.width,
    y: y / layout.height,
    w: width / layout.width,
    h: height / layout.height,
    angle: (params.rotation * Math.PI) / 180,
    tile: params.tile,
  };
}

export const ANCHORS: ReadonlyArray<{ key: Anchor; label: string }> = [
  { key: 'tl', label: '左上' },
  { key: 't', label: '上' },
  { key: 'tr', label: '右上' },
  { key: 'l', label: '左' },
  { key: 'c', label: '中' },
  { key: 'r', label: '右' },
  { key: 'bl', label: '左下' },
  { key: 'b', label: '下' },
  { key: 'br', label: '右下' },
];
