// sRGB transfer functions, IEC 61966-2-1 — the piecewise definition, not a 2.2 gamma.
// Every pass must say which space it works in: linear light or sRGB-encoded.

vec3 srgbToLinear(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  bvec3 lo = lessThanEqual(c, vec3(0.04045));
  vec3 a = c / 12.92;
  vec3 b = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(b, a, vec3(lo));
}

vec3 linearToSrgb(vec3 c) {
  c = max(c, vec3(0.0));
  bvec3 lo = lessThanEqual(c, vec3(0.0031308));
  vec3 a = c * 12.92;
  vec3 b = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(b, a, vec3(lo));
}
