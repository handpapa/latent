import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Imported filter tables have to outlive the session. They are kept in
 * IndexedDB because a 33³ table is 142 KB of floats — the wrong shape for
 * localStorage and the wrong place for the undo document.
 */

const CUBE = [
  'TITLE "回归滤镜"',
  'LUT_3D_SIZE 2',
  '0 0 0',
  '1 0 0',
  '0 1 0',
  '1 1 0',
  '0 0 1',
  '1 0 1',
  '0 1 1',
  '1 1 1',
].join('\n');

const openPhoto = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => !!window.__grade);
  await page.evaluate(async () => {
    const card = document.createElement('canvas');
    card.width = 64;
    card.height = 64;
    const ctx = card.getContext('2d')!;
    ctx.fillStyle = '#606060';
    ctx.fillRect(0, 0, 64, 64);
    window.__grade!.open(await createImageBitmap(card), 'lut-test.png');
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline && !window.__grade!.renderer()?.sourceSize) {
      await new Promise((r) => setTimeout(r, 20));
    }
  });
  await page.locator('.panel .tab', { hasText: '滤镜' }).click();
};

test('an imported .cube survives a reload, and can be removed', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('latent'));
  await page.reload();
  await openPhoto(page);

  await page.locator('.panel__group input[type=file]').setInputFiles({
    name: 'test.cube',
    mimeType: 'text/plain',
    buffer: Buffer.from(CUBE, 'utf8'),
  });

  const chip = page.locator('.chip', { hasText: '回归滤镜' });
  await expect(chip).toBeVisible();

  // The table is in the database, not only in React state.
  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('latent', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const { promise, resolve, reject } = Promise.withResolvers<number>();
    const tx = db.transaction('luts', 'readonly');
    const all = tx.objectStore('luts').getAll();
    all.onsuccess = () => resolve((all.result as unknown[]).length);
    all.onerror = () => reject(all.error);
    return promise;
  });
  expect(stored).toBe(1);

  await page.reload();
  await openPhoto(page);
  await expect(page.locator('.chip', { hasText: '回归滤镜' })).toBeVisible();

  // Hover reveals the remove affordance; removing it must also clear storage.
  const restored = page.locator('.chip', { hasText: '回归滤镜' });
  await restored.hover();
  await restored.locator('.chip__remove').click();
  await expect(page.locator('.chip', { hasText: '回归滤镜' })).toHaveCount(0);

  await page.reload();
  await openPhoto(page);
  await expect(page.locator('.chip', { hasText: '回归滤镜' })).toHaveCount(0);
});
