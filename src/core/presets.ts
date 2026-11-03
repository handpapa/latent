import { IDENTITY, type AdjustParams } from './adjust';
import { LINEAR_CURVE, type Curve } from './curve';
import { HSL_BANDS, IDENTITY_EDIT, type EditState, type GradeZone, type HslBand } from './edit';

export interface Preset {
  id: string;
  name: string;
  /** Sections the card sets. Anything absent stays neutral when it is applied. */
  edit: Partial<EditState>;
  custom: boolean;
}

const curve = (...pairs: ReadonlyArray<readonly [number, number]>): Curve =>
  pairs.map(([x, y]) => ({ x, y }));

const band = (hue = 0, saturation = 0, luminance = 0): HslBand => ({ hue, saturation, luminance });

const zone = (hue: number, saturation: number): GradeZone => ({ hue, saturation });

const zeros: HslBand[] = HSL_BANDS.map(() => band());

const preset = (id: string, name: string, edit: Partial<EditState>): Preset => ({
  id,
  name,
  edit,
  custom: false,
});

export const BUILTIN_PRESETS: readonly Preset[] = [
  preset('original', '原图', { adjust: IDENTITY }),

  preset('crisp', '清透', {
    adjust: {
      ...IDENTITY,
      exposure: 0.1,
      contrast: 0.18,
      highlights: -0.15,
      shadows: 0.2,
      whites: 0.1,
      blacks: -0.1,
      vibrance: 0.15,
    },
    curves: {
      rgb: curve([0, 0], [0.3, 0.31], [0.72, 0.75], [1, 1]),
      r: LINEAR_CURVE,
      g: LINEAR_CURVE,
      b: LINEAR_CURVE,
    },
  }),

  preset('rich', '浓郁', {
    adjust: {
      ...IDENTITY,
      contrast: 0.3,
      shadows: -0.1,
      blacks: -0.2,
      vibrance: 0.25,
      saturation: 0.2,
    },
    grade: { shadows: zone(215, 0.1), midtones: zone(0, 0), highlights: zone(35, 0.08) },
  }),

  preset('soft', '柔和', {
    fx: { ...IDENTITY_EDIT.fx, softness: 0.22 },
    adjust: {
      ...IDENTITY,
      contrast: -0.25,
      highlights: -0.2,
      blacks: 0.22,
      temperature: 0.08,
      vibrance: 0.1,
    },
  }),

  preset('faded', '褪色', {
    adjust: {
      ...IDENTITY,
      contrast: -0.3,
      highlights: -0.1,
      blacks: 0.35,
      saturation: -0.25,
    },
    curves: {
      rgb: curve([0, 0.07], [0.35, 0.37], [0.75, 0.78], [1, 0.97]),
      r: LINEAR_CURVE,
      g: LINEAR_CURVE,
      b: curve([0, 0.04], [1, 0.98]),
    },
  }),

  preset('punch', '硬调', {
    fx: { ...IDENTITY_EDIT.fx, clarity: 0.3 },
    adjust: {
      ...IDENTITY,
      contrast: 0.45,
      whites: 0.15,
      blacks: -0.25,
      saturation: 0.1,
    },
    curves: {
      rgb: curve([0, 0], [0.28, 0.24], [0.72, 0.78], [1, 1]),
      r: LINEAR_CURVE,
      g: LINEAR_CURVE,
      b: LINEAR_CURVE,
    },
  }),

  preset('airy', '明亮', {
    adjust: {
      ...IDENTITY,
      exposure: 0.35,
      contrast: -0.1,
      shadows: 0.25,
      vibrance: 0.12,
    },
  }),

  preset('moody', '暗调', {
    adjust: {
      ...IDENTITY,
      exposure: -0.25,
      shadows: -0.15,
      blacks: -0.2,
      temperature: -0.12,
      vibrance: 0.15,
    },
    grade: { shadows: zone(215, 0.12), midtones: zone(0, 0), highlights: zone(0, 0) },
  }),

  preset('dusk', '暖夕', {
    fx: { ...IDENTITY_EDIT.fx, glow: 0.18 },
    adjust: {
      ...IDENTITY,
      exposure: 0.08,
      highlights: -0.1,
      temperature: 0.32,
      vibrance: 0.18,
    },
    grade: { shadows: zone(240, 0.06), midtones: zone(0, 0), highlights: zone(38, 0.18) },
  }),

  preset('night', '冷夜', {
    adjust: {
      ...IDENTITY,
      exposure: -0.15,
      contrast: 0.12,
      shadows: 0.15,
      temperature: -0.3,
      tint: -0.05,
    },
    grade: { shadows: zone(210, 0.14), midtones: zone(0, 0), highlights: zone(190, 0.05) },
  }),

  preset('mono', '黑白', { adjust: { ...IDENTITY, saturation: -1 } }),

  preset('mono-hard', '高反差黑白', {
    adjust: { ...IDENTITY, saturation: -1, contrast: 0.35, whites: 0.1, blacks: -0.15 },
    curves: {
      rgb: curve([0, 0], [0.25, 0.18], [0.75, 0.84], [1, 1]),
      r: LINEAR_CURVE,
      g: LINEAR_CURVE,
      b: LINEAR_CURVE,
    },
  }),

  // The two looks the ten sliders could not reach on their own.
  preset('film', '胶片', {
    adjust: {
      ...IDENTITY,
      exposure: 0.03,
      contrast: -0.06,
      highlights: -0.14,
      shadows: 0.1,
      blacks: 0.16,
      temperature: 0.07,
      vibrance: 0.06,
      saturation: -0.1,
    },
    curves: {
      rgb: curve([0, 0.07], [0.25, 0.28], [0.7, 0.74], [1, 0.96]),
      r: LINEAR_CURVE,
      g: curve([0, 0.01], [1, 0.99]),
      b: curve([0, 0.05], [0.5, 0.5], [1, 0.93]),
    },
    hsl: [band(), band(0, 0.12, 0.02), band(), band(), band(0, -0.12), band(0, 0.05), ...zeros.slice(6)],
    grade: { shadows: zone(150, 0.1), midtones: zone(0, 0), highlights: zone(45, 0.06) },
    fx: { ...IDENTITY_EDIT.fx, grain: 0.32, vignette: 0.18, softness: 0.06 },
  }),

  preset('teal-orange', '青橙', {
    adjust: {
      ...IDENTITY,
      contrast: 0.2,
      shadows: -0.05,
      temperature: 0.04,
      vibrance: 0.1,
    },
    curves: {
      rgb: curve([0, 0], [0.3, 0.28], [0.72, 0.75], [1, 1]),
      r: LINEAR_CURVE,
      g: LINEAR_CURVE,
      b: LINEAR_CURVE,
    },
    grade: { shadows: zone(192, 0.32), midtones: zone(0, 0), highlights: zone(32, 0.26) },
  }),
];

