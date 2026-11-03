#version 300 es
// Quad for the final draw to the canvas. The default framebuffer's row 0 is the
// BOTTOM of the window, so this is the one place that flips v. Never use it for
// an offscreen target: those store top-down (see quad.vert).
out vec2 vUv;

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = vec2(p.x, 1.0 - p.y);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
