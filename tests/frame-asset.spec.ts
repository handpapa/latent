import { expect, test } from '@playwright/test';
import { NEUTRAL_EDIT } from './neutral';

/**
 * The 9-slice gate. The ornament in each corner is square in the asset, so it has
 * to stay square in the finished picture — on a wide photograph and on a tall
 * one. Stretching the border as a single image passes everything except this.
 */

test('a 9-slice border keeps its corner ornament square at any aspect', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  const result = await page.evaluate(async (neutral) => {
    const renderer = window.__grade!.renderer() as unknown as {
      setEdit: (edit: unknown) => void;
      setFrameAsset: (source: TexImageSource | null, slice: Record<string, number> | null) => void;
      render: () => void;
    };

    // The same asset the app ships, drawn here so the test does not depend on UI.
    const asset = document.createElement('canvas');
    asset.width = 192;
    asset.height = 192;
    const actx = asset.getContext('2d')!;
    actx.fillStyle = '#f3f0e9';
    actx.fillRect(0, 0, 192, 48);
    actx.fillRect(0, 144, 192, 48);
    actx.fillRect(0, 0, 48, 192);
    actx.fillRect(144, 0, 48, 192);
    actx.strokeStyle = '#3a3630';
    actx.lineWidth = 2;
    actx.strokeRect(49, 49, 94, 94);
    actx.fillStyle = '#e5a93b';
    for (const [x, y] of [[13, 13], [157, 13], [13, 157], [157, 157]] as const) {
      actx.fillRect(x, y, 22, 22);
    }
    renderer.setFrameAsset(asset, { t: 0.25, r: 0.25, b: 0.25, l: 0.25 });

    const card = (width: number, height: number): HTMLCanvasElement => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(0, 0, width, height);
      return canvas;
    };

    const shoot = async (width: number, height: number): Promise<Uint8ClampedArray> => {
      window.__grade!.open(await createImageBitmap(card(width, height)), `frame-${width}x${height}.png`);
      const deadline = performance.now() + 10_000;
      while (performance.now() < deadline) {
        const size = window.__grade!.renderer()?.sourceSize;
        if (size && size.width === width && size.height === height) break;
        await new Promise((r) => setTimeout(r, 20));
      }
      await new Promise((r) => requestAnimationFrame(r));
      renderer.setEdit({
        ...neutral,
        frame: {
          kind: 'asset',
          assetId: 'ornament',
          insets: { t: 0.2, r: 0.2, b: 0.2, l: 0.2 },
          color: '#0b0b0b',
          radius: 0,
        },
      });
      renderer.render();
      return window.__grade!.snapshot()!.data;
    };

    /** Bounding box of the amber ornament in the top-left corner. */
    const ornament = (data: Uint8ClampedArray, width: number) => {
      let minX = 9999;
      let minY = 9999;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < 60; y++) {
        for (let x = 0; x < 60; x++) {
          const i = (y * width + x) * 4;
          if (data[i]! > 190 && data[i + 1]! > 120 && data[i + 1]! < 200 && data[i + 2]! < 110) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }
      return { width: maxX - minX + 1, height: maxY - minY + 1 };
    };

    const wide = await shoot(400, 100);
    const tall = await shoot(100, 400);
    return {
      wide: ornament(wide, 440),
      tall: ornament(tall, 140),
    };
  }, NEUTRAL_EDIT);

  // Band is 0.2 of the 100px short edge = 20px; the ornament is 22/48 of a
  // corner, so roughly 9px on each side.
  for (const [label, box] of Object.entries(result)) {
    expect(box.width, `${label} ornament width`).toBeGreaterThan(6);
    expect(box.width, `${label} ornament width`).toBeLessThan(14);
    expect(Math.abs(box.width - box.height), `${label} ornament must stay square`).toBeLessThanOrEqual(2);
  }
  expect(Math.abs(result.wide.width - result.tall.width)).toBeLessThanOrEqual(2);
});
