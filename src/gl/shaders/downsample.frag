#version 300 es
precision highp float;

// Half-resolution reduction: four bilinear taps read sixteen source pixels.
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSrc;
uniform vec2 uTexel; // one source texel, in uv
uniform float uThreshold; // 0 keeps everything; above 0 keeps only highlights

void main() {
  vec3 sum = texture(uSrc, vUv + uTexel * vec2(-0.5, -0.5)).rgb;
  sum += texture(uSrc, vUv + uTexel * vec2(0.5, -0.5)).rgb;
  sum += texture(uSrc, vUv + uTexel * vec2(-0.5, 0.5)).rgb;
  sum += texture(uSrc, vUv + uTexel * vec2(0.5, 0.5)).rgb;
  vec3 c = sum * 0.25;
  // Threshold BEFORE the blur, so the light has somewhere to spill to.
  if (uThreshold > 0.0) c = max(c - uThreshold, vec3(0.0)) / max(1.0 - uThreshold, 1e-3);
  fragColor = vec4(c, 1.0);
}
