/**
 * Text is rasterised once into a canvas and uploaded as a texture: the shader
 * can scale, rotate, tile and fade it, but it cannot set type.
 */
const RASTER_HEIGHT = 320;

export interface Raster {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

const scratch = document.createElement('canvas');
scratch.width = 8;
scratch.height = 8;

export function rasterText(text: string, colour: string, weight = 600): Raster | null {
  const content = text.trim();
  if (!content) return null;

  const ctx = scratch.getContext('2d');
  if (!ctx) return null;

  const font = `${weight} ${RASTER_HEIGHT}px "Inter Variable", Inter, system-ui, sans-serif`;
  ctx.font = font;
  const metrics = ctx.measureText(content);
  const padding = Math.ceil(RASTER_HEIGHT * 0.18);
  const width = Math.max(8, Math.ceil(metrics.width) + padding * 2);
  const height = Math.ceil(RASTER_HEIGHT * 1.45);

  scratch.width = width;
  scratch.height = height;

  const draw = scratch.getContext('2d');
  if (!draw) return null;
  draw.clearRect(0, 0, width, height);
  draw.font = font;
  draw.fillStyle = colour;
  draw.textAlign = 'left';
  draw.textBaseline = 'middle';
  draw.fillText(content, padding, height / 2);

  return { canvas: scratch, width, height };
}

/** A cropped copy of an uploaded image, so the texture stays a sane size. */
export function rasterImage(bitmap: ImageBitmap, maxEdge = 1024): Raster {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
  }
  return { canvas, width, height };
}
