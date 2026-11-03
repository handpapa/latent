/**
 * The neutral document every pixel test starts from.
 *
 * One copy on purpose: adding a field to EditState used to mean patching five
 * spec files, and forgetting one of them produced a TypeError in the renderer
 * rather than in the test that forgot.
 */
export const NEUTRAL_EDIT = {
  adjust: {
    exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
    temperature: 0, tint: 0, vibrance: 0, saturation: 0,
  },
  curves: {
    rgb: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    r: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    g: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    b: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  },
  hsl: Array.from({ length: 8 }, () => ({ hue: 0, saturation: 0, luminance: 0 })),
  grade: {
    shadows: { hue: 0, saturation: 0 },
    midtones: { hue: 0, saturation: 0 },
    highlights: { hue: 0, saturation: 0 },
  },
  lut: { id: null, intensity: 1 },
  fx: { grain: 0, vignette: 0, clarity: 0, glow: 0, softness: 0 },
  frame: { kind: 'none', insets: { t: 0, r: 0, b: 0, l: 0 }, color: '#f3f0e9', radius: 0 },
  watermark: { kind: 'none', text: '', colour: '#ffffff', size: 0.035, anchor: 'br', offsetX: -0.03, offsetY: -0.03, opacity: 0.85, rotation: 0, tile: false, target: 'photo' },
};
