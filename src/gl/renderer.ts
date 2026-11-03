import { type AdjustParams } from '../core/adjust';
import type { Lut3D } from '../core/cube';
import { bakeCurveLut, curvesAreLinear, type Curves } from '../core/curve';
import { IDENTITY_EDIT, hslToRgb, type EditState, type GradeZone } from '../core/edit';
import { frameLayout, hexToRgb, isFramed } from '../core/frame';
import { markRect } from '../core/watermark';
import { fitRect } from './fit';
import { probe, STAGE_RGB, type GlCaps } from './gl';
import { link, type Program } from './shader';
import { createTarget, disposeTarget, uploadImage, type RenderTarget, type Texture2D } from './texture';

import blurFrag from './shaders/blur.frag?raw';
import compositeFrag from './shaders/composite.frag?raw';
import downsampleFrag from './shaders/downsample.frag?raw';
import linearFrag from './shaders/linear.frag?raw';
import presentFrag from './shaders/present.frag?raw';
import quadScreenVert from './shaders/quad-screen.vert?raw';
import quadVert from './shaders/quad.vert?raw';
import srgb from './shaders/srgb.glsl?raw';

/** uv window into the source: x, y, width, height in 0…1. */
type Crop = readonly [number, number, number, number];
const NO_CROP: Crop = [0, 0, 1, 1];

export class WebGLRenderer {
  readonly caps: GlCaps;

  private readonly linear: Program;
  private readonly encodeScreen: Program;
  private readonly encodeTarget: Program;
  private readonly downsample: Program;
  private readonly blur: Program;
  private readonly composite: Program;

  private src: Texture2D | null = null;
  private curveTex: WebGLTexture | null = null;
  private curveFor: Curves | null = null;
  private lutTex: WebGLTexture | null = null;
  private lutId: string | null = null;
  private lutSize = 33;
  private markTex: WebGLTexture | null = null;
  private markNatural: { width: number; height: number } | null = null;

  /** Blur chain targets, reused while the size stays the same. */
  private fx:
    | {
        half: RenderTarget;
        halfTemp: RenderTarget;
        wide: RenderTarget;
        wideTemp: RenderTarget;
        out: RenderTarget;
      }
    | null = null;

  /** Preview-resolution develop buffer. Sized to what is on screen, not to the
   *  file: a 24MP photo at 45% costs a quarter of the pixels to re-develop. */
  private lin: RenderTarget | null = null;
  private developed: { edit: EditState; w: number; h: number } | null = null;

  private edit: EditState = IDENTITY_EDIT;
  private gutter = 0;
  private lost = false;

