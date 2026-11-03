import { expect, test } from '@playwright/test';

/**
 * Undo has one job: get the pixels back. A drag is one step, a preset tween is
 * one step, and redo lands exactly where undo left off.
 */

const CARD = `
  const card = document.createElement('canvas');
  card.width = 64;
  card.height = 64;
  const ctx = card.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 64, 64);
  g.addColorStop(0, '#102030');
  g.addColorStop(1, '#e0d0c0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return card;
`;

type Probe = {
  open: () => Promise<void>;
  setSlider: (selector: string, value: number) => void;
  snapshot: () => Uint8ClampedArray;
  diff: (a: Uint8ClampedArray, b: Uint8ClampedArray) => number;
};

test('a drag is one step, a preset is one step, and redo restores it', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__grade);

  const result = await page.evaluate(async (cardSource) => {
    const build = new Function(`${cardSource}`) as () => HTMLCanvasElement;
    window.__grade!.open(await createImageBitmap(build()), 'history.png');
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline && !window.__grade!.renderer()?.sourceSize) {
      await new Promise((r) => setTimeout(r, 20));
    }
    await new Promise((r) => requestAnimationFrame(r));

    const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const snap = (): Uint8ClampedArray => window.__grade!.snapshot()!.data;
    const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
      let max = 0;
      for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i]! - b[i]!));
      return max;
    };
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    const type = (selector: string, value: number): void => {
      const el = document.querySelector<HTMLInputElement>(selector)!;
      setter.call(el, String(value));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const original = snap();

    // One drag: 24 events on the same slider, faster than the coalesce window.
    for (let i = 0; i < 24; i++) type('#adjust-contrast', (i + 1) / 40);
    await frame();
    const dragged = snap();

    document.querySelector<HTMLButtonElement>('.panel__action')!.click(); // 撤销
    await frame();
    const afterUndo = snap();

    document.querySelectorAll<HTMLButtonElement>('.panel__action')[1]!.click(); // 重做
    await frame();
    const afterRedo = snap();

    // A preset tween must also be a single step.
    [...document.querySelectorAll<HTMLButtonElement>('.tile__button')][5]!.click();
    await new Promise((r) => setTimeout(r, 800));
    const preset = snap();
    document.querySelector<HTMLButtonElement>('.panel__action')!.click();
    await frame();
    const afterPresetUndo = snap();

    return {
      changedByDrag: diff(original, dragged),
      dragUndone: diff(original, afterUndo),
      redone: diff(dragged, afterRedo),
      changedByPreset: diff(original, preset),
      presetUndone: diff(dragged, afterPresetUndo),
    };
  }, CARD);

  expect(result.changedByDrag).toBeGreaterThan(0);
  expect(result.dragUndone, 'one undo must clear the whole drag').toBe(0);
  expect(result.redone, 'redo must restore the dragged state exactly').toBe(0);
  expect(result.changedByPreset).toBeGreaterThan(0);
  expect(result.presetUndone, 'a preset tween is one step').toBe(0);
});
