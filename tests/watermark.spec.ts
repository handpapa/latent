import { expect, test } from '@playwright/test';

/**
 * The M7 gate: the mark lands where the anchor says, on the photograph or on the
 * mat, and at opacity 0 it is not there at all.
 */

const CARD = `
  const card = document.createElement('canvas');
  card.width = 200;
  card.height = 100;
  const ctx = card.getContext('2d');
  ctx.fillStyle = '#404040';
  ctx.fillRect(0, 0, 200, 100);
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
  watermark: {
    kind: 'none', text: '', colour: '#ffffff', size: 0.2, anchor: 'br',
    offsetX: 0, offsetY: 0, opacity: 1, rotation: 0, tile: false, target: 'photo',
  },
} as const;

test('the mark lands where the anchor points, on the photo or on the mat', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  const result = await page.evaluate(async ({ cardSource, neutral }) => {
    const build = new Function(`${cardSource}`) as () => HTMLCanvasElement;
    window.__grade!.open(await createImageBitmap(build()), 'mark.png');
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline && !window.__grade!.renderer()?.sourceSize) {
      await new Promise((r) => setTimeout(r, 20));
    }
    await new Promise((r) => requestAnimationFrame(r));

    const renderer = window.__grade!.renderer() as unknown as {
      setEdit: (edit: unknown) => void;
      setWatermark: (source: TexImageSource | null, natural: { width: number; height: number } | null) => void;
      render: () => void;
    };
    const mark = document.createElement('canvas');
    mark.width = 64;
    mark.height = 16;
    const markCtx = mark.getContext('2d')!;
    markCtx.fillStyle = '#ffffff';
    markCtx.fillRect(0, 0, 64, 16);
    renderer.setWatermark(mark, { width: 64, height: 16 });

    const shoot = (watermark: Record<string, unknown>, frame: unknown): ImageData => {
      renderer.setEdit({ ...neutral, frame, watermark: { ...neutral.watermark, ...watermark } });
      renderer.render();
      return window.__grade!.snapshot()!;
    };
    const changedBox = (a: ImageData, b: ImageData) => {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -1;
      let maxY = -1;
      let count = 0;
      for (let y = 0; y < a.height; y++) {
        for (let x = 0; x < a.width; x++) {
          const i = (y * a.width + x) * 4;
          if (Math.abs(a.data[i]! - b.data[i]!) > 6) {
            count++;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }
      return count === 0 ? null : { minX, minY, maxX, maxY, count };
    };

    const plain = shoot({}, neutral.frame);
    const bottomRight = shoot({ kind: 'text', anchor: 'br' }, neutral.frame);
    const invisible = shoot({ kind: 'text', anchor: 'br', opacity: 0 }, neutral.frame);
    const tiled = shoot({ kind: 'text', anchor: 'br', tile: true }, neutral.frame);

    const polaroid = {
      kind: 'mat',
      insets: { t: 0.05, r: 0.05, b: 0.3, l: 0.05 },
      color: '#f3f0e9',
      radius: 0,
    };
    const framedPlain = shoot({}, polaroid);
    const onPhoto = shoot({ kind: 'text', anchor: 'bl' }, polaroid);
    const onMat = shoot({ kind: 'text', anchor: 'bl', target: 'frame' }, polaroid);

    return {
      plainSize: [plain.width, plain.height],
      box: changedBox(plain, bottomRight),
      invisible: changedBox(plain, invisible),
      tiled: changedBox(plain, tiled),
      photoBox: changedBox(framedPlain, onPhoto),
      matBox: changedBox(framedPlain, onMat),
    };
  }, { cardSource: CARD, neutral: NEUTRAL });

  // Bottom-right anchor, size 0.2 of the 100px short edge → 20px tall bar.
  expect(result.box).not.toBeNull();
  expect(result.box!.minX).toBeGreaterThanOrEqual(110);
  expect(result.box!.minY).toBeGreaterThanOrEqual(70);
  expect(result.box!.maxX).toBeLessThanOrEqual(199);
  expect(result.box!.maxY).toBeLessThanOrEqual(99);

  // Opacity 0 is not there at all.
  expect(result.invisible).toBeNull();

  // Tiled covers far more of the picture than one mark.
  expect(result.tiled!.count).toBeGreaterThan(result.box!.count * 4);

  // On the mat, the mark sits below the photograph (photo bottom is 100 + 5 = 105
  // of a 130-tall board); on the photo it stays inside the photo area.
  expect(result.photoBox!.maxY).toBeLessThanOrEqual(105);
  expect(result.matBox!.minY).toBeGreaterThanOrEqual(105);
});
