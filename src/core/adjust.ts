/**
 * The adjustment stack. Every value is 0 at identity, every value is applied in
 * linear light, and the order is fixed in the shader (linear.frag) — white
 * balance, exposure, tone, contrast, vibrance, saturation. Adding a control here
 * without adding it there is a no-op, so the two lists are kept in step.
 */
export interface AdjustParams {
  exposure: number; // EV
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  temperature: number;
  tint: number;
  vibrance: number;
  saturation: number;
}

export const IDENTITY: AdjustParams = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,
};

export interface Control {
  key: keyof AdjustParams;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Exposure reads in stops; every other control reads as −100…100. */
  format: (value: number) => string;
}

const signed = (value: number, digits = 0): string => {
  const rounded = digits === 0 ? Math.round(value) : Number(value.toFixed(digits));
  if (rounded === 0) return '0';
  return `${rounded > 0 ? '+' : ''}${rounded}`;
};

export const LIGHT_CONTROLS: readonly Control[] = [
  { key: 'exposure', label: '曝光', min: -2, max: 2, step: 0.01, format: (v) => `${signed(v, 2)} EV` },
  { key: 'contrast', label: '对比', min: -1, max: 1, step: 0.01, format: (v) => signed(v * 100) },
  { key: 'highlights', label: '高光', min: -1, max: 1, step: 0.01, format: (v) => signed(v * 100) },
  { key: 'shadows', label: '阴影', min: -1, max: 1, step: 0.01, format: (v) => signed(v * 100) },
  { key: 'whites', label: '白色', min: -1, max: 1, step: 0.01, format: (v) => signed(v * 100) },
  { key: 'blacks', label: '黑色', min: -1, max: 1, step: 0.01, format: (v) => signed(v * 100) },
];

export const COLOR_CONTROLS: readonly Control[] = [
  { key: 'temperature', label: '色温', min: -1, max: 1, step: 0.01, format: (v) => signed(v * 100) },
  { key: 'tint', label: '色调', min: -1, max: 1, step: 0.01, format: (v) => signed(v * 100) },
  { key: 'vibrance', label: '鲜艳度', min: -1, max: 1, step: 0.01, format: (v) => signed(v * 100) },
  { key: 'saturation', label: '饱和度', min: -1, max: 1, step: 0.01, format: (v) => signed(v * 100) },
];

export const ALL_CONTROLS: readonly Control[] = [...LIGHT_CONTROLS, ...COLOR_CONTROLS];

/**
 * Copies exactly the ten parameters. Never spread a params object: GSAP writes
 * a `_gsap` cache onto any object it tweens, and a spread carries that cache —
 * with its back-reference — into the document, where JSON.stringify then dies on
 * a circular structure.
 */
export function copyParams(source: AdjustParams): AdjustParams {
  return {
    exposure: source.exposure,
    contrast: source.contrast,
    highlights: source.highlights,
    shadows: source.shadows,
    whites: source.whites,
    blacks: source.blacks,
    temperature: source.temperature,
    tint: source.tint,
    vibrance: source.vibrance,
    saturation: source.saturation,
  };
}

export function isIdentity(params: AdjustParams): boolean {
  return ALL_CONTROLS.every((c) => params[c.key] === IDENTITY[c.key]);
}
