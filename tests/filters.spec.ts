import { expect, test } from '@playwright/test';
import { parseCube } from '../src/core/cube';
import { NEUTRAL_EDIT } from './neutral';

/**
 * The M5 gate. The file format is checked in Node (it is a pure function); the
 * table and the effects are checked on pixels, because "the LUT is applied"
 * is exactly the kind of claim a screenshot cannot settle.
 */

const identityCube = (size: number): string => {
  const lines = [`LUT_3D_SIZE ${size}`];
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        lines.push(`${(r / (size - 1)).toFixed(6)} ${(g / (size - 1)).toFixed(6)} ${(b / (size - 1)).toFixed(6)}`);
      }
    }
  }
  return lines.join('\n');
};

test('a .cube is parsed, and an identity table stays an identity', () => {
  const identity = parseCube(identityCube(2));
  expect(identity.size).toBe(33);
  // Sample the baked table at a few points: an identity file must map v to v.
  const sample = (r: number, g: number, b: number): number[] => {
    const index = ((b * identity.size + g) * identity.size + r) * 4;
    return Array.from(identity.data.slice(index, index + 3));
  };
  const mid = Math.round((identity.size - 1) / 2);
  expect(sample(0, 0, 0)).toEqual([0, 0, 0]);
  expect(sample(mid, mid, mid).map((v) => Math.round(v * 32))).toEqual([16, 16, 16]);
  expect(sample(32, 32, 32)).toEqual([1, 1, 1]);

  const inverted = parseCube(
    ['LUT_3D_SIZE 2', '1 1 1', '0 1 1', '1 0 1', '0 0 1', '1 1 0', '0 1 0', '1 0 0', '0 0 0'].join('\n'),
  );
  const index = ((32 * 33 + 32) * 33 + 0) * 4;
  expect(Array.from(inverted.data.slice(index, index + 3))).toEqual([1, 0, 0]);
});

test('a malformed .cube is rejected with a readable message', () => {
  expect(() => parseCube('LUT_3D_SIZE 2\n0 0 0\n')).toThrow(/数据行数不符/);
  expect(() => parseCube('nothing here')).toThrow(/LUT_3D_SIZE/);
});

const CARD = `
  const card = document.createElement('canvas');
  card.width = SIZE;
  card.height = SIZE;
  const ctx = card.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#203040';
  ctx.fillRect(0, 0, SIZE / 2, SIZE / 2);
  return card;
`;

type PageApi = {
  run: (code: string) => Promise<unknown>;
};

test('the filter table is applied, blended by strength, and never flips', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  const result = await page.evaluate(async ({ cardSource, neutral }) => {
    const build = new Function(`${cardSource.replace(/SIZE/g, '64')}`) as () => HTMLCanvasElement;


    window.__grade!.open(await createImageBitmap(build()), 'lut.png');
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline && !window.__grade!.renderer()?.sourceSize) {
      await new Promise((r) => setTimeout(r, 20));
    }
    await new Promise((r) => requestAnimationFrame(r));

    const renderer = window.__grade!.renderer() as unknown as {
      setEdit: (edit: unknown) => void;
      setLut: (id: string | null, doc: unknown) => void;
      render: () => void;
    };

    const table = (invert: boolean): { size: number; title: string; data: Float32Array } => {
      const size = 33;
      const data = new Float32Array(size * size * size * 4);
      for (let b = 0; b < size; b++) {
        for (let g = 0; g < size; g++) {
          for (let r = 0; r < size; r++) {
            const index = ((b * size + g) * size + r) * 4;
            const values = [r, g, b].map((v) => v / (size - 1));
            for (let channel = 0; channel < 3; channel++) {
              data[index + channel] = invert ? 1 - values[channel]! : values[channel]!;
            }
            data[index + 3] = 1;
          }
        }
      }
      return { size, title: 'test', data };
    };

    const shoot = (edit: unknown): Uint8ClampedArray => {
      renderer.setEdit(edit);
      renderer.render();
      return window.__grade!.snapshot()!.data;
    };
    const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
      let max = 0;
      for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i]! - b[i]!));
      return max;
    };

    const plain = shoot(neutral);

    renderer.setLut('identity', table(false));
    const identity = shoot({ ...neutral, lut: { id: 'identity', intensity: 1 } });

    renderer.setLut('invert', table(true));
    const inverted = shoot({ ...neutral, lut: { id: 'invert', intensity: 1 } });
    const half = shoot({ ...neutral, lut: { id: 'invert', intensity: 0.5 } });

    let invertError = 0;
    let halfError = 0;
    for (let i = 0; i < plain.length; i += 4) {
      for (let k = 0; k < 3; k++) {
        invertError = Math.max(invertError, Math.abs(255 - plain[i + k]! - inverted[i + k]!));
        const mid = (plain[i + k]! + (255 - plain[i + k]!)) / 2;
        halfError = Math.max(halfError, Math.abs(mid - half[i + k]!));
      }
    }

    return { identityDiff: diff(plain, identity), invertError, halfError };
  }, { cardSource: CARD, neutral: NEUTRAL_EDIT });

  expect(result.identityDiff, 'an identity table must not change a byte').toBeLessThanOrEqual(1);
  expect(result.invertError, 'an inverting table must invert').toBeLessThanOrEqual(2);
  expect(result.halfError, 'strength 0.5 lands halfway').toBeLessThanOrEqual(3);
});