/** The full state a card stands for: its own sections, neutral everywhere else. */
export function presetEdit(preset: Preset): EditState {
  return {
    adjust: preset.edit.adjust ? { ...IDENTITY, ...preset.edit.adjust } : IDENTITY,
    curves: preset.edit.curves ?? IDENTITY_EDIT.curves,
    hsl: preset.edit.hsl ?? IDENTITY_EDIT.hsl,
    grade: preset.edit.grade ?? IDENTITY_EDIT.grade,
    // Filters are session-scoped assets, so a card never carries one.
    lut: IDENTITY_EDIT.lut,
    fx: preset.edit.fx ?? IDENTITY_EDIT.fx,
    frame: IDENTITY_EDIT.frame,
    watermark: IDENTITY_EDIT.watermark,
  };
}

/* ── storage and the .json format ─────────────────────────────────────────── */

const STORAGE_KEY = 'latent.presets.v2';
const PARAM_KEYS = [
  'exposure',
  'contrast',
  'highlights',
  'shadows',
  'whites',
  'blacks',
  'temperature',
  'tint',
  'vibrance',
  'saturation',
] as const;

export function loadCustom(): Preset[] {
  try {
    return parsePresets(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function saveCustom(presets: readonly Preset[]): void {
  localStorage.setItem(STORAGE_KEY, serializePresets(presets.filter((p) => p.custom)));
}

export function serializePresets(presets: readonly Preset[]): string {
  return JSON.stringify(
    {
      version: 2,
      presets: presets.map((p) => ({ name: p.name, edit: serialiseEdit(p.edit) })),
    },
    null,
    2,
  );
}

/** Only known keys are written, whatever else may have attached itself in memory. */
function serialiseEdit(edit: Partial<EditState>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (edit.adjust) {
    out.adjust = Object.fromEntries(PARAM_KEYS.map((key) => [key, (edit.adjust as AdjustParams)[key]]));
  }
  if (edit.curves) {
    out.curves = Object.fromEntries(
      (['rgb', 'r', 'g', 'b'] as const).map((key) => [key, edit.curves![key].map((p) => ({ x: p.x, y: p.y }))]),
    );
  }
  if (edit.hsl) {
    out.hsl = edit.hsl.map((b) => ({ hue: b.hue, saturation: b.saturation, luminance: b.luminance }));
  }
  if (edit.fx) {
    out.fx = {
      grain: edit.fx.grain,
      vignette: edit.fx.vignette,
      clarity: edit.fx.clarity,
      glow: edit.fx.glow,
      softness: edit.fx.softness,
    };
  }
  if (edit.grade) {
    out.grade = Object.fromEntries(
      (['shadows', 'midtones', 'highlights'] as const).map((key) => [
        key,
        { hue: edit.grade![key].hue, saturation: edit.grade![key].saturation },
      ]),
    );
  }
  return out;
}

/** Validates instead of trusting: an imported file is untrusted input, and a
 *  NaN in a uniform is an invisible black frame. */
export function parsePresets(json: string): Preset[] {
  const raw: unknown = JSON.parse(json);
  if (typeof raw !== 'object' || raw === null) throw new Error('不是有效的色卡文件');
  const list = (raw as { presets?: unknown }).presets;
  if (!Array.isArray(list)) throw new Error('缺少 presets 字段');

  return list.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) throw new Error(`第 ${index + 1} 条色卡格式错误`);
    const name = (entry as { name?: unknown }).name;
    if (typeof name !== 'string' || !name.trim() || name.length > 24) {
      throw new Error(`第 ${index + 1} 条色卡的名字无效`);
    }
    const edit = parseEdit((entry as { edit?: unknown }).edit, index);
    return { id: `custom-${index}-${name.trim()}`, name: name.trim(), edit, custom: true };
  });
}

