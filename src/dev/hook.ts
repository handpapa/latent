import type { WebGLRenderer } from '../gl/renderer';
import { invalidate } from '../motion/ticker';

/**
 * Dev-only handle used by the golden-image harness: it opens images through the
 * same path the user does and reads pixels back through the same encode pass.
 * Never shipped — main.tsx installs it only when import.meta.env.DEV.
 */
export interface DevHandle {
  open: (bitmap: ImageBitmap, name?: string) => void;
  renderer: () => WebGLRenderer | null;
  snapshot: () => ImageData | null;
  invalidate: () => void;
}

let renderer: WebGLRenderer | null = null;
let opener: ((bitmap: ImageBitmap, name: string) => void) | null = null;

export function registerRenderer(next: WebGLRenderer | null): void {
  renderer = next;
}

export function registerOpener(fn: (bitmap: ImageBitmap, name: string) => void): void {
  opener = fn;
}

declare global {
  interface Window {
    __grade?: DevHandle;
  }
}

export function installDevHook(): void {
  window.__grade = {
    open: (bitmap, name = 'test') => opener?.(bitmap, name),
    renderer: () => renderer,
    snapshot: () => renderer?.snapshot() ?? null,
    invalidate,
  };
}
