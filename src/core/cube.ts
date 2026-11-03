/**
 * A 3D colour lookup table, already in the layout the GPU wants: RGBA8, with
 * red varying fastest — the same order `.cube` files are written in.
 */
export interface Lut3D {
  size: number;
  title: string;
  data: Float32Array;
}

/** Resampling target. 33 is what every grading app ships; 17 shows banding. */
const RESAMPLE = 33;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Parses an Adobe `.cube`. Three-dimensional tables are used directly;
 * one-dimensional tables (per-channel curves) are expanded into a 3D grid so the
 * shader has exactly one path. DOMAIN_MIN/MAX are honoured by resampling
 * everything onto 0…1 rather than by special-casing the lookup.
 */
export function parseCube(text: string): Lut3D {
  let title = '滤镜';
  let size3 = 0;
  let size1 = 0;
  let domainMin = [0, 0, 0];
  let domainMax = [1, 1, 1];
  const values: number[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const upper = line.toUpperCase();

    if (upper.startsWith('TITLE')) {
      const quoted = line.match(/"([^"]*)"/);
      if (quoted?.[1]) title = quoted[1].slice(0, 40);
      continue;
    }
    if (upper.startsWith('LUT_3D_SIZE')) {
      size3 = Number(line.split(/\s+/)[1]);
      continue;
    }
    if (upper.startsWith('LUT_1D_SIZE')) {
      size1 = Number(line.split(/\s+/)[1]);
      continue;
    }
    if (upper.startsWith('DOMAIN_MIN')) {
      domainMin = line.split(/\s+/).slice(1, 4).map(Number);
      continue;
    }
    if (upper.startsWith('DOMAIN_MAX')) {
      domainMax = line.split(/\s+/).slice(1, 4).map(Number);
      continue;
    }
    if (/^[-+.\d]/.test(line)) {
      const parts = line.split(/\s+/);
      if (parts.length < 3) throw new Error(`无法识别的数据行：${line.slice(0, 40)}`);
      for (let i = 0; i < 3; i++) {
        const value = Number(parts[i]);
        if (!Number.isFinite(value)) throw new Error(`数据行里有非数字：${line.slice(0, 40)}`);
        values.push(value);
      }
    }
  }

  if (size3 > 0) {
    if (size3 < 2 || size3 > 64) throw new Error(`LUT_3D_SIZE ${size3} 超出 2–64。`);
    const expected = size3 * size3 * size3;
    if (values.length !== expected * 3) {
      throw new Error(`数据行数不符：需要 ${expected} 行，读到 ${values.length / 3} 行。`);
    }
    return build3D(title, size3, values, domainMin, domainMax);
  }

  if (size1 > 0) {
    if (size1 < 2 || size1 > 4096) throw new Error(`LUT_1D_SIZE ${size1} 超出 2–4096。`);
    if (values.length !== size1 * 3) {
      throw new Error(`数据行数不符：需要 ${size1} 行，读到 ${values.length / 3} 行。`);
    }
    return expand1D(title, size1, values, domainMin, domainMax);
  }

  throw new Error('文件里没有 LUT_3D_SIZE 或 LUT_1D_SIZE。');
}