function parseEdit(raw: unknown, index: number): Partial<EditState> {
  if (raw === undefined || raw === null) return { adjust: IDENTITY };
  if (typeof raw !== 'object') throw new Error(`第 ${index + 1} 条色卡的参数无效`);
  const source = raw as Record<string, unknown>;
  const edit: Partial<EditState> = {};

  if (source.adjust !== undefined) {
    const params = source.adjust;
    if (typeof params !== 'object' || params === null) throw new Error(`第 ${index + 1} 条色卡缺少调整参数`);
    const values = {} as AdjustParams;
    for (const key of PARAM_KEYS) {
      const value = (params as Record<string, unknown>)[key];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`第 ${index + 1} 条色卡的「${key}」不是数字`);
      }
      values[key] = clamp(value, -2, 2);
    }
    edit.adjust = values;
  }

  if (source.curves !== undefined) {
    const rawCurves = source.curves as Record<string, unknown>;
    if (typeof rawCurves !== 'object' || rawCurves === null) throw new Error(`第 ${index + 1} 条色卡的曲线无效`);
    edit.curves = {
      rgb: parseCurve(rawCurves.rgb, index),
      r: parseCurve(rawCurves.r, index),
      g: parseCurve(rawCurves.g, index),
      b: parseCurve(rawCurves.b, index),
    };
  }

  if (source.hsl !== undefined) {
    if (!Array.isArray(source.hsl) || source.hsl.length !== 8) {
      throw new Error(`第 ${index + 1} 条色卡需要 8 个 HSL 色带`);
    }
    edit.hsl = source.hsl.map((entry) => {
      const item = entry as Record<string, unknown>;
      return {
        hue: clamp(number(item.hue, index), -1, 1),
        saturation: clamp(number(item.saturation, index), -1, 1),
        luminance: clamp(number(item.luminance, index), -1, 1),
      };
    });
  }

  if (source.fx !== undefined) {
    const fx = source.fx as Record<string, unknown>;
    edit.fx = {
      grain: clamp(number(fx?.grain ?? 0, index), 0, 1),
      vignette: clamp(number(fx?.vignette ?? 0, index), -1, 1),
      clarity: clamp(number(fx?.clarity ?? 0, index), 0, 1),
      glow: clamp(number(fx?.glow ?? 0, index), 0, 1),
      softness: clamp(number(fx?.softness ?? 0, index), 0, 1),
    };
  }

  if (source.grade !== undefined) {
    const zones = source.grade as Record<string, unknown>;
    const read = (key: string): GradeZone => {
      const zone = zones[key] as Record<string, unknown>;
      return {
        hue: clamp(number(zone?.hue, index), 0, 360),
        saturation: clamp(number(zone?.saturation, index), 0, 1),
      };
    };
    edit.grade = { shadows: read('shadows'), midtones: read('midtones'), highlights: read('highlights') };
  }

  return edit;
}

function parseCurve(raw: unknown, index: number): Curve {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 16) {
    throw new Error(`第 ${index + 1} 条色卡的曲线点数无效`);
  }
  const points = raw
    .map((entry) => {
      const point = entry as Record<string, unknown>;
      return { x: clamp(number(point?.x, index), 0, 1), y: clamp(number(point?.y, index), 0, 1) };
    })
    .sort((a, b) => a.x - b.x);
  points[0] = { x: 0, y: points[0]!.y };
  points[points.length - 1] = { x: 1, y: points[points.length - 1]!.y };
  return points;
}

function number(value: unknown, index: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`第 ${index + 1} 条色卡里有非数字参数`);
  }
  return value;
}

const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);
