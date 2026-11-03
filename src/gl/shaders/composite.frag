#version 300 es
precision highp float;

// Local contrast, glow and soft focus, all in linear light, all from the same
// two blurred copies of the developed frame.
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSrc; // developed, full resolution
uniform sampler2D uMid; // blurred at half resolution
uniform sampler2D uWide; // blurred at quarter resolution
uniform float uClarity;
uniform float uGlow;
uniform float uSoftness;

const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);

void main() {
  vec3 c = texture(uSrc, vUv).rgb;

  if (uClarity != 0.0) {
    // Unsharp on luminance only: sharpening the channels individually pushes
    // colour fringes along every high-contrast edge.
    float luma = dot(c, LUM);
    float blurred = dot(texture(uMid, vUv).rgb, LUM);
    float target = max(luma + (luma - blurred) * uClarity * 1.6, 0.0);
    c *= target / max(luma, 1e-5);
  }

  if (uGlow > 0.0) {
    // uWide already holds only the highlights, blurred: adding it is the glow.
    c += texture(uWide, vUv).rgb * uGlow * 0.9;
  }

  if (uSoftness > 0.0) {
    c = mix(c, texture(uMid, vUv).rgb, uSoftness * 0.6);
  }

  fragColor = vec4(max(c, 0.0), 1.0);
}
