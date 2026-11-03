import type { FrameInsets } from './frame';

/**
 * A 9-slice border: four corners drawn at a fixed size, four edges stretched
 * between them, a transparent centre for the photograph to show through.
 *
 * The built-in sample is drawn in code — a dark band with a white hairline and a
 * square ornament in each corner. The ornament is the point: it is square in the
 * asset, and it must stay square whether the finished picture is wide, tall or
 * square. A border stretched as one image fails exactly there.
 */
export interface FrameAsset {
  id: string;
  name: string;
  /** Corner size as a fraction of the asset's own edge (0…0.5). */
  slice: FrameInsets;
  canvas: HTMLCanvasElement;
}

const ASSET_SIZE = 192;
const BAND = 48;
const SLICE = BAND / ASSET_SIZE;

function drawOrnamentFrame(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = ASSET_SIZE;
  canvas.height = ASSET_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // The band, four rectangles so the middle stays untouched and transparent.
  ctx.fillStyle = '#f3f0e9';
  ctx.fillRect(0, 0, ASSET_SIZE, BAND);
  ctx.fillRect(0, ASSET_SIZE - BAND, ASSET_SIZE, BAND);
  ctx.fillRect(0, 0, BAND, ASSET_SIZE);
  ctx.fillRect(ASSET_SIZE - BAND, 0, BAND, ASSET_SIZE);

  // Hairline just inside the band: the edge that must not thicken.
  ctx.strokeStyle = '#3a3630';
  ctx.lineWidth = 2;
  ctx.strokeRect(BAND + 1, BAND + 1, ASSET_SIZE - BAND * 2 - 2, ASSET_SIZE - BAND * 2 - 2);

  // One square ornament per corner, centred in its corner block. Amber, so it
  // reads apart from the hairline at a glance — and in a test.
  ctx.fillStyle = '#e5a93b';
  const size = 22;
  const offset = (BAND - size) / 2;
  for (const [x, y] of [
    [0, 0],
    [ASSET_SIZE - BAND, 0],
    [0, ASSET_SIZE - BAND],
    [ASSET_SIZE - BAND, ASSET_SIZE - BAND],
  ] as const) {
    ctx.fillRect(x + offset, y + offset, size, size);
  }

  return canvas;
}

export function builtinFrameAssets(): Record<string, FrameAsset> {
  const canvas = drawOrnamentFrame();
  return {
    ornament: {
      id: 'ornament',
      name: '角饰',
      slice: { t: SLICE, r: SLICE, b: SLICE, l: SLICE },
      canvas,
    },
  };
}
