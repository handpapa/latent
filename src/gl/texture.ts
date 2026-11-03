export interface Texture2D {
  tex: WebGLTexture;
  w: number;
  h: number;
}

export interface RenderTarget extends Texture2D {
  fbo: WebGLFramebuffer;
}

/** Upload a decoded image keeping its sRGB-encoded bytes untouched: the shader
 *  does the transfer function, the driver must not do a second one. */
export function uploadImage(gl: WebGL2RenderingContext, bitmap: ImageBitmap): Texture2D {
  const tex = gl.createTexture();
  if (!tex) throw new Error('createTexture 失败');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
  // Mipmaps, because the preview develops at screen resolution: without them a
  // 24MP file on a 1440px display samples one texel in four and shimmers.
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { tex, w: bitmap.width, h: bitmap.height };
}

/** Offscreen colour target. RGBA16F for every linear-light intermediate: 8-bit
 *  buffers band as soon as a curve or an HSL move touches them. */
export function createTarget(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  float: boolean,
): RenderTarget {
  const tex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  if (!tex || !fbo) throw new Error('createTarget 失败');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (float) {
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, w, h);
  } else {
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    throw new Error(`帧缓冲不完整（${float ? 'RGBA16F' : 'RGBA8'}，${w}×${h}）：0x${status.toString(16)}`);
  }
  return { tex, w, h, fbo };
}

export function disposeTarget(gl: WebGL2RenderingContext, t: RenderTarget | null): void {
  if (!t) return;
  gl.deleteFramebuffer(t.fbo);
  gl.deleteTexture(t.tex);
}
