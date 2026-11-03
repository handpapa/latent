import { expect, test } from '@playwright/test';

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

const NEUTRAL = {
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
} as const;

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
  }, { cardSource: CARD, neutral: NEUTRAL });

  // Clarity: the dark side of an edge gets darker, the light side lighter.
  expect(result.darkSideClarity).toBeLessThan(result.darkSidePlain);
  expect(result.lightSideClarity).toBeGreaterThan(result.lightSidePlain);

  // Glow: light spills into the dark area near a highlight.
  expect(result.nearHighlightGlow).toBeGreaterThan(result.nearHighlightPlain + 3);

  // Soft focus: the hard edge moves toward the average; the flat area holds.
  expect(result.edgeSoft).toBeLessThan(result.edgePlain - 8);
  expect(Math.abs(result.farSoft - result.farPlain)).toBeLessThanOrEqual(2);
});
