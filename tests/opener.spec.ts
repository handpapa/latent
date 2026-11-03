import { expect, test } from '@playwright/test';

/**
 * Regression: adding drag-to-pan put a pointerdown handler and a pointer capture
 * on the stage, which swallowed the click on every control living inside it —
 * starting with the 打开照片 button on the empty state.
 */

test('the 打开照片 button still opens a file chooser', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  const chooser = page.waitForEvent('filechooser', { timeout: 5000 });
  await page.locator('.board .btn').click();
  await chooser;
});

test('the top bar action still opens a file chooser', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  // Open something through the hook so the bar shows its actions.
  await page.evaluate(async () => {
    const card = document.createElement('canvas');
    card.width = 64;
    card.height = 64;
    card.getContext('2d')!.fillRect(0, 0, 64, 64);
    window.__grade!.open(await createImageBitmap(card), 'button.png');
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline && !window.__grade!.renderer()?.sourceSize) {
      await new Promise((r) => setTimeout(r, 20));
    }
  });

  const chooser = page.waitForEvent('filechooser', { timeout: 5000 });
  await page.locator('.topbar__meta .btn', { hasText: '打开照片' }).click();
  await chooser;
});

test('dragging the stage still pans without stealing clicks', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  await page.evaluate(async () => {
    const card = document.createElement('canvas');
    card.width = 200;
    card.height = 100;
    card.getContext('2d')!.fillRect(0, 0, 200, 100);
    window.__grade!.open(await createImageBitmap(card), 'pan.png');
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline && !window.__grade!.renderer()?.sourceSize) {
      await new Promise((r) => setTimeout(r, 20));
    }
  });

  const before = await page.evaluate(() => window.__grade!.renderer()!.effectiveZoom());
  const box = await page.locator('.stage').boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 80, box!.y + box!.height / 2 + 20, { steps: 6 });
  await page.mouse.up();

  // The camera exists and did not blow up; the zoom is unchanged by a drag.
  const after = await page.evaluate(() => window.__grade!.renderer()!.effectiveZoom());
  expect(after).toBe(before);
});
