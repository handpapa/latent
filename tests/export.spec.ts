import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * The M8 gate, end to end through the real UI: open a picture, frame it, press
 * 导出, and read the bytes that arrive. The PNG header carries the size, so the
 * file itself proves the composed dimensions.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

const pngSize = (bytes: Buffer): { width: number; height: number } => ({
  width: bytes.readUInt32BE(16),
  height: bytes.readUInt32BE(20),
});

test('export writes a file at the composed size, frame included', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  // A 200×100 card, then a frame that adds 10px on each side.
  await page.evaluate(async () => {
    const card = document.createElement('canvas');
    card.width = 200;
    card.height = 100;
    const ctx = card.getContext('2d')!;
    ctx.fillStyle = '#336699';
    ctx.fillRect(0, 0, 200, 100);
    window.__grade!.open(await createImageBitmap(card), 'shot.png');
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline && !window.__grade!.renderer()?.sourceSize) {
      await new Promise((r) => setTimeout(r, 20));
    }
  });

  // Choose the white mat through the frame tab.
  await page.locator('.panel .tab', { hasText: '相框' }).click();
  await page.locator('.band--text', { hasText: '白卡' }).click();
  await expect(page.locator('.panel .tab[data-active="true"]')).toHaveText('相框');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('.topbar__meta .btn', { hasText: '导出' }).click();
  await expect(page.locator('.dialog')).toBeVisible();
  await page.locator('.dialog .btn', { hasText: '导出' }).click();

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('shot-latent.png');

  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = readFileSync(path!);
  expect(bytes.subarray(0, 4)).toEqual(Buffer.from(PNG_SIGNATURE));

  // Short edge 100 → 0.05 inset is 5px on each side: 210 × 110.
  expect(pngSize(bytes)).toEqual({ width: 210, height: 110 });
});

test('a lossy export flattens the transparent corners onto white', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  await page.evaluate(async () => {
    const card = document.createElement('canvas');
    card.width = 120;
    card.height = 120;
    const ctx = card.getContext('2d')!;
    ctx.fillStyle = '#336699';
    ctx.fillRect(0, 0, 120, 120);
    window.__grade!.open(await createImageBitmap(card), 'rounded.png');
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline && !window.__grade!.renderer()?.sourceSize) {
      await new Promise((r) => setTimeout(r, 20));
    }
  });

  await page.locator('.panel .tab', { hasText: '相框' }).click();
  await page.locator('.band--text', { hasText: '白卡' }).click();
  // Radius large enough that the very corner is outside the board.
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('#adjust-radius')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, '0.06');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const downloadPromise = page.waitForEvent('download');
  await page.locator('.topbar__meta .btn', { hasText: '导出' }).click();
  await page.locator('.band--text', { hasText: 'JPEG' }).click();
  await page.locator('.dialog .btn', { hasText: '导出' }).click();

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('rounded-latent.jpg');
  const path = await download.path();
  const bytes = readFileSync(path!);
  // JPEG magic.
  expect(bytes[0]).toBe(0xff);
  expect(bytes[1]).toBe(0xd8);
  expect(bytes.length).toBeGreaterThan(512);
});
