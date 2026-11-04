import { expect, test } from '@playwright/test';
import { NEUTRAL_EDIT } from './neutral';

/**
 * The blur-fill gate: the border has to be the photograph's own out-of-focus
 * self — so a picture that is red on the left and blue on the right must leave a
 * red border on the left and a blue one on the right. At strength 0 it must be
 * the flat mat colour again.
 */

test('the blur fill comes from the picture, and strength 0 restores the mat', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  const result = await page.evaluate(async (neutral) => {
    const sleep = (ms: number): Promise<void> => {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, ms);
      return promise;
    };

    const card = document.createElement('canvas');
    card.width = 200;
    card.height = 100;
    const ctx = card.getContext('2d')!;
    ctx.fillStyle = '#c02020';
    ctx.fillRect(0, 0, 100, 100);
    ctx.fillStyle = '#2050c0';
    ctx.fillRect(100, 0, 100, 100);

    window.__grade!.open(await createImageBitmap(card), 'blur-frame.png');
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline && !window.__grade!.renderer()?.sourceSize) {
      await sleep(20);
    }
    await new Promise((r) => requestAnimationFrame(r));

    const renderer = window.__grade!.renderer() as unknown as {
      setEdit: (edit: unknown) => void;
      render: () => void;
    };
    const frame = (strength: number) => ({
      kind: 'blur',
      assetId: null,
      insets: { t: 0.2, r: 0.2, b: 0.2, l: 0.2 },
      color: '#00ff00',
      radius: 0,
      blur: { strength, darken: 0, desaturate: 0 },
    });
    const shoot = (strength: number): ImageData => {
      renderer.setEdit({ ...neutral, frame: frame(strength) });
      renderer.render();
      return window.__grade!.snapshot()!;
    };
    const px = (image: ImageData, x: number, y: number): number[] => {
      const i = (y * image.width + x) * 4;
      return [image.data[i]!, image.data[i + 1]!, image.data[i + 2]!];
    };

    const filled = shoot(1);
    const flat = shoot(0);
    const y = Math.round(filled.height / 2);
    return {
      size: [filled.width, filled.height],
      leftBorder: px(filled, 6, y),
      rightBorder: px(filled, filled.width - 7, y),
      flatLeftBorder: px(flat, 6, y),
      centre: px(filled, Math.round(filled.width / 2), y),
    };
  }, NEUTRAL_EDIT);

  // 200×100 plus a 0.2 inset on the short edge: 240×140.
  expect(result.size).toEqual([240, 140]);

  // The left border carries the left of the picture, the right border its right.
  expect(result.leftBorder[0]).toBeGreaterThan(result.leftBorder[2] + 30);
  expect(result.rightBorder[2]).toBeGreaterThan(result.rightBorder[0] + 30);

  // Strength 0 is the flat mat colour, exactly.
  expect(result.flatLeftBorder).toEqual([0, 255, 0]);

  // The photograph itself is untouched in the middle.
  expect(result.centre[2]).toBeGreaterThan(result.centre[0]);
});
