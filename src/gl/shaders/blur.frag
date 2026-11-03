#version 300 es
precision highp float;

// Separable gaussian, nine taps. Run twice with the axis swapped; the whole
// blur chain is two of these per level, which is why clarity, glow and soft
// focus can share one implementation.
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSrc;
uniform vec2 uStep; // texel step along the axis being blurred

const float WEIGHTS[5] = float[5](0.2270270, 0.1945946, 0.1216216, 0.0540540, 0.0162162);

void main() {
  vec3 sum = texture(uSrc, vUv).rgb * WEIGHTS[0];
  for (int i = 1; i < 5; i++) {
    vec2 offset = uStep * float(i);
    sum += texture(uSrc, vUv + offset).rgb * WEIGHTS[i];
    sum += texture(uSrc, vUv - offset).rgb * WEIGHTS[i];
  }
  fragColor = vec4(sum, 1.0);
}
