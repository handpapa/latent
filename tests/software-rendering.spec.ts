import { expect, test } from '@playwright/test';

/**
 * WebView2 silently falls back to CPU rasterisation when the driver is
 * blocklisted, which reads as "the app is broken" rather than "the GPU is
 * unavailable". Forcing SwiftShader proves the detection actually fires.
 */
test.use({
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
});

test('software rasterisation is detected and surfaced', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  const caps = await page.evaluate(() => window.__grade!.renderer()?.caps ?? null);
  expect(caps).not.toBeNull();
  expect(caps!.software, `renderer string was: ${caps!.renderer}`).toBe(true);

  await expect(page.locator('.topbar__meta .notice')).toContainText('软件渲染');
});
