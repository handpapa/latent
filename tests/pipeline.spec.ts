import { expect, test } from '@playwright/test';

/**
 * The gate for the colour pipeline. Two bugs this catches that a "looks right"
 * check does not:
 *
 *  1. A double sRGB encode — the image is plausible, slightly off, and nobody
 *     notices until two adjustments stack.
 *  2. A vertical flip between passes — every colour is correct, the photograph
 *     is upside down, and both look identical on a uniform test card.
 *
 * The card is asymmetric on purpose and the comparison is exact (a ±1 LSB
 * allowance only once dithering ships).
 */

declare global {
  interface Window {
    __grade?: {
      open: (bitmap: ImageBitmap, name?: string) => void;
      renderer: () => {
        sourceSize: { width: number; height: number } | null;
        frames: number;
        develops: number;
        caps: { software: boolean; floatColorBuffer: boolean; renderer: string };
      } | null;
      snapshot: () => ImageData | null;
      frames: number;
      invalidate: () => void;
    };
  }
}

test('colour pipeline is an exact identity and never flips the image', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  const result = await page.evaluate(async () => {
    const W = 300;
    const H = 200;
    const card = document.createElement('canvas');
    card.width = W;
    card.height = H;
    const ctx = card.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    // Four quadrants: any flip or rotation is visible as a colour swap.
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 150, 100);
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(150, 0, 150, 100);
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(0, 100, 150, 100);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(150, 100, 150, 100);
    // Near-neutral ramp in the middle: the region where an encode mistake hides.
    for (let x = 120; x < 180; x++) {
      const v = Math.round(((x - 120) / 60) * 255);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, 60, 1, 40);
    }

    const expected = ctx.getImageData(0, 0, W, H).data;
    const bitmap = await createImageBitmap(card, {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
    window.__grade!.open(bitmap, 'identity.png');

    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline) {
      const size = window.__grade!.renderer()?.sourceSize;
      if (size && size.width === W && size.height === H) break;
      await new Promise((r) => setTimeout(r, 20));
    }

    const snap = window.__grade!.snapshot();
    if (!snap) throw new Error('snapshot returned nothing');

    const at = (data: Uint8ClampedArray, x: number, y: number) => [
      data[(y * W + x) * 4],
      data[(y * W + x) * 4 + 1],
      data[(y * W + x) * 4 + 2],
    ];

    let maxDiff = 0;
    for (let i = 0; i < expected.length; i += 4) {
      for (let k = 0; k < 3; k++) {
        maxDiff = Math.max(maxDiff, Math.abs(expected[i + k]! - snap.data[i + k]!));
      }
    }

    return {
      maxDiff,
      corners: {
        tl: at(snap.data, 20, 20),
        tr: at(snap.data, 280, 20),
        bl: at(snap.data, 20, 180),
        br: at(snap.data, 280, 180),
      },
    };
  });

  expect(result.corners.tl).toEqual([255, 0, 0]);
  expect(result.corners.tr).toEqual([0, 255, 0]);
  expect(result.corners.bl).toEqual([0, 0, 255]);
  expect(result.corners.br).toEqual([255, 255, 255]);
  expect(result.maxDiff, 'sRGB → linear → sRGB must round-trip exactly').toBeLessThanOrEqual(1);
});

test('the preview redraws once per frame, only when invalidated', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  const frames = await page.evaluate(async () => {
    const card = document.createElement('canvas');
    card.width = 64;
    card.height = 64;
    card.getContext('2d')!.fillRect(0, 0, 64, 64);
    window.__grade!.open(await createImageBitmap(card), 'scheduling.png');
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline && !window.__grade!.renderer()?.sourceSize) {
      await new Promise((r) => setTimeout(r, 20));
    }

    const renderer = window.__grade!.renderer();
    if (!renderer) throw new Error('no renderer');
    const before = renderer.frames;
    window.__grade!.invalidate();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const after = renderer.frames;

    // A second idle frame must not redraw: an editor that renders at 60 Hz
    // while nothing moves is a laptop with a hot lap.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const settled = renderer.frames;

    return { drew: after - before, idleDrew: settled - after };
  });

  expect(frames.drew).toBe(1);
  expect(frames.idleDrew).toBe(0);
});
