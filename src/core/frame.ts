/**
 * A frame changes the size of the picture. That is the whole design decision:
 * insets are part of the output, not an overlay on top of it, so the export,
 * the watermark anchor and the preview all measure the same rectangle.
 */

export interface FrameInsets {
  t: number;
  r: number;
  b: number;
  l: number;
}

export interface FrameParams {
  kind: 'none' | 'mat';
  /** Fraction of the photo's SHORT edge. Uneven insets are the point (Polaroid). */
  insets: FrameInsets;
  color: string;
  /** Fraction of the short edge. */
  radius: number;
}

export const NO_FRAME: FrameParams = {
  kind: 'none',
  insets: { t: 0, r: 0, b: 0, l: 0 },
  color: '#f3f0e9',
  radius: 0,
};

export interface FrameLayout {
  width: number;
  height: number;
  photo: { x: number; y: number; w: number; h: number };
  /** Corner radius in the same units as width/height. */
  radius: number;
  /** Every inset as a fraction of the composed size — what the shader wants. */
  fractions: FrameInsets;
}

const ZERO: FrameInsets = { t: 0, r: 0, b: 0, l: 0 };

export function frameLayout(photoW: number, photoH: number, frame: FrameParams): FrameLayout {
  if (frame.kind === 'none') {
    return {
      width: photoW,
      height: photoH,
      photo: { x: 0, y: 0, w: photoW, h: photoH },
      radius: 0,
      fractions: ZERO,
    };
  }
  const short = Math.min(photoW, photoH);
  const l = frame.insets.l * short;
  const r = frame.insets.r * short;
  const t = frame.insets.t * short;
  const b = frame.insets.b * short;
  const width = photoW + l + r;
  const height = photoH + t + b;
  return {
    width,
    height,
    photo: { x: l, y: t, w: photoW, h: photoH },
    radius: frame.radius * short,
    fractions: { l: l / width, t: t / height, r: r / width, b: b / height },
  };
}

export function isFramed(frame: FrameParams): boolean {
  return frame.kind !== 'none' && frame.insets.l + frame.insets.t + frame.insets.r + frame.insets.b > 0;
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const int = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(int)) return [1, 1, 1];
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}