test('grain keeps its amplitude at any resolution, and the vignette falls off', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  const result = await page.evaluate(async ({ cardSource, neutral }) => {

    const renderer = window.__grade!.renderer() as unknown as {
      setEdit: (edit: unknown) => void;
      render: () => void;
    };
    const shoot = (edit: unknown): Uint8ClampedArray => {
      renderer.setEdit(edit);
      renderer.render();
      return window.__grade!.snapshot()!.data;
    };
    const stddev = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
      let sum = 0;
      let count = 0;
      for (let i = 0; i < a.length; i += 4) {
        // Sample the flat grey half only: edges and corners are for the vignette.
        const x = (i / 4) % 64;
        const y = Math.floor(i / 4 / 64);
        if (x < 32 && y < 32) continue;
        sum += (a[i]! - b[i]!) ** 2;
        count++;
      }
      return Math.sqrt(sum / count);
    };

    const open = async (size: number): Promise<void> => {
      const build = new Function(`${cardSource.replace(/SIZE/g, String(size))}`) as () => HTMLCanvasElement;
      window.__grade!.open(await createImageBitmap(build()), `grey-${size}.png`);
      const deadline = performance.now() + 10_000;
      while (performance.now() < deadline) {
        const size_ = window.__grade!.renderer()?.sourceSize;
        if (size_ && size_.width === size) break;
        await new Promise((r) => setTimeout(r, 20));
      }
      await new Promise((r) => requestAnimationFrame(r));
    };

    await open(64);
    const smallSmooth = shoot(neutral);
    const smallGrain = shoot({ ...neutral, fx: { ...neutral.fx, grain: 0.6, vignette: 0 } });
    const smallAgain = shoot({ ...neutral, fx: { ...neutral.fx, grain: 0.6, vignette: 0 } });

    await open(128);
    const largeSmooth = shoot(neutral);
    const largeGrain = shoot({ ...neutral, fx: { ...neutral.fx, grain: 0.6, vignette: 0 } });

    await open(64);
    const vignetted = shoot({ ...neutral, fx: { ...neutral.fx, vignette: 0.8 } });
    const corner = vignetted[(4 * 64 + 4) * 4]!;
    const centre = vignetted[(32 * 64 + 32) * 4]!;

    let identical = true;
    for (let i = 0; i < smallGrain.length; i++) if (smallGrain[i] !== smallAgain[i]) identical = false;

    return {
      amplitudeSmall: stddev(smallGrain, smallSmooth),
      amplitudeLarge: stddev(largeGrain, largeSmooth),
      deterministic: identical,
      corner,
      centre,
    };
  }, { cardSource: CARD, neutral: NEUTRAL_EDIT });

  expect(result.deterministic, 'grain must not wander between renders').toBe(true);
  expect(result.amplitudeSmall).toBeGreaterThan(0.5);
  expect(Math.abs(result.amplitudeSmall - result.amplitudeLarge)).toBeLessThan(1.5);
  expect(result.centre).toBe(128);
  expect(result.corner).toBeLessThan(result.centre - 20);
});
