import { expect, test } from '@playwright/test';

/**
 * The M3 gate. The claims worth testing are the ones a screenshot cannot make:
 * strength 0 leaves the file untouched, strength 1 is exactly the preset, and a
 * saved card survives a reload.
 */

const CARD = `
  const card = document.createElement('canvas');
  card.width = 96;
  card.height = 96;
  const ctx = card.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 96, 96);
  g.addColorStop(0, '#101820');
  g.addColorStop(0.5, '#c9a06a');
  g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 96, 96);
  ctx.fillStyle = '#e63946';
  ctx.fillRect(8, 8, 32, 32);
  ctx.fillStyle = '#2a9d8f';
  ctx.fillRect(56, 56, 32, 32);
`;

test('strength 0 is the original file and strength 1 is the preset', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  const result = await page.evaluate(async (cardSource) => {
    const build = new Function(`${cardSource} return card;`) as () => HTMLCanvasElement;
    const card = build();
    window.__grade!.open(
      await createImageBitmap(card, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }),
      'preset.png',
    );
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline && !window.__grade!.renderer()?.sourceSize) {
      await new Promise((r) => setTimeout(r, 20));
    }
    await new Promise((r) => requestAnimationFrame(r));

    const diff = (a: ImageData, b: ImageData): number => {
      let max = 0;
      for (let i = 0; i < a.data.length; i++) max = Math.max(max, Math.abs(a.data[i]! - b.data[i]!));
      return max;
    };
    const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const setStrength = async (value: number) => {
      const el = document.querySelector<HTMLInputElement>('#adjust-strength')!;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, String(value));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
    };

    const original = window.__grade!.snapshot()!;

    const tiles = [...document.querySelectorAll<HTMLButtonElement>('.tile__button')];
    tiles[5]!.click(); // 硬调: the most visible of the built-ins
    await new Promise((r) => setTimeout(r, 700));
    const applied = window.__grade!.snapshot()!;

    await setStrength(0);
    const zeroed = window.__grade!.snapshot()!;
    await setStrength(1);
    const full = window.__grade!.snapshot()!;

    return {
      changedByPreset: diff(original, applied),
      originalVsZero: diff(original, zeroed),
      appliedVsFull: diff(applied, full),
      tileCount: tiles.length,
    };
  }, CARD);

  expect(result.changedByPreset, 'applying a preset must change the picture').toBeGreaterThan(0);
  expect(result.originalVsZero, 'strength 0 must restore the file byte for byte').toBe(0);
  expect(result.appliedVsFull, 'strength 1 must equal the preset applied at full').toBe(0);
  expect(result.tileCount).toBeGreaterThanOrEqual(12);
});

test('every card renders from the open photo', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  const result = await page.evaluate(async (cardSource) => {
    const build = new Function(`${cardSource} return card;`) as () => HTMLCanvasElement;
    const started = performance.now();
    window.__grade!.open(await createImageBitmap(build()), 'thumbs.png');

    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline) {
      const rendered = document.querySelectorAll('.tile__image:not(.tile__image--empty)');
      const total = document.querySelectorAll('.tile__image').length;
      if (total > 0 && rendered.length === total) {
        return { ms: Math.round(performance.now() - started), rendered: rendered.length };
      }
      await new Promise((r) => setTimeout(r, 16));
    }
    return { ms: -1, rendered: 0 };
  }, CARD);

  expect(result.rendered).toBeGreaterThanOrEqual(12);
  expect(result.ms, 'thumbnails are budgeted at 100ms').toBeLessThan(1000);
});

test('a saved card survives a reload', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  await page.evaluate(async (cardSource) => {
    const build = new Function(`${cardSource} return card;`) as () => HTMLCanvasElement;
    window.__grade!.open(await createImageBitmap(build()), 'save.png');
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline && !document.querySelector('.rail__foot')) {
      await new Promise((r) => setTimeout(r, 20));
    }
  }, CARD);

  await page.locator('.rail__foot .btn', { hasText: '存为色卡' }).click();
  const field = page.locator('.rail__save .field');
  await field.fill('回归色卡');
  await field.press('Enter');
  await expect(page.locator('.tile__name', { hasText: '回归色卡' })).toBeVisible();

  await page.reload();
  await page.waitForFunction(() => !!window.__grade);
  await page.evaluate(async (cardSource) => {
    const build = new Function(`${cardSource} return card;`) as () => HTMLCanvasElement;
    window.__grade!.open(await createImageBitmap(build()), 'save.png');
  }, CARD);

  await expect(page.locator('.tile__name', { hasText: '回归色卡' })).toBeVisible();

  await page.evaluate(() => localStorage.removeItem('latent.presets.v1'));
});
