import { IDENTITY, copyParams, type AdjustParams } from './adjust';
import { IDENTITY_CURVES, type Curve, type Curves } from './curve';
import { NO_FRAME, type FrameParams } from './frame';
import { NO_WATERMARK, type WatermarkParams } from './watermark';

/** The eight bands the HSL panel works in, at the hues a photographer names. */
export const HSL_BANDS = [
  { name: '红', hue: 0 },
  { name: '橙', hue: 30 },
  { name: '黄', hue: 60 },
  { name: '绿', hue: 120 },
  { name: '青', hue: 180 },
  { name: '蓝', hue: 240 },
  { name: '紫', hue: 280 },
  { name: '品红', hue: 320 },
] as const;

export interface HslBand {
  hue: number;
  saturation: number;
  luminance: number;
}

/** Hue in degrees; saturation 0…1. Zero saturation is the identity. */
export interface GradeZone {
  hue: number;
  saturation: number;
}

export interface Grade {
  shadows: GradeZone;
  midtones: GradeZone;
  highlights: GradeZone;
}

/** A filter is a reference plus a strength; the table itself never enters the
 *  document, so undo snapshots stay kilobytes. */
export interface LutRef {
  id: string | null;
  intensity: number;
}

export interface FxParams {
  grain: number;
  vignette: number;
  clarity: number;
  glow: number;
  softness: number;
}

export interface EditState {
  adjust: AdjustParams;
  curves: Curves;
  hsl: readonly HslBand[];
  grade: Grade;
  lut: LutRef;
  fx: FxParams;
  frame: FrameParams;
  watermark: WatermarkParams;
}

const NEUTRAL_BAND: HslBand = { hue: 0, saturation: 0, luminance: 0 };
const NEUTRAL_ZONE: GradeZone = { hue: 0, saturation: 0 };

export const IDENTITY_EDIT: EditState = {
  adjust: IDENTITY,
  curves: IDENTITY_CURVES,
  hsl: HSL_BANDS.map(() => NEUTRAL_BAND),
  grade: { shadows: NEUTRAL_ZONE, midtones: NEUTRAL_ZONE, highlights: NEUTRAL_ZONE },
  lut: { id: null, intensity: 1 },
  fx: { grain: 0, vignette: 0, clarity: 0, glow: 0, softness: 0 },
  frame: NO_FRAME,
  watermark: NO_WATERMARK,
};

/** Structural copy — never a spread, which would carry GSAP's `_gsap` cache. */
export function copyEdit(edit: EditState): EditState {
  return {
    adjust: copyParams(edit.adjust),
    curves: {
      rgb: edit.curves.rgb.map((p) => ({ ...p })),
      r: edit.curves.r.map((p) => ({ ...p })),
      g: edit.curves.g.map((p) => ({ ...p })),
      b: edit.curves.b.map((p) => ({ ...p })),
    },
    hsl: edit.hsl.map((band) => ({ ...band })),
    grade: {
      shadows: { ...edit.grade.shadows },
      midtones: { ...edit.grade.midtones },
      highlights: { ...edit.grade.highlights },
    },
    lut: { ...edit.lut },
    fx: { ...edit.fx },
    frame: { ...edit.frame, insets: { ...edit.frame.insets }, blur: { ...edit.frame.blur } },
    watermark: { ...edit.watermark },
  };
}

export function isIdentityEdit(edit: EditState): boolean {
  const adjust = Object.values(edit.adjust).every((v) => v === 0);
  const hsl = edit.hsl.every((b) => b.hue === 0 && b.saturation === 0 && b.luminance === 0);
  const grade = [edit.grade.shadows, edit.grade.midtones, edit.grade.highlights].every(
    (z) => z.saturation === 0,
  );
  const curves = (['rgb', 'r', 'g', 'b'] as const).every((key) =>
    edit.curves[key].every((p) => p.x === p.y),
  );
  const lut = edit.lut.id === null;
  const fx =
    edit.fx.grain === 0 &&
    edit.fx.vignette === 0 &&
    edit.fx.clarity === 0 &&
    edit.fx.glow === 0 &&
    edit.fx.softness === 0;
  const frame = edit.frame.kind === 'none';
  const watermark = edit.watermark.kind === 'none';
  return adjust && hsl && grade && curves && lut && fx && frame && watermark;
}

/** Pulls a curve toward the diagonal: strength 0 lands all points on y = x. */
function scaleCurve(curve: Curve, t: number): Curve {
  return curve.map((p) => ({ x: p.x, y: p.x + (p.y - p.x) * t }));
}

/**
 * Strength applied to a whole edit. Adjustments, bands and grade scale
 * arithmetically; curves are pulled toward the diagonal, which keeps the shape
 * the user drew while making 0 an exact identity.
 */
export function applyStrength(edit: EditState, t: number): EditState {
  const mix = (v: number): number => v * t;
  return {
    adjust: {
      exposure: mix(edit.adjust.exposure),
      contrast: mix(edit.adjust.contrast),
      highlights: mix(edit.adjust.highlights),
      shadows: mix(edit.adjust.shadows),
      whites: mix(edit.adjust.whites),
      blacks: mix(edit.adjust.blacks),
      temperature: mix(edit.adjust.temperature),
      tint: mix(edit.adjust.tint),
      vibrance: mix(edit.adjust.vibrance),
      saturation: mix(edit.adjust.saturation),
    },
    curves: {
      rgb: scaleCurve(edit.curves.rgb, t),
      r: scaleCurve(edit.curves.r, t),
      g: scaleCurve(edit.curves.g, t),
      b: scaleCurve(edit.curves.b, t),
    },
    hsl: edit.hsl.map((band) => ({
      hue: mix(band.hue),
      saturation: mix(band.saturation),
      luminance: mix(band.luminance),
    })),
    grade: {
      shadows: { hue: edit.grade.shadows.hue, saturation: mix(edit.grade.shadows.saturation) },
      midtones: { hue: edit.grade.midtones.hue, saturation: mix(edit.grade.midtones.saturation) },
      highlights: { hue: edit.grade.highlights.hue, saturation: mix(edit.grade.highlights.saturation) },
    },
    lut: { id: edit.lut.id, intensity: mix(edit.lut.intensity) },
    watermark: {
      ...edit.watermark,
      opacity: mix(edit.watermark.opacity),
    },
    frame: {
      ...edit.frame,
      insets: {
        t: mix(edit.frame.insets.t),
        r: mix(edit.frame.insets.r),
        b: mix(edit.frame.insets.b),
        l: mix(edit.frame.insets.l),
      },
    },
    fx: {
      grain: mix(edit.fx.grain),
      vignette: mix(edit.fx.vignette),
      clarity: mix(edit.fx.clarity),
      glow: mix(edit.fx.glow),
      softness: mix(edit.fx.softness),
    },
  };
}

/** Hue in 0…1 (divide degrees by 360). Used for swatches and grade offsets. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s <= 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 0.5) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
}
