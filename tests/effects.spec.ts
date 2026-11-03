import { expect, test } from '@playwright/test';
import { NEUTRAL_EDIT } from './neutral';

/**
 * The blur chain gate: clarity must add local contrast at an edge, glow must
 * spill light into what is around a highlight, and soft focus must pull an edge
 * toward its neighbourhood — while all three stay off (and free) at zero.
 */

const CARD = `
  const card = document.createElement('canvas');
  card.width = 128;
  card.height = 128;
  const ctx = card.getContext('2d');
  ctx.fillStyle = '#202020';
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = '#e0e0e0';
  ctx.fillRect(64, 0, 64, 128);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(18, 18, 12, 12);
  return card;
`;

test('clarity, glow and soft focus each do their one thing', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  const result = await page.evaluate(async ({ cardSource, neutral }) => {
    const build = new Function(`${cardSource}`) as () => HTMLCanvasElement;
    window.__grade!.open(await createImageBitmap(build()), 'fx.png');
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline && !window.__grade!.renderer()?.sourceSize) {
      await new Promise((r) => setTimeout(r, 20));
    }
    await new Promise((r) => requestAnimationFrame(r));

    const renderer = window.__grade!.renderer() as unknown as {
      setEdit: (edit: unknown) => void;
      render: () => void;
    };
    const shoot = (fx: Record<string, number>): Uint8ClampedArray => {
      renderer.setEdit({ ...neutral, fx: { ...neutral.fx, ...fx } });
      renderer.render();
      return window.__grade!.snapshot()!.data;
    };
    const at = (data: Uint8ClampedArray, x: number, y: number): number => data[(y * 128 + x) * 4]!;

    const plain = shoot({});
    const clarity = shoot({ clarity: 1 });
    const glow = shoot({ glow: 1 });
    const softness = shoot({ softness: 1 });

    return {
      darkSidePlain: at(plain, 60, 80),
      darkSideClarity: at(clarity, 60, 80),
      lightSidePlain: at(plain, 70, 80),
      lightSideClarity: at(clarity, 70, 80),
      nearHighlightPlain: at(plain, 40, 24),
      nearHighlightGlow: at(glow, 40, 24),
      edgePlain: at(plain, 64, 80),
      edgeSoft: at(softness, 64, 80),
      farPlain: at(plain, 110, 110),
      farSoft: at(softness, 110, 110),
    };
  }, { cardSource: CARD, neutral: NEUTRAL_EDIT });

  // Clarity: the dark side of an edge gets darker, the light side lighter.
  expect(result.darkSideClarity).toBeLessThan(result.darkSidePlain);
  expect(result.lightSideClarity).toBeGreaterThan(result.lightSidePlain);

  // Glow: light spills into the dark area near a highlight.
  expect(result.nearHighlightGlow).toBeGreaterThan(result.nearHighlightPlain + 3);

  // Soft focus: the hard edge moves toward the average; the flat area holds.
  expect(result.edgeSoft).toBeLessThan(result.edgePlain - 8);
  expect(Math.abs(result.farSoft - result.farPlain)).toBeLessThanOrEqual(2);
});