function sampleAxis(values: number[], size: number, channel: number, t: number): number {
  const x = clamp01(t) * (size - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = values[i * 3 + channel] ?? 0;
  const b = values[Math.min(size - 1, i + 1) * 3 + channel] ?? a;
  return a + (b - a) * f;
}

function normalise(value: number, min: number, max: number): number {
  const span = max - min;
  return span === 0 ? 0 : clamp01((value - min) / span);
}

/** Reads the table at an arbitrary point of the declared domain. */
function lookup3D(
  values: number[],
  size: number,
  channel: number,
  r: number,
  g: number,
  b: number,
): number {
  const x = clamp01(r) * (size - 1);
  const y = clamp01(g) * (size - 1);
  const z = clamp01(b) * (size - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;
  const at = (ix: number, iy: number, iz: number): number => {
    const cx = Math.min(size - 1, ix);
    const cy = Math.min(size - 1, iy);
    const cz = Math.min(size - 1, iz);
    // Red varies fastest, then green, then blue.
    const index = ((cz * size + cy) * size + cx) * 3 + channel;
    return values[index] ?? 0;
  };
  const c00 = at(x0, y0, z0) * (1 - fx) + at(x0 + 1, y0, z0) * fx;
  const c10 = at(x0, y0 + 1, z0) * (1 - fx) + at(x0 + 1, y0 + 1, z0) * fx;
  const c01 = at(x0, y0, z0 + 1) * (1 - fx) + at(x0 + 1, y0, z0 + 1) * fx;
  const c11 = at(x0, y0 + 1, z0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1, z0 + 1) * fx;
  const c0 = c00 * (1 - fy) + c10 * fy;
  const c1 = c01 * (1 - fy) + c11 * fy;
  return c0 * (1 - fz) + c1 * fz;
}

function build3D(
  title: string,
  size: number,
  values: number[],
  domainMin: number[],
  domainMax: number[],
): Lut3D {
  const out = new Float32Array(RESAMPLE * RESAMPLE * RESAMPLE * 4);
  for (let b = 0; b < RESAMPLE; b++) {
    for (let g = 0; g < RESAMPLE; g++) {
      for (let r = 0; r < RESAMPLE; r++) {
        const index = ((b * RESAMPLE + g) * RESAMPLE + r) * 4;
        for (let channel = 0; channel < 3; channel++) {
          const nr = normalise(r / (RESAMPLE - 1), domainMin[0]!, domainMax[0]!);
          const ng = normalise(g / (RESAMPLE - 1), domainMin[1]!, domainMax[1]!);
          const nb = normalise(b / (RESAMPLE - 1), domainMin[2]!, domainMax[2]!);
          const value = clamp01(lookup3D(values, size, channel, nr, ng, nb));
          out[index + channel] = value;
        }
        out[index + 3] = 1;
      }
    }
  }
  return { size: RESAMPLE, title, data: out };
}

/** One-dimensional tables are per-channel curves; expand so the shader has one path. */
function expand1D(
  title: string,
  size: number,
  values: number[],
  domainMin: number[],
  domainMax: number[],
): Lut3D {
  const out = new Float32Array(RESAMPLE * RESAMPLE * RESAMPLE * 4);
  for (let b = 0; b < RESAMPLE; b++) {
    for (let g = 0; g < RESAMPLE; g++) {
      for (let r = 0; r < RESAMPLE; r++) {
        const index = ((b * RESAMPLE + g) * RESAMPLE + r) * 4;
        const rgb = [r, g, b].map((v) => v / (RESAMPLE - 1));
        for (let channel = 0; channel < 3; channel++) {
          const position = normalise(rgb[channel]!, domainMin[channel]!, domainMax[channel]!);
          out[index + channel] = clamp01(sampleAxis(values, size, channel, position));
        }
        out[index + 3] = 1;
      }
    }
  }
  return { size: RESAMPLE, title, data: out };
}

/* ── built-in filters, generated rather than shipped as binary assets ─────── */

type Transform = (r: number, g: number, b: number) => [number, number, number];

function bake(title: string, transform: Transform): Lut3D {
  const size = RESAMPLE;
  const out = new Float32Array(size * size * size * 4);
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const index = ((b * size + g) * size + r) * 4;
        const value = transform(r / (size - 1), g / (size - 1), b / (size - 1));
        for (let channel = 0; channel < 3; channel++) {
          out[index + channel] = clamp01(value[channel]!);
        }
        out[index + 3] = 1;
      }
    }
  }
  return { size, title, data: out };
}

export function builtinLuts(): Record<string, { name: string; doc: Lut3D }> {
  return {
    sepia: {
      name: '棕褐',
      doc: bake('棕褐', (r, g, b) => {
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        return [l * 1.07, l * 0.93, l * 0.72];
      }),
    },
    bleach: {
      name: '漂白',
      doc: bake('漂白', (r, g, b) => {
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const contrast = (v: number): number => 0.5 + (v - 0.5) * 1.35;
        return [contrast(l * 0.45 + r * 0.55), contrast(l * 0.45 + g * 0.55), contrast(l * 0.45 + b * 0.55)];
      }),
    },
    nightshade: {
      name: '夜幕',
      doc: bake('夜幕', (r, g, b) => {
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        return [l * 0.86 + r * 0.06, l * 0.92 + g * 0.05, l * 1.1 + b * 0.12];
      }),
    },
  };
}
