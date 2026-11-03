#version 300 es
precision highp float;

// Pass 1 — the develop pass. Two spaces, on purpose:
//   linear        white balance, exposure, vibrance, saturation
//   display (sRGB) tone, curves, HSL, grading — everything the user judges by eye
// in this order:
//   white balance → exposure → tone → curves → HSL → grading → colour
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSrc;
uniform sampler2D uCurve; // 256×1: master(channel(x)) already composed
uniform vec4 uTone; // x shadows, y highlights, z blacks, w whites
uniform vec4 uColor; // x temperature, y tint, z vibrance, w saturation
uniform vec4 uCrop; // uv window: x, y, width, height
uniform float uExposure; // stops
uniform float uContrast;
uniform float uCurveActive;
uniform float uHslActive;
uniform vec3 uHsl[8]; // per band: hue shift, saturation scale, luminance scale
uniform vec3 uGrade[3]; // shadows, midtones, highlights: chroma offset

__SRGB__

const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
const float BAND_HUES[8] = float[8](0.0, 30.0, 60.0, 120.0, 180.0, 240.0, 280.0, 320.0);

vec3 whiteBalance(vec3 c, float temp, float tint) {
  vec3 gains = vec3(
    1.0 + 0.30 * temp + 0.10 * tint,
    1.0 - 0.14 * tint,
    1.0 - 0.30 * temp + 0.10 * tint
  );
  gains = max(gains, vec3(0.05));
  return c * gains / dot(gains, LUM);
}

float toneShape(float p, vec4 t) {
  float wShadows = 1.0 - smoothstep(0.0, 0.55, p);
  float wHighlights = smoothstep(0.45, 1.0, p);
  float wBlacks = 1.0 - smoothstep(0.0, 0.28, p);
  float wWhites = smoothstep(0.72, 1.0, p);

  p *= exp(t.x * 0.85 * wShadows + t.y * 0.85 * wHighlights);
  p += t.z * 0.10 * wBlacks + t.w * 0.10 * wWhites;
  return p;
}

vec3 applyCurve(vec3 e) {
  vec3 uv = (e * 255.0 + 0.5) / 256.0;
  return vec3(
    texture(uCurve, vec2(uv.r, 0.5)).r,
    texture(uCurve, vec2(uv.g, 0.5)).g,
    texture(uCurve, vec2(uv.b, 0.5)).b
  );
}

vec3 rgb2hsl(vec3 c) {
  float maxC = max(c.r, max(c.g, c.b));
  float minC = min(c.r, min(c.g, c.b));
  float l = (maxC + minC) * 0.5;
  float d = maxC - minC;
  float h = 0.0;
  float s = 0.0;
  if (d > 1e-5) {
    s = l > 0.5 ? d / max(2.0 - maxC - minC, 1e-5) : d / max(maxC + minC, 1e-5);
    if (maxC == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (maxC == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
  float tt = t;
  if (tt < 0.0) tt += 1.0;
  if (tt > 1.0) tt -= 1.0;
  if (tt < 1.0 / 6.0) return p + (q - p) * 6.0 * tt;
  if (tt < 0.5) return q;
  if (tt < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - tt) * 6.0;
  return p;
}

vec3 hsl2rgb(vec3 hsl) {
  if (hsl.y <= 1e-5) return vec3(hsl.z);
  float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
  float p = 2.0 * hsl.z - q;
  return vec3(
    hue2rgb(p, q, hsl.x + 1.0 / 3.0),
    hue2rgb(p, q, hsl.x),
    hue2rgb(p, q, hsl.x - 1.0 / 3.0)
  );
}

// Eight bands, weighted by angular distance and normalised, so a pixel between
// two bands receives a blend of both instead of a visible seam.
vec3 applyHsl(vec3 e) {
  vec3 hsl = rgb2hsl(e);
  float hueDeg = hsl.x * 360.0;
  float sum = 0.0;
  vec3 total = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float d = abs(hueDeg - BAND_HUES[i]);
    d = min(d, 360.0 - d);
    float w = max(0.0, 1.0 - d / 60.0);
    sum += w;
    total += w * uHsl[i];
  }
  if (sum > 1e-4) total /= sum;

  // Near-grey pixels have no hue to shift; fade the whole move out for them.
  float mask = smoothstep(0.0, 0.12, hsl.y);
  hsl.x = fract(hsl.x + total.x * 0.05 * mask);
  hsl.y = clamp(hsl.y * (1.0 + total.y * mask), 0.0, 1.0);
  hsl.z = clamp(hsl.z * (1.0 + total.z * 0.5), 0.0, 1.0);
  return hsl2rgb(hsl);
}

void main() {
  vec4 texel = texture(uSrc, uCrop.xy + vUv * uCrop.zw);
  vec3 c = srgbToLinear(texel.rgb);

  c = whiteBalance(c, uColor.x, uColor.y);
  c *= exp2(uExposure);

  vec3 e = linearToSrgb(max(c, 0.0));

  float luma = dot(e, LUM);
  if (luma > 1e-5) {
    float shaped = toneShape(luma, uTone);
    shaped = clamp((shaped - 0.5) * (1.0 + uContrast) + 0.5, 0.0, 1.0);
    e *= shaped / luma;
  }
  e = clamp(e, 0.0, 1.0);

  if (uCurveActive > 0.5) e = applyCurve(e);
  if (uHslActive > 0.5) e = applyHsl(e);

  float graded = dot(e, LUM);
  e += uGrade[0] * (1.0 - smoothstep(0.0, 0.55, graded));
  e += uGrade[1] * max(0.0, 1.0 - abs(graded - 0.5) * 2.6);
  e += uGrade[2] * smoothstep(0.45, 1.0, graded);
  e = clamp(e, 0.0, 1.0);

  c = srgbToLinear(e);

  float lumaNow = dot(c, LUM);
  float maxC = max(c.r, max(c.g, c.b));
  float minC = min(c.r, min(c.g, c.b));
  float chroma = maxC > 1e-5 ? (maxC - minC) / maxC : 0.0;
  c = mix(vec3(lumaNow), c, 1.0 + uColor.z * (1.0 - chroma) * 0.9);

  float lumaFinal = dot(c, LUM);
  c = mix(vec3(lumaFinal), c, 1.0 + uColor.w);

  fragColor = vec4(max(c, 0.0), texel.a);
}
