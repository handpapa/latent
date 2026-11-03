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
uniform vec3 uPageColor;

uniform sampler2D uMark;
uniform float uMarkActive;
uniform vec4 uMarkRect; // x, y, w, h in composed uv
uniform float uMarkOpacity;
uniform float uMarkAngle; // radians
uniform float uMarkTile;

__SRGB__

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = vUv;
  vec3 colour = uPageColor;
  float alpha = 0.0;
  bool onPhoto = true;

  if (uFrameActive > 0.5) {
    // Rounded outer edge, measured in a space where x and y share a unit, so a
    // square photo and a wide one get the same corner radius.
    vec2 p = (vUv - 0.5) * vec2(uFrameAspect, 1.0);
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
    onPhoto = vUv.x >= lo.x && vUv.y >= lo.y && vUv.x <= hi.x && vUv.y <= hi.y;
    alpha = 1.0;
    if (onPhoto) uv = (vUv - lo) / (hi - lo);
    else colour = uFrameColor;
  } else {
    alpha = 1.0;
  }

  if (onPhoto) {
    vec3 c = linearToSrgb(texture(uSrc, uv).rgb);

    if (uLutActive > 0.5) {
      // Grid points are the INPUT colours, so the lookup must land on texel
      // centres: without the half-texel term an identity table is 2 LSB off.
      vec3 coord = (clamp(c, 0.0, 1.0) * (uLutSize - 1.0) + 0.5) / uLutSize;
      c = mix(c, texture(uLut, coord).rgb, clamp(uLutIntensity, 0.0, 1.0));
    }

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
    vec2 rel = (vUv - centre) * aspect;
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
