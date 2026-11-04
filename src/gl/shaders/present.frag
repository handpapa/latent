#version 300 es
precision highp float;
precision highp sampler3D;

// Pass 2 — the painting pass. It composes the frame, encodes linear light back to
// sRGB, adds the things that belong to the finished picture (filter LUT,
// vignette, grain), and lays the watermark last, so a caption on the mat is not
// tinted by the photograph's grading.
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSrc;
uniform sampler3D uLut;
uniform float uLutActive;
uniform float uLutSize;
uniform float uLutIntensity;
uniform float uGrain;
uniform float uVignette;
uniform float uDither;

uniform float uFrameActive;
uniform vec4 uFrameInsets; // l, t, r, b as fractions of the composed image
uniform float uFrameRadius; // fraction of the composed height
uniform float uFrameAspect; // composed width / height
uniform vec3 uFrameColor;
uniform sampler2D uFrameTex;
uniform vec4 uFrameSlice; // 9-slice corner size, as a fraction of the asset
uniform float uFrameTexActive;
uniform vec3 uPageColor;

// Blur fill: the photograph's own out-of-focus self, covering the whole board.
uniform sampler2D uFrameBlur;
uniform float uFrameBlurActive;
uniform vec3 uFrameBlurParams; // strength, darken, desaturate
uniform vec2 uFrameCover; // cover fit of the photo into the composed rect

uniform sampler2D uMark;
uniform float uMarkActive;
uniform vec4 uMarkRect; // x, y, w, h in composed uv
uniform float uMarkOpacity;
uniform float uMarkAngle; // radians
uniform float uMarkTile;

// Which part of the composed image this draw covers, and which part of the
// photograph the develop buffer holds. Both are the identity when the picture
// is fitted to the window.
uniform vec2 uOutOffset;
uniform vec2 uOutScale;
uniform vec4 uSrcWindow;

__SRGB__

const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Grid points are the INPUT colours, so the lookup must land on texel centres:
// without the half-texel term an identity table is 2 LSB off.
vec3 mapLut(vec3 c) {
  if (uLutActive < 0.5) return c;
  vec3 coord = (clamp(c, 0.0, 1.0) * (uLutSize - 1.0) + 0.5) / uLutSize;
  return mix(c, texture(uLut, coord).rgb, clamp(uLutIntensity, 0.0, 1.0));
}

void main() {
  vec2 gUv = uOutOffset + vUv * uOutScale;
  vec2 uv = gUv;
  vec3 colour = uPageColor;
  float alpha = 0.0;
  bool onPhoto = true;

  if (uFrameActive > 0.5) {
    // Rounded outer edge, measured in a space where x and y share a unit, so a
    // square photo and a wide one get the same corner radius.
    vec2 p = (gUv - 0.5) * vec2(uFrameAspect, 1.0);
    vec2 halfSize = vec2(0.5 * uFrameAspect, 0.5);
    vec2 d = abs(p) - (halfSize - uFrameRadius);
    float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - uFrameRadius;
    if (dist > 0.0) {
      // Outside the board: the page shows through (alpha 0 for an export).
      fragColor = vec4(uPageColor, 0.0);
      return;
    }

    vec2 lo = uFrameInsets.xy;
    vec2 hi = 1.0 - uFrameInsets.zw;
    onPhoto = gUv.x >= lo.x && gUv.y >= lo.y && gUv.x <= hi.x && gUv.y <= hi.y;
    alpha = 1.0;
    if (onPhoto) {
      uv = (gUv - lo) / (hi - lo);
    } else if (uFrameTexActive > 0.5) {
      // Nine slices: the corners are copied at their own size and only the
      // edges stretch. Sampling the whole border as one image would smear the
      // corner ornament along whichever side is longer.
      vec2 sliceUv;
      sliceUv.x = gUv.x < lo.x
        ? (gUv.x / lo.x) * uFrameSlice.x
        : gUv.x > hi.x
          ? 1.0 - ((1.0 - gUv.x) / (1.0 - hi.x)) * (1.0 - uFrameSlice.z)
          : uFrameSlice.x + ((gUv.x - lo.x) / (hi.x - lo.x)) * (1.0 - uFrameSlice.x - uFrameSlice.z);
      sliceUv.y = gUv.y < lo.y
        ? (gUv.y / lo.y) * uFrameSlice.y
        : gUv.y > hi.y
          ? 1.0 - ((1.0 - gUv.y) / (1.0 - hi.y)) * (1.0 - uFrameSlice.w)
          : uFrameSlice.y + ((gUv.y - lo.y) / (hi.y - lo.y)) * (1.0 - uFrameSlice.y - uFrameSlice.w);
      vec4 border = texture(uFrameTex, clamp(sliceUv, 0.0, 1.0));
      colour = mix(uFrameColor, border.rgb, border.a);
    } else if (uFrameBlurActive > 0.5) {
      // The photograph, cover-fitted to the whole board and out of focus. The
      // filter is applied here too, so a sepia look does not leave a natural
      // coloured border around it.
      vec2 coverUv = clamp(0.5 + (gUv - 0.5) * uFrameCover, 0.0, 1.0);
      vec3 blurred = mapLut(linearToSrgb(texture(uFrameBlur, coverUv).rgb));
      float luma = dot(blurred, LUM);
      blurred = mix(blurred, vec3(luma), clamp(uFrameBlurParams.z, 0.0, 1.0));
      blurred *= 1.0 - clamp(uFrameBlurParams.y, 0.0, 1.0) * 0.6;
      colour = mix(uFrameColor, blurred, clamp(uFrameBlurParams.x, 0.0, 1.0));
    } else {
      colour = uFrameColor;
    }
  } else {
    alpha = 1.0;
  }

  if (onPhoto) {
    // The develop buffer may hold only the visible slice of the photograph.
    vec2 sampleUv = (uv - uSrcWindow.xy) / uSrcWindow.zw;
    vec3 c = linearToSrgb(texture(uSrc, sampleUv).rgb);
    c = mapLut(c);

    vec2 centred = (uv - 0.5) * 1.42;
    float falloff = smoothstep(0.55, 1.05, length(centred));
    c *= 1.0 - uVignette * falloff;

    if (uGrain > 0.0001) {
      float n = hash(gl_FragCoord.xy);
      c += (n - 0.5) * uGrain * 0.14;
    }

    c += (hash(gl_FragCoord.xy * 1.7 + 11.0) - 0.5) / 255.0 * uDither;
    colour = clamp(c, 0.0, 1.0);
  }

  if (uMarkActive > 0.5) {
    vec2 aspect = vec2(uFrameAspect, 1.0);
    vec2 centre = uMarkRect.xy + uMarkRect.zw * 0.5;
    vec2 rel = (gUv - centre) * aspect;
    float ca = cos(uMarkAngle);
    float sa = sin(uMarkAngle);
    vec2 rotated = vec2(ca * rel.x + sa * rel.y, -sa * rel.x + ca * rel.y);
    vec2 local = rotated / aspect;
    vec2 halfRect = uMarkRect.zw * 0.5;

    vec2 markUv;
    bool inside;
    if (uMarkTile > 0.5) {
      markUv = fract(local / uMarkRect.zw + 0.5);
      inside = true;
    } else {
      inside = abs(local.x) <= halfRect.x && abs(local.y) <= halfRect.y;
      markUv = local / uMarkRect.zw + 0.5;
    }

    if (inside) {
      vec4 mark = texture(uMark, markUv);
      colour = mix(colour, mark.rgb, mark.a * uMarkOpacity);
    }
  }

  fragColor = vec4(colour, alpha);
}
