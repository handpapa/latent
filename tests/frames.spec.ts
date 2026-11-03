import { expect, test } from '@playwright/test';
import { NEUTRAL_EDIT } from './neutral';

/**
 * The M6 gate. A frame is not an overlay: it enlarges the output, so the things
 * worth asserting are the composed size, where the photo lands inside it, and
 * that the mat is the colour it was asked for.
 */

const CARD = `
  const card = document.createElement('canvas');
  card.width = 200;
  card.height = 100;
  const ctx = card.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 200, 100);
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 10, 10);
  return card;
`;

test('a frame enlarges the output and the photo lands inside it', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  const result = await page.evaluate(async ({ cardSource, neutral }) => {
    const build = new Function(`${cardSource}`) as () => HTMLCanvasElement;
    window.__grade!.open(await createImageBitmap(build()), 'frame.png');
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline && !window.__grade!.renderer()?.sourceSize) {
      await new Promise((r) => setTimeout(r, 20));
    }
    await new Promise((r) => requestAnimationFrame(r));

    const renderer = window.__grade!.renderer() as unknown as {
      setEdit: (edit: unknown) => void;
      render: () => void;
    };
    const shoot = (frame: unknown): ImageData => {
      renderer.setEdit({ ...neutral, frame });
      renderer.render();
      return window.__grade!.snapshot()!;
    };
    const px = (image: ImageData, x: number, y: number): number[] => {
      const i = (y * image.width + x) * 4;
      return [image.data[i]!, image.data[i + 1]!, image.data[i + 2]!, image.data[i + 3]!];
    };

    const plain = shoot(neutral.frame);
    const even = shoot({
      kind: 'mat',
      insets: { t: 0.1, r: 0.1, b: 0.1, l: 0.1 },
      color: '#f3f0e9',
      radius: 0,
    });
    const uneven = shoot({
      kind: 'mat',
      insets: { t: 0.05, r: 0.05, b: 0.3, l: 0.2 },
      color: '#0d0d0d',
      radius: 0,
    });
    const rounded = shoot({
      kind: 'mat',
      insets: { t: 0.1, r: 0.1, b: 0.1, l: 0.1 },
      color: '#f3f0e9',
      radius: 0.1,
    });

    return {
      plainSize: [plain.width, plain.height],
      evenSize: [even.width, even.height],
      matPixel: px(even, 4, 4),
      photoPixel: px(even, 100, 60),
      redPixel: px(even, 12, 12),
      unevenSize: [uneven.width, uneven.height],
      unevenPhoto: px(uneven, 100, 60),
      roundedCornerAlpha: px(rounded, 0, 0)[3],
      roundedCentre: px(rounded, 110, 60),
    };
  }, { cardSource: CARD, neutral: NEUTRAL_EDIT });

  // Short edge is 100, so a 0.1 inset is 10px on every side.
  expect(result.plainSize).toEqual([200, 100]);
  expect(result.evenSize).toEqual([220, 120]);

  // The mat is the colour asked for, and the photo starts at (10, 10).
  expect(result.matPixel.slice(0, 3)).toEqual([0xf3, 0xf0, 0xe9]);
  expect(result.photoPixel.slice(0, 3)).toEqual([128, 128, 128]);
  // The red square sits in the photo's top-left corner, now offset by the mat.
  expect(result.redPixel.slice(0, 3)).toEqual([255, 0, 0]);

  // Uneven insets: l 0.2 → 20px, r 0.05 → 5px, t 0.05 → 5px, b 0.3 → 30px.
  expect(result.unevenSize).toEqual([225, 135]);
  expect(result.unevenPhoto.slice(0, 3)).toEqual([128, 128, 128]);

  // A rounded board leaves the corners transparent for a PNG export.
  expect(result.roundedCornerAlpha).toBe(0);
  expect(result.roundedCentre.slice(0, 3)).toEqual([128, 128, 128]);
});
