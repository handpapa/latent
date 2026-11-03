#version 300 es
// Quad for passes that write into an offscreen target.
//
// Storage convention for every render target in this app: row 0 holds the TOP
// row of the image, same as a decoded source texture. That is why vUv is not
// flipped here — a flip here plus a flip at the present stage cancels out and
// produces an upside-down photograph that still passes a "colours are right" check.
out vec2 vUv;

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