  frames = 0;
  develops = 0;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.caps = probe(gl);
    this.linear = link(gl, quadVert, linearFrag, 'develop', { SRGB: srgb });
    this.encodeScreen = link(gl, quadScreenVert, presentFrag, 'encode-screen', { SRGB: srgb });
    this.encodeTarget = link(gl, quadVert, presentFrag, 'encode-target', { SRGB: srgb });
    this.downsample = link(gl, quadVert, downsampleFrag, 'downsample');
    this.blur = link(gl, quadVert, blurFrag, 'blur');
    this.composite = link(gl, quadVert, compositeFrag, 'composite');
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    canvas.addEventListener('webglcontextlost', this.onLost);
  }

  private onLost = (e: Event): void => {
    e.preventDefault();
    this.lost = true;
  };

  get sourceSize(): { width: number; height: number } | null {
    return this.src ? { width: this.src.w, height: this.src.h } : null;
  }

  setSource(bitmap: ImageBitmap): void {
    const gl = this.gl;
    const max = this.caps.maxTextureSize;
    if (bitmap.width > max || bitmap.height > max) {
      throw new Error(`照片 ${bitmap.width}×${bitmap.height} 超过单张纹理上限 ${max}。`);
    }
    this.releaseSource();
    this.src = uploadImage(gl, bitmap);
    this.frames = 0;
  }

  setEdit(edit: EditState): void {
    this.edit = edit;
  }

  /** The rasterised mark: a canvas of text, or an uploaded image. */
  setWatermark(source: TexImageSource | null, natural: { width: number; height: number } | null): void {
    if (!source || !natural) {
      this.markNatural = null;
      return;
    }
    const gl = this.gl;
    if (!this.markTex) {
      const tex = gl.createTexture();
      if (!tex) throw new Error('无法创建水印纹理');
      this.markTex = tex;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.markTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.markNatural = natural;
  }

  setGutter(devicePixels: number): void {
    this.gutter = Math.max(0, Math.round(devicePixels));
  }

  /** The table itself never enters the document, so it is handed over separately. */
  setLut(id: string | null, doc: Lut3D | null): void {
    this.lutId = doc ? id : null;
    if (!doc) return;
    this.lutSize = doc.size;
    const gl = this.gl;
    if (!this.lutTex) {
      const tex = gl.createTexture();
      if (!tex) throw new Error('无法创建 LUT 纹理');
      this.lutTex = tex;
      gl.bindTexture(gl.TEXTURE_3D, tex);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    }
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.RGBA16F,
      doc.size,
      doc.size,
      doc.size,
      0,
      gl.RGBA,
      gl.FLOAT,
      doc.data,
    );
    gl.bindTexture(gl.TEXTURE_3D, null);
  }

  render(): void {
    if (this.lost) return;
    const gl = this.gl;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(STAGE_RGB[0], STAGE_RGB[1], STAGE_RGB[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const src = this.src;
    if (!src) return;

    // The frame enlarges what is fitted: the photo shrinks inside the board.
    const layout = frameLayout(src.w, src.h, this.edit.frame);
    const rect = fitRect(layout.width, layout.height, cw, ch, this.gutter);
    const w = Math.max(1, Math.round(rect.w * (layout.photo.w / layout.width)));
    const h = Math.max(1, Math.round(rect.h * (layout.photo.h / layout.height)));

    const target = this.ensurePreviewTarget(w, h);
    if (!this.developed || this.developed.edit !== this.edit || this.developed.w !== w || this.developed.h !== h) {
      this.developInto(this.linear, target, this.edit, NO_CROP);
      this.developed = { edit: this.edit, w, h };
      this.develops++;
    }

    const finished = this.runEffects(target, this.edit);
    gl.viewport(rect.x, rect.y, rect.w, rect.h);
    this.drawEncode(this.encodeScreen, finished.tex, this.edit);
    this.frames++;
  }

  /** Encode plus the finishing pass: filter, vignette, grain. Shared by the
   *  screen, the export readback and the colour-card thumbnails, so a card shows
   *  exactly what applying it will produce. */
  private drawEncode(program: Program, source: WebGLTexture, edit: EditState): void {
    const gl = this.gl;
    const lutReady = this.lutTex !== null && this.lutId !== null && edit.lut.id === this.lutId;
    const src = this.src;
    const layout = src ? frameLayout(src.w, src.h, edit.frame) : null;
    const framed = src ? isFramed(edit.frame) : false;
    const mat = hexToRgb(edit.frame.color);
    const mark = layout && this.markNatural ? markRect(layout, edit.watermark, this.markNatural) : null;
    program
      .use()
      .sampler('uSrc', 0)
      .sampler('uLut', 2)
      .float('uFrameActive', framed ? 1 : 0)
      .vec4(
        'uFrameInsets',
        layout?.fractions.l ?? 0,
        layout?.fractions.t ?? 0,
        layout?.fractions.r ?? 0,
        layout?.fractions.b ?? 0,
      )
      .float('uFrameRadius', layout && layout.height > 0 ? layout.radius / layout.height : 0)
      .float('uFrameAspect', layout && layout.height > 0 ? layout.width / layout.height : 1)
      .vec3('uFrameColor', mat[0], mat[1], mat[2])
      .vec3('uPageColor', STAGE_RGB[0], STAGE_RGB[1], STAGE_RGB[2])
      .sampler('uMark', 3)
      .float('uMarkActive', mark ? 1 : 0)
      .vec4('uMarkRect', mark?.x ?? 0, mark?.y ?? 0, mark?.w ?? 1, mark?.h ?? 1)
      .float('uMarkOpacity', edit.watermark.opacity)
      .float('uMarkAngle', mark?.angle ?? 0)
      .float('uMarkTile', mark?.tile ? 1 : 0)
      .float('uLutActive', lutReady ? 1 : 0)
      .float('uLutSize', this.lutSize)
      .float('uLutIntensity', edit.lut.intensity)
      .float('uGrain', edit.fx.grain)
      .float('uVignette', edit.fx.vignette)
      .float('uDither', 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.markTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** The size the file will have — the frame included. */
  exportSize(): { width: number; height: number } | null {
    const src = this.src;
    if (!src) return null;
    const layout = frameLayout(src.w, src.h, this.edit.frame);
    return { width: Math.max(1, Math.round(layout.width)), height: Math.max(1, Math.round(layout.height)) };
  }

  /** The export path: the whole chain at full resolution, frame included. */
  exportImage(): ImageData | null {
    const size = this.exportSize();
    if (!size) return null;
    const limit = this.caps.maxTextureSize;
    if (size.width > limit || size.height > limit) {
      throw new Error(`输出 ${size.width}×${size.height} 超过 ${limit}px 的单张纹理上限。`);
    }
    return this.snapshot();
  }

  /** Full-resolution readback — the export path in miniature, and what the
   *  identity gate compares. Always re-develops at source size. */
  snapshot(): ImageData | null {
    const src = this.src;
    if (!src) return null;
    const gl = this.gl;
    const layout = frameLayout(src.w, src.h, this.edit.frame);
    const outW = Math.max(1, Math.round(layout.width));
    const outH = Math.max(1, Math.round(layout.height));
    const lin = createTarget(gl, src.w, src.h, this.caps.floatColorBuffer);
    const out = createTarget(gl, outW, outH, false);
    try {
      this.developInto(this.linear, lin, this.edit, NO_CROP);
      this.develops++;
      const finished = this.runEffects(lin, this.edit);
      gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
      gl.viewport(0, 0, outW, outH);
      this.drawEncode(this.encodeTarget, finished.tex, this.edit);

      const raw = new Uint8Array(outW * outH * 4);
      gl.readPixels(0, 0, outW, outH, gl.RGBA, gl.UNSIGNED_BYTE, raw);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return new ImageData(new Uint8ClampedArray(raw.buffer), outW, outH);
    } finally {
      disposeTarget(gl, lin);
      disposeTarget(gl, out);
    }
  }

  /** `overrides` lets the colour cards render their own look without touching
   *  the document that is currently open. */
  thumbnails(edits: readonly EditState[], width: number, height: number): ImageData[] {
    const src = this.src;
    if (!src) return [];
    const gl = this.gl;
    const lin = createTarget(gl, width, height, this.caps.floatColorBuffer);
    const out = createTarget(gl, width, height, false);
    const crop = centreCrop(src.w / src.h, width / height);
    const pixels = new Uint8Array(width * height * 4);
    const images: ImageData[] = [];
    try {
      for (const edit of edits) {
        this.developInto(this.linear, lin, edit, crop);
        gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
        gl.viewport(0, 0, width, height);
        const finished = this.runEffects(lin, edit);
        this.drawEncode(this.encodeTarget, finished.tex, edit);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        images.push(new ImageData(new Uint8ClampedArray(pixels), width, height));
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return images;
    } finally {
      disposeTarget(gl, lin);
      disposeTarget(gl, out);
    }
  }

  private ensureFxTargets(w: number, h: number) {
    if (this.fx && this.fx.out.w === w && this.fx.out.h === h) return this.fx;
    const gl = this.gl;
    if (this.fx) {
      disposeTarget(gl, this.fx.half);
      disposeTarget(gl, this.fx.halfTemp);
      disposeTarget(gl, this.fx.wide);
      disposeTarget(gl, this.fx.wideTemp);
      disposeTarget(gl, this.fx.out);
    }
    const halfW = Math.max(1, w >> 1);
    const halfH = Math.max(1, h >> 1);
    const wideW = Math.max(1, halfW >> 1);
    const wideH = Math.max(1, halfH >> 1);
    const float = this.caps.floatColorBuffer;
    this.fx = {
      half: createTarget(gl, halfW, halfH, float),
      halfTemp: createTarget(gl, halfW, halfH, float),
      wide: createTarget(gl, wideW, wideH, float),
      wideTemp: createTarget(gl, wideW, wideH, float),
      out: createTarget(gl, w, h, float),
    };
    return this.fx;
  }

  /** Clarity, glow and soft focus, in linear light, from two blurred copies. */
  private runEffects(src: RenderTarget, edit: EditState): RenderTarget {
    if (edit.fx.clarity === 0 && edit.fx.glow === 0 && edit.fx.softness === 0) return src;
    const gl = this.gl;
    const t = this.ensureFxTargets(src.w, src.h);

    this.drawPass(this.downsample, t.half, src.tex, (p) =>
      p.vec2('uTexel', 1 / src.w, 1 / src.h).float('uThreshold', 0),
    );
    this.drawPass(this.blur, t.halfTemp, t.half.tex, (p) => p.vec2('uStep', 1.5 / t.half.w, 0));
    this.drawPass(this.blur, t.half, t.halfTemp.tex, (p) => p.vec2('uStep', 0, 1.5 / t.half.h));

    this.drawPass(this.downsample, t.wide, t.half.tex, (p) =>
      p.vec2('uTexel', 1 / t.half.w, 1 / t.half.h).float('uThreshold', edit.fx.glow > 0 ? 0.55 : 0),
    );
    this.drawPass(this.blur, t.wideTemp, t.wide.tex, (p) => p.vec2('uStep', 2.5 / t.wide.w, 0));
    this.drawPass(this.blur, t.wide, t.wideTemp.tex, (p) => p.vec2('uStep', 0, 2.5 / t.wide.h));

    gl.bindFramebuffer(gl.FRAMEBUFFER, t.out.fbo);
    gl.viewport(0, 0, t.out.w, t.out.h);
    this.composite
      .use()
      .sampler('uSrc', 0)
      .sampler('uMid', 1)
      .sampler('uWide', 2)
      .float('uClarity', edit.fx.clarity)
      .float('uGlow', edit.fx.glow)
      .float('uSoftness', edit.fx.softness);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, t.half.tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, t.wide.tex);
    gl.activeTexture(gl.TEXTURE0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return t.out;
  }

  private drawPass(
    program: Program,
    target: RenderTarget,
    source: WebGLTexture,
    uniforms: (program: Program) => void,
  ): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, target.w, target.h);
    program.use().sampler('uSrc', 0);
    uniforms(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private ensurePreviewTarget(w: number, h: number): RenderTarget {
    if (this.lin && this.lin.w === w && this.lin.h === h) return this.lin;
    disposeTarget(this.gl, this.lin);
    this.lin = createTarget(this.gl, w, h, this.caps.floatColorBuffer);
    this.developed = null;
    return this.lin;
  }

  /** The four curves are baked into a 256-wide row once per edit, not per frame. */
  private ensureCurveTexture(curves: Curves): WebGLTexture {
    if (this.curveTex && this.curveFor === curves) return this.curveTex;
    const gl = this.gl;
    if (!this.curveTex) {
      const tex = gl.createTexture();
      if (!tex) throw new Error('无法创建曲线纹理');
      this.curveTex = tex;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 256, 1, 0, gl.RGBA, gl.FLOAT, bakeCurveLut(curves));
    this.curveFor = curves;
    return this.curveTex;
  }

  /** Pass 1: sRGB bytes → linear light → the edit → linear light → target. */
  private developInto(program: Program, target: RenderTarget, edit: EditState, crop: Crop): void {
    const gl = this.gl;
    const src = this.src;
    if (!src) return;
    const a: AdjustParams = edit.adjust;
    const hsl = new Float32Array(24);
    edit.hsl.forEach((band, i) => {
      hsl[i * 3] = band.hue;
      hsl[i * 3 + 1] = band.saturation;
      hsl[i * 3 + 2] = band.luminance;
    });
    const grade = new Float32Array(9);
    [edit.grade.shadows, edit.grade.midtones, edit.grade.highlights].forEach((zone, i) => {
      const offset = gradeChroma(zone);
      grade[i * 3] = offset[0];
      grade[i * 3 + 1] = offset[1];
      grade[i * 3 + 2] = offset[2];
    });

    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, target.w, target.h);
    program
      .use()
      .sampler('uSrc', 0)
      .sampler('uCurve', 1)
      .vec4('uCrop', crop[0], crop[1], crop[2], crop[3])
      .vec4('uTone', a.shadows, a.highlights, a.blacks, a.whites)
      .vec4('uColor', a.temperature, a.tint, a.vibrance, a.saturation)
      .float('uExposure', a.exposure)
      .float('uContrast', a.contrast)
      .float('uCurveActive', curvesAreLinear(edit.curves) ? 0 : 1)
      .float('uHslActive', edit.hsl.some((b) => b.hue || b.saturation || b.luminance) ? 1 : 0)
      .vec3Array('uHsl[0]', hsl)
      .vec3Array('uGrade[0]', grade);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.ensureCurveTexture(edit.curves));
    gl.activeTexture(gl.TEXTURE0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private releaseSource(): void {
    if (this.src) this.gl.deleteTexture(this.src.tex);
    disposeTarget(this.gl, this.lin);
    this.src = null;
    this.lin = null;
    this.developed = null;
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    if (this.fx) {
      disposeTarget(this.gl, this.fx.half);
      disposeTarget(this.gl, this.fx.halfTemp);
      disposeTarget(this.gl, this.fx.wide);
      disposeTarget(this.gl, this.fx.wideTemp);
      disposeTarget(this.gl, this.fx.out);
      this.fx = null;
    }
    this.releaseSource();
    if (this.curveTex) this.gl.deleteTexture(this.curveTex);
    if (this.lutTex) this.gl.deleteTexture(this.lutTex);
    if (this.markTex) this.gl.deleteTexture(this.markTex);
    this.linear.dispose();
    this.encodeScreen.dispose();
    this.encodeTarget.dispose();
    // The canvas keeps its context: a StrictMode remount reuses the same
    // element, and a lost context cannot be handed back to it.
  }
}

/** Centred crop of `sourceAspect` to `targetAspect`, as a uv window. */
function centreCrop(sourceAspect: number, targetAspect: number): Crop {
  if (sourceAspect > targetAspect) {
    const width = targetAspect / sourceAspect;
    return [(1 - width) / 2, 0, width, 1];
  }
  const height = sourceAspect / targetAspect;
  return [0, (1 - height) / 2, 1, height];
}

/** A zone's tint as a zero-luminance offset, pre-scaled, so the shader only
 *  adds. Keeping the hue in a pure chroma direction means grading the shadows
 *  does not also lift them. */
function gradeChroma(zone: GradeZone): [number, number, number] {
  if (zone.saturation <= 0) return [0, 0, 0];
  const rgb = hslToRgb(zone.hue / 360, 1, 0.5);
  const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const dir: [number, number, number] = [rgb[0] - luma, rgb[1] - luma, rgb[2] - luma];
  const magnitude = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const scale = (zone.saturation * 0.25) / magnitude;
  return [dir[0] * scale, dir[1] * scale, dir[2] * scale];
}
