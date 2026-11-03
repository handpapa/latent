import { expect, test } from '@playwright/test';

/**
 * The camera gate. Zoom is not cosmetic here: grain and clarity can only be
 * judged at 100%, so the magnification has to be exactly what it claims.
 */

const CARD = `
  const card = document.createElement('canvas');
  card.width = 400;
  card.height = 200;
  const ctx = card.getContext('2d');
  ctx.fillStyle = '#404040';
  ctx.fillRect(0, 0, 400, 200);
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(190, 90, 20, 20);
  return card;
`;

test('zoom magnifies by the factor it reports, and fit restores it', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  const result = await page.evaluate(async (cardSource) => {
    const build = new Function(`${cardSource}`) as () => HTMLCanvasElement;
    window.__grade!.open(await createImageBitmap(build()), 'camera.png');
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline && !window.__grade!.renderer()?.sourceSize) {
      await new Promise((r) => setTimeout(r, 20));
    }
    await new Promise((r) => requestAnimationFrame(r));

    const renderer = window.__grade!.renderer() as unknown as {
      render: () => void;
      effectiveZoom: () => number;
      zoomAt: (factor: number, x: number, y: number) => number;
      zoomToActual: () => number;
      zoomToFit: () => number;
      panBy: (dx: number, dy: number) => number;
    };
    const canvas = document.querySelector('canvas')!;
    const gl = canvas.getContext('webgl2')!;
    const buffer = new Uint8Array(canvas.width * canvas.height * 4);

    /** Horizontal extent and centre of the red marker, in device pixels. */
    const measure = (): { span: number; centre: number } => {
      renderer.render();
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
      const row = Math.floor(canvas.height / 2);
      let first = -1;
      let last = -1;
      for (let x = 0; x < canvas.width; x++) {
        const i = (row * canvas.width + x) * 4;
        if (buffer[i]! > 200 && buffer[i + 1]! < 80 && buffer[i + 2]! < 80) {
          if (first < 0) first = x;
          last = x;
        }
      }
      return { span: last - first + 1, centre: (first + last) / 2 };
    };

    const fit = measure();
    const fitZoom = renderer.effectiveZoom();

    const zoomed = renderer.zoomAt(2, canvas.width / 2, canvas.height / 2);
    const atTwo = measure();

    const backToFit = renderer.zoomToFit();
    const afterFit = measure();

    // Panning only means something once the picture is larger than the window.
    const fourX = renderer.zoomAt(4, canvas.width / 2, canvas.height / 2);
    const beforePan = measure();
    const panZoom = renderer.panBy(120, 0);
    const panned = measure();

    return {
      fitZoom,
      fit,
      zoomed,
      atTwo,
      backToFit,
      afterFit,
      fourX,
      beforePan,
      panZoom,
      panned,
    };
  }, CARD);

  // A 400×200 photo in a wide stage fits at 100%, so the marker is 20px wide.
  expect(result.fitZoom).toBe(1);
  expect(result.fit.span).toBeGreaterThan(15);
  expect(result.fit.span).toBeLessThan(25);

  // 2× is 2×: twice the pixels, and centred where it was.
  expect(result.zoomed).toBe(2);
  expect(result.atTwo.span).toBeGreaterThan(result.fit.span * 1.7);
  expect(result.atTwo.span).toBeLessThan(result.fit.span * 2.3);
  expect(Math.abs(result.atTwo.centre - result.fit.centre)).toBeLessThan(4);

  // Fit puts it back exactly.
  expect(result.afterFit.span).toBe(result.fit.span);

  // Panning moves the picture by the pixels it was dragged, at the same zoom.
  expect(result.fourX).toBe(4);
  expect(result.panZoom).toBe(4);
  expect(result.panned.centre - result.beforePan.centre).toBeGreaterThan(100);
  // Same magnification; the measured span shifts by a pixel or two because the
  // upscaled edge lands on a different subpixel phase.
  expect(Math.abs(result.panned.span - result.beforePan.span)).toBeLessThan(6);
});
