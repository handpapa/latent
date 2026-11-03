export interface CurvePoint {
  x: number;
  y: number;
}

/** Sorted by x, first point at x=0, last at x=1. */
export type Curve = readonly CurvePoint[];

export interface Curves {
  rgb: Curve;
  r: Curve;
  g: Curve;
  b: Curve;
}

export const LINEAR_CURVE: Curve = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

export const IDENTITY_CURVES: Curves = {
  rgb: LINEAR_CURVE,
  r: LINEAR_CURVE,
  g: LINEAR_CURVE,
  b: LINEAR_CURVE,
};

export const CURVE_LUT_SIZE = 256;

export function isLinearCurve(curve: Curve): boolean {
  return curve.length === 2 && curve.every((p, i) => p.x === i && p.y === i);
}

export function curvesAreLinear(curves: Curves): boolean {
  return isLinearCurve(curves.rgb) && isLinearCurve(curves.r) && isLinearCurve(curves.g) && isLinearCurve(curves.b);
}

/**
 * Monotone cubic (Fritsch–Carlson). A plain Catmull-Rom overshoots between
 * close control points, which on a tone curve shows up as a bright halo the
 * user never drew.
 */
function tangents(points: Curve): number[] {
  const n = points.length;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1]!.x - points[i]!.x;
    slopes.push(dx === 0 ? 0 : (points[i + 1]!.y - points[i]!.y) / dx);
  }
  const m: number[] = new Array(n);
  m[0] = slopes[0] ?? 0;
  m[n - 1] = slopes[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i++) m[i] = (slopes[i - 1]! + slopes[i]!) / 2;

  for (let i = 0; i < n - 1; i++) {
    const d = slopes[i]!;
    if (d === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const alpha = m[i]! / d;
    const beta = m[i + 1]! / d;
    const magnitude = alpha * alpha + beta * beta;
    if (magnitude > 9) {
      const tau = 3 / Math.sqrt(magnitude);
      m[i] = tau * alpha * d;
      m[i + 1] = tau * beta * d;
    }
  }
  return m;
}

export function sampleCurve(points: Curve, x: number, precomputed?: number[]): number {
  if (points.length === 0) return x;
  if (x <= points[0]!.x) return points[0]!.y;
  const last = points[points.length - 1]!;
  if (x >= last.x) return last.y;
  const m = precomputed ?? tangents(points);

  let i = 0;
  while (i < points.length - 2 && x > points[i + 1]!.x) i++;

  const p0 = points[i]!;
  const p1 = points[i + 1]!;
  const h = p1.x - p0.x;
  if (h <= 0) return p1.y;
  const t = (x - p0.x) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * p0.y + h10 * h * m[i]! + h01 * p1.y + h11 * h * m[i + 1]!;
}

/**
 * Bakes the four curves into one 256-wide RGBA16F row: the per-channel curve
 * runs first, the master curve second, so a single fetch per channel does both.
 *
 */
export function bakeCurveLut(curves: Curves): Float32Array {
  const data = new Float32Array(CURVE_LUT_SIZE * 4);
  const master = tangents(curves.rgb);
  const channels = [curves.r, curves.g, curves.b].map((curve) => tangents(curve));

  for (let i = 0; i < CURVE_LUT_SIZE; i++) {
    const x = i / (CURVE_LUT_SIZE - 1);
    for (let c = 0; c < 3; c++) {
      const curve = [curves.r, curves.g, curves.b][c]!;
      const staged = clamp01(sampleCurve(curve, x, channels[c]));
      const shaped = clamp01(sampleCurve(curves.rgb, staged, master));
      // A curve that has been scaled back to the diagonal must produce an exact
      // identity: the sampled value is within rounding of x, never exactly x.
      data[i * 4 + c] = Math.abs(shaped - x) < 1e-6 ? x : shaped;
    }
    data[i * 4 + 3] = 1;
  }
  return data;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
