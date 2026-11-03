export type ExportFormat = 'png' | 'jpeg' | 'webp';

export interface ExportOptions {
  format: ExportFormat;
  /** Ignored by PNG. */
  quality: number;
}

const MIME: Record<ExportFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * Encodes the finished frame. `putImageData` ignores compositing and writes the
 * alpha channel, so a lossy format gets the picture drawn over white rather than
 * a black rectangle where the mat's rounded corners were transparent.
 */
export async function encodeImage(image: ImageData, options: ExportOptions): Promise<Blob> {
  const source = new OffscreenCanvas(image.width, image.height);
  const sourceContext = source.getContext('2d');
  if (!sourceContext) throw new Error('无法创建离屏画布');
  sourceContext.putImageData(image, 0, 0);

  const target = new OffscreenCanvas(image.width, image.height);
  const context = target.getContext('2d');
  if (!context) throw new Error('无法创建离屏画布');

  if (options.format !== 'png') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, image.width, image.height);
  }
  context.drawImage(source, 0, 0);

  return target.convertToBlob({
    type: MIME[options.format],
    quality: options.format === 'png' ? undefined : options.quality,
  });
}

export function exportName(photoName: string | null, format: ExportFormat): string {
  const base = (photoName ?? 'latent').replace(/\.[^.]+$/, '');
  const extension = format === 'jpeg' ? 'jpg' : format;
  return `${base}-latent.${extension}`;
}
