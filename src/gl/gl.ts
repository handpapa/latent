/** The stage colour behind a photo. Mirrors --stage (#101010) in tokens.css: uniform,
 *  one step above the chrome so the photo's edge is visible even on a black image. */
export const STAGE_RGB: readonly [number, number, number] = [0x10 / 255, 0x10 / 255, 0x10 / 255];

export interface GlCaps {
  renderer: string;
  vendor: string;
  maxTextureSize: number;
  /** RGBA16F render targets — without it the linear buffer falls back to 8-bit. */
  floatColorBuffer: boolean;
  /** True when WebView2/Chromium fell back to CPU rasterisation. */
  software: boolean;
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|basic render|software raster/i;

export function createContext(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('WebGL2 不可用：这台机器的 WebView 没有硬件图形上下文。');
  return gl;
}

export function probe(gl: WebGL2RenderingContext): GlCaps {
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(
    (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) ?? '',
  );
  const vendor = String(
    (dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)) ?? '',
  );
  return {
    renderer,
    vendor,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    floatColorBuffer: !!gl.getExtension('EXT_color_buffer_float'),
    software: SOFTWARE.test(`${renderer} ${vendor}`),
  };
}
