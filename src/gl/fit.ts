export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FitResult extends Rect {
  /** Device pixels per image pixel. */
  scale: number;
}

/** Contain fit, centred, never magnifying past 1 image px per device px.
 *  Rounding the rect keeps the sampling 1:1 at 100% — a fractional rect
 *  resamples every texel and the identity check fails for the wrong reason. */
export function fitRect(
  srcW: number,
  srcH: number,
  cw: number,
  ch: number,
  gutter = 0,
): FitResult {
  if (srcW <= 0 || srcH <= 0 || cw <= 0 || ch <= 0) {
    return { x: 0, y: 0, w: 0, h: 0, scale: 1 };
  }
  // A photograph jammed against the window edge reads as a missing margin, and
  // the stage's own tone then does the job of a border it should not need.
  const availW = Math.max(1, cw - gutter * 2);
  const availH = Math.max(1, ch - gutter * 2);
  const scale = Math.min(availW / srcW, availH / srcH, 1);
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  return { x: Math.round((cw - w) / 2), y: Math.round((ch - h) / 2), w, h, scale };
}
