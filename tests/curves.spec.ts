import { expect, test } from '@playwright/test';
import { NEUTRAL_EDIT } from './neutral';

/**
 * The M4 gate, on the pixels rather than the UI: a per-channel curve must move
 * only its own channel, an HSL band must move only its own hues, and grading
 * must tint the zones towards the hue it was given.
 */

const CARD = `
  const card = document.createElement('canvas');
  card.width = 200;
  card.height = 50;
  const ctx = card.getContext('2d');
  ['#808080', '#d0d0d0', '#c02020', '#2050c0'].forEach((colour, i) => {
    ctx.fillStyle = colour;
    ctx.fillRect(i * 50, 0, 50, 50);
  });
  return card;
`;

test('a single-channel curve moves one channel, an HSL band one hue range', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  const result = await page.evaluate(async ({ cardSource, neutral }) => {
    const build = new Function(`${cardSource}`) as () => HTMLCanvasElement;
    window.__grade!.open(await createImageBitmap(build()), 'curves.png');
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline && !window.__grade!.renderer()?.sourceSize) {
      await new Promise((r) => setTimeout(r, 20));
    }
    await new Promise((r) => requestAnimationFrame(r));

    const renderer = window.__grade!.renderer() as unknown as {
      setEdit: (edit: unknown) => void;
      render: () => void;
    };
    const read = (): number[][] => {
      const snap = window.__grade!.snapshot()!;
      return [25, 75, 125, 175].map((x) => [
        snap.data[(25 * 200 + x) * 4]!,
        snap.data[(25 * 200 + x) * 4 + 1]!,
        snap.data[(25 * 200 + x) * 4 + 2]!,
      ]);
    };
    const apply = (patch: Record<string, unknown>): number[][] => {
      renderer.setEdit({ ...neutral, ...patch });
      renderer.render();
      return read();
    };

    const identity = apply({});
    const redCurve = apply({
      curves: { ...neutral.curves, r: [{ x: 0, y: 0 }, { x: 0.5, y: 0.75 }, { x: 1, y: 1 }] },
    });
    const redBand = apply({
      hsl: neutral.hsl.map((band, i) => (i === 0 ? { ...band, saturation: -1 } : band)),
    });
    const graded = apply({
      grade: {
        shadows: { hue: 192, saturation: 0.6 },
        midtones: { hue: 0, saturation: 0 },
        highlights: { hue: 32, saturation: 0.6 },
      },
    });

    return { identity, redCurve, redBand, graded };
  }, { cardSource: CARD, neutral: NEUTRAL_EDIT });

  // Red curve: every patch gains red and nothing else moves.
  result.redCurve.forEach((patch, i) => {
    expect(patch[0], `patch ${i} red`).toBeGreaterThan(result.identity[i]![0]!);
    expect(patch[1], `patch ${i} green untouched`).toBe(result.identity[i]![1]);
    expect(patch[2], `patch ${i} blue untouched`).toBe(result.identity[i]![2]);
  });

  // Red band desaturated: the red patch turns toward grey, the others do not move.
  expect(result.redBand[2]![1]).toBeGreaterThan(result.identity[2]![1]!);
  expect(result.redBand[2]![0]).toBeLessThan(result.identity[2]![0]!);
  expect(result.redBand[3]).toEqual(result.identity[3]);
  expect(result.redBand[0]).toEqual(result.identity[0]);

  // Grading: the bright patch warms, the two dark patches cool.
  expect(result.graded[1]![0]).toBeGreaterThan(result.graded[1]![2]!);
  expect(result.graded[2]![2]).toBeGreaterThan(result.identity[2]![2]!);
  expect(result.graded[3]![2]).toBeGreaterThan(result.identity[3]![2]!);

});
