import { type AdjustParams } from '../core/adjust';
import type { Lut3D } from '../core/cube';
import { bakeCurveLut, curvesAreLinear, type Curves } from '../core/curve';
import { IDENTITY_EDIT, hslToRgb, type EditState, type GradeZone } from '../core/edit';
import { frameLayout, hexToRgb, isFramed, type FrameLayout } from '../core/frame';
import { markRect } from '../core/watermark';

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

type Camera =
  | { mode: 'fit' }
  | { mode: 'free'; zoom: number; centreX: number; centreY: number };

interface ViewRect {
  /** Which slice of the composed image this draw covers. */
  offset: readonly [number, number];
  scale: readonly [number, number];
  /** Which slice of the photograph the develop buffer holds. */
  window: readonly [number, number, number, number];
}

const IDENTITY_VIEW: ViewRect = { offset: [0, 0], scale: [1, 1], window: [0, 0, 1, 1] };

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

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
  private frameTex: WebGLTexture | null = null;
  private frameSlice: [number, number, number, number] | null = null;

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
  private developed: { edit: EditState; w: number; h: number; win: [number, number, number, number] } | null = null;

  private edit: EditState = IDENTITY_EDIT;
  private gutter = 0;

  /** Fit to the window, or a free camera in composed uv + device-px zoom. */
  private camera: Camera = { mode: 'fit' };
  private lastView: { x: number; y: number; w: number; h: number; zoom: number } | null = null;
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

  /** The 9-slice border image for the current asset frame. */
  setFrameAsset(source: TexImageSource | null, slice: { t: number; r: number; b: number; l: number } | null): void {
    if (!source || !slice) {
      this.frameTex = null;
      this.frameSlice = null;
      return;
    }
    const gl = this.gl;
    if (!this.frameTex) {
      const tex = gl.createTexture();
      if (!tex) throw new Error('无法创建边框纹理');
      this.frameTex = tex;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.frameTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.frameSlice = [slice.l, slice.t, slice.r, slice.b];
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
    const view = this.viewFor(layout, cw, ch);
    if (!view) return;
    this.lastView = view;

    const lo = { x: layout.fractions.l, y: layout.fractions.t };
    const hi = { x: 1 - layout.fractions.r, y: 1 - layout.fractions.b };
    const spanX = Math.max(1e-4, hi.x - lo.x);
    const spanY = Math.max(1e-4, hi.y - lo.y);

    // Only the part of the photograph that is actually on screen is developed.
    const px0 = clamp01((view.gx0 - lo.x) / spanX);
    const px1 = clamp01((view.gx1 - lo.x) / spanX);
    const py0 = clamp01((view.gy0 - lo.y) / spanY);
    const py1 = clamp01((view.gy1 - lo.y) / spanY);
    const winW = Math.max(1e-4, px1 - px0);
    const winH = Math.max(1e-4, py1 - py0);

    const devW = Math.max(1, Math.min(Math.ceil(view.vw), Math.ceil(winW * layout.photo.w)));
    const devH = Math.max(1, Math.min(Math.ceil(view.vh), Math.ceil(winH * layout.photo.h)));

    const target = this.ensurePreviewTarget(devW, devH);
    if (
      !this.developed ||
      this.developed.edit !== this.edit ||
      this.developed.w !== devW ||
      this.developed.h !== devH ||
      this.developed.win[0] !== px0 ||
      this.developed.win[1] !== py0 ||
      this.developed.win[2] !== winW ||
      this.developed.win[3] !== winH
    ) {
      this.developInto(this.linear, target, this.edit, [px0, py0, winW, winH]);
      this.developed = { edit: this.edit, w: devW, h: devH, win: [px0, py0, winW, winH] };
      this.develops++;
    }

    const finished = this.runEffects(target, this.edit);
    gl.viewport(view.vx, view.vy, view.vw, view.vh);
    this.drawEncode(this.encodeScreen, finished.tex, this.edit, {
      offset: [view.gx0, view.gy0],
      scale: [view.gx1 - view.gx0, view.gy1 - view.gy0],
      window: [px0, py0, winW, winH],
    });
    this.frames++;
  }

  /** Encode plus the finishing pass: filter, vignette, grain. Shared by the
   *  screen, the export readback and the colour-card thumbnails, so a card shows
   *  exactly what applying it will produce. */
  private drawEncode(
    program: Program,
    source: WebGLTexture,
    edit: EditState,
    view: ViewRect = IDENTITY_VIEW,
  ): void {
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
      .sampler('uFrameTex', 4)
      .float('uFrameTexActive', this.frameTex && edit.frame.kind === 'asset' ? 1 : 0)
      .vec4(
        'uFrameSlice',
        this.frameSlice?.[0] ?? 0.25,
        this.frameSlice?.[1] ?? 0.25,
        this.frameSlice?.[2] ?? 0.25,
        this.frameSlice?.[3] ?? 0.25,
      )
      .vec3('uPageColor', STAGE_RGB[0], STAGE_RGB[1], STAGE_RGB[2])
      .vec2('uOutOffset', view.offset[0], view.offset[1])
      .vec2('uOutScale', view.scale[0], view.scale[1])
      .vec4('uSrcWindow', view.window[0], view.window[1], view.window[2], view.window[3])
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
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.frameTex);
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

  private layoutNow(): FrameLayout | null {
    const src = this.src;
    return src ? frameLayout(src.w, src.h, this.edit.frame) : null;
  }

  private viewFor(layout: FrameLayout, cw: number, ch: number) {
    const g = this.gutter;
    const fit = Math.min((cw - g * 2) / layout.width, (ch - g * 2) / layout.height, 1);
    const zoom = this.camera.mode === 'fit' ? fit : this.camera.zoom;
    const rectW = Math.max(1, layout.width * zoom);
    const rectH = Math.max(1, layout.height * zoom);

    let rectX: number;
    let rectY: number;
    if (this.camera.mode === 'fit') {
      rectX = (cw - rectW) / 2;
      rectY = (ch - rectH) / 2;
    } else {
      rectX = cw / 2 - this.camera.centreX * rectW;
      rectY = ch / 2 - this.camera.centreY * rectH;
      rectX = rectW <= cw ? (cw - rectW) / 2 : Math.min(0, Math.max(cw - rectW, rectX));
      rectY = rectH <= ch ? (ch - rectH) / 2 : Math.min(0, Math.max(ch - rectH, rectY));
    }

    const vx = Math.max(0, Math.round(rectX));
    const vy = Math.max(0, Math.round(rectY));
    const vx1 = Math.min(cw, Math.round(rectX + rectW));
    const vy1 = Math.min(ch, Math.round(rectY + rectH));
    if (vx1 <= vx || vy1 <= vy) return null;

    return {
      x: rectX,
      y: rectY,
      w: rectW,
      h: rectH,
      zoom,
      vx,
      vy,
      vw: vx1 - vx,
      vh: vy1 - vy,
      gx0: (vx - rectX) / rectW,
      gy0: (vy - rectY) / rectH,
      gx1: (vx1 - rectX) / rectW,
      gy1: (vy1 - rectY) / rectH,
    };
  }

  /** True when the camera is free (zoomed or panned) rather than fitted. */
  isFree(): boolean {
    return this.camera.mode === 'free';
  }

  /** Effective device pixels per composed pixel. */
  effectiveZoom(): number {
    return this.lastView?.zoom ?? 1;
  }

  zoomToFit(): number {
    this.camera = { mode: 'fit' };
    return this.pendingZoom();
  }

  /** One composed pixel per device pixel: the only scale where grain and clarity
   *  can be judged. */
  zoomToActual(): number {
    const centre = this.centreNow();
    this.camera = { mode: 'free', zoom: 1, centreX: centre.x, centreY: centre.y };
    return 1;
  }

  zoomAt(factor: number, deviceX: number, deviceY: number): number {
    const layout = this.layoutNow();
    if (!layout) return this.effectiveZoom();
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const view = this.viewFor(layout, cw, ch);
    if (!view) return this.effectiveZoom();

    const anchorX = (deviceX - view.x) / view.w;
    const anchorY = (deviceY - view.y) / view.h;
    const next = Math.min(8, Math.max(0.05, view.zoom * factor));
    this.camera = {
      mode: 'free',
      zoom: next,
      centreX: clamp01(anchorX - (deviceX - cw / 2) / (layout.width * next)),
      centreY: clamp01(anchorY - (deviceY - ch / 2) / (layout.height * next)),
    };
    return next;
  }

  panBy(deviceDx: number, deviceDy: number): number {
    const layout = this.layoutNow();
    if (!layout) return this.effectiveZoom();
    const view = this.viewFor(layout, this.canvas.width, this.canvas.height);
    if (!view) return this.effectiveZoom();
    const centre = this.centreNow();
    this.camera = {
      mode: 'free',
      zoom: view.zoom,
      centreX: clamp01(centre.x - deviceDx / view.w),
      centreY: clamp01(centre.y - deviceDy / view.h),
    };
    return view.zoom;
  }

  private centreNow(): { x: number; y: number } {
    if (this.camera.mode === 'free') return { x: this.camera.centreX, y: this.camera.centreY };
    return { x: 0.5, y: 0.5 };
  }

  private pendingZoom(): number {
    const layout = this.layoutNow();
    if (!layout) return this.effectiveZoom();
    const g = this.gutter;
    return Math.min(
      (this.canvas.width - g * 2) / layout.width,
      (this.canvas.height - g * 2) / layout.height,
      1,
    );
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
    if (this.frameTex) this.gl.deleteTexture(this.frameTex);
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
