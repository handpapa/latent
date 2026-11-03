import { gsap } from 'gsap';

/**
 * One clock for the whole app. GSAP's ticker drives the frame, but the frame only
 * runs when something asked for it — an editor that redraws a 24MP canvas at
 * 60 Hz while idle is a laptop with a hot lap.
 */
let renderFn: (() => void) | null = null;
let dirty = true;
let attached = false;
function tick(): void {
  if (!dirty || !renderFn) return;
  dirty = false;
  renderFn();
}

export function bindRender(fn: () => void): () => void {
  renderFn = fn;
  dirty = true;
  if (!attached) {
    gsap.ticker.add(tick);
    attached = true;
  }
  return () => {
    if (renderFn === fn) renderFn = null;
  };
}

export function invalidate(): void {
  dirty = true;
}

