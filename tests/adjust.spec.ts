import { expect, test } from '@playwright/test';

/**
 * The M2 gate. Two things break here that a screenshot never shows:
 *
 *  1. A slider drag that develops the full frame per pointer event instead of
 *     per display frame — the editor stays usable on a fast machine and turns
 *     into treacle on a 24MP file.
 *  2. Exposure applied in the wrong space: +1 EV must double *linear* light,
 *     which is not the same as doubling the sRGB bytes.
 */
test('exposure of +1 EV doubles linear light, and reset returns to exact', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  const result = await page.evaluate(async () => {
    const W = 200;
    const H = 50;
    const card = document.createElement('canvas');
    card.width = W;
    card.height = H;
    const ctx = card.getContext('2d')!;
    ['#808080', '#404040', '#c8c8c8', '#cc2222'].forEach((colour, i) => {
      ctx.fillStyle = colour;
      ctx.fillRect(i * 50, 0, 50, H);
    });
    const original = ctx.getImageData(0, 0, W, H).data;

    window.__grade!.open(
      await createImageBitmap(card, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }),
      'patches.png',
    );
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline && !window.__grade!.renderer()?.sourceSize) {
      await new Promise((r) => setTimeout(r, 20));
    }
    await new Promise((r) => requestAnimationFrame(r));

    const patches = () => {
      const snap = window.__grade!.snapshot()!;
      return [25, 75, 125, 175].map((x) => [
        snap.data[(25 * W + x) * 4],
        snap.data[(25 * W + x) * 4 + 1],
        snap.data[(25 * W + x) * 4 + 2],
      ]);
    };

    const setSlider = (selector: string, value: number) => {
      const el = document.querySelector<HTMLInputElement>(selector)!;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, String(value));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const before = patches();

    setSlider('#adjust-exposure', 1);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const exposed = patches();

    [...document.querySelectorAll<HTMLButtonElement>('.panel__action')].find((b) => b.textContent === '重置')!.click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const afterReset = patches();

    const srgbToLinear = (v: number) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const linearToSrgb = (v: number) => {
      const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, s)) * 255);
    };

    let identityDiff = 0;
    const identity = window.__grade!.snapshot()!.data;
    for (let i = 0; i < original.length; i++) {
      identityDiff = Math.max(identityDiff, Math.abs(original[i]! - identity[i]!));
    }

    return {
      before,
      exposed,
      afterReset,
      predicted: [128, 64, 200].map((v) => linearToSrgb(Math.min(1, srgbToLinear(v) * 2))),
      identityDiff,
    };
  });

  expect(result.identityDiff, 'zeroed controls must not touch a single byte').toBe(0);
  // +1 EV on 128 and 64 grey (linear doubling), then 200 grey clipping to white.
  expect(Math.abs(result.exposed[0]![0]! - result.predicted[0]!)).toBeLessThanOrEqual(1);
  expect(Math.abs(result.exposed[1]![0]! - result.predicted[1]!)).toBeLessThanOrEqual(1);
  expect(result.exposed[2]![0]).toBe(255);
  // The red patch keeps its hue: only the channels brighten.
  expect(result.exposed[3]![0]).toBe(255);
  expect(result.exposed[3]![1]).toBeGreaterThan(result.before[3]![1]!);
  expect(result.afterReset).toEqual(result.before);
});

test('a burst of slider events develops the frame exactly once', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  const counts = await page.evaluate(async () => {
    const card = document.createElement('canvas');
    card.width = 64;
    card.height = 64;
    card.getContext('2d')!.fillRect(0, 0, 64, 64);
    window.__grade!.open(await createImageBitmap(card), 'burst.png');
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline && !window.__grade!.renderer()?.sourceSize) {
      await new Promise((r) => setTimeout(r, 20));
    }
    await new Promise((r) => requestAnimationFrame(r));

    const renderer = window.__grade!.renderer()!;
    const before = { develops: renderer.develops, frames: renderer.frames };

    const el = document.querySelector<HTMLInputElement>('#adjust-contrast')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    for (let i = 0; i < 60; i++) {
      setter.call(el, String((i % 40) / 100));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    return {
      develops: renderer.develops - before.develops,
      frames: renderer.frames - before.frames,
    };
  });

  expect(counts.develops, '60 pointer events must collapse into one develop pass').toBe(1);
  expect(counts.frames).toBe(1);
});
