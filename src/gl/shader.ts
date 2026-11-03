/** Program compile/link helpers. Failures print the numbered source — a GLSL
 *  error with no line context has cost more time than this file. */

export class Program {
  private readonly locations = new Map<string, WebGLUniformLocation | null>();

  constructor(
    private readonly gl: WebGL2RenderingContext,
    readonly handle: WebGLProgram,
    readonly label: string,
  ) {}

  use(): this {
    this.gl.useProgram(this.handle);
    return this;
  }

  private loc(name: string): WebGLUniformLocation | null {
    let l = this.locations.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.handle, name);
      this.locations.set(name, l);
    }
    return l;
  }

  sampler(name: string, unit: number): this {
    this.gl.uniform1i(this.loc(name), unit);
    return this;
  }

  float(name: string, value: number): this {
    this.gl.uniform1f(this.loc(name), value);
    return this;
  }

  vec2(name: string, x: number, y: number): this {
    this.gl.uniform2f(this.loc(name), x, y);
    return this;
  }

  vec4(name: string, x: number, y: number, z: number, w: number): this {
    this.gl.uniform4f(this.loc(name), x, y, z, w);
    return this;
  }

  vec3(name: string, x: number, y: number, z: number): this {
    this.gl.uniform3f(this.loc(name), x, y, z);
    return this;
  }

  /** Pass the array's first name, e.g. `uHsl[0]`. */
  vec3Array(name: string, data: Float32Array): this {
    this.gl.uniform3fv(this.loc(name), data);
    return this;
  }

  dispose(): void {
    this.gl.deleteProgram(this.handle);
  }
}

function withLineNumbers(src: string): string {
  return src
    .split('\n')
    .map((line, i) => `${String(i + 1).padStart(4)} | ${line}`)
    .join('\n');
}

function compile(gl: WebGL2RenderingContext, type: number, src: string, label: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error(`createShader 失败：${label}`);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`着色器编译失败 [${label}]\n${log}\n${withLineNumbers(src)}`);
  }
  return shader;
}

/** Fragments carry `__SRGB__` where the shared colour-space chunk is spliced in. */
export function link(
  gl: WebGL2RenderingContext,
  vertexSrc: string,
  fragmentSrc: string,
  label: string,
  chunks: Record<string, string> = {},
): Program {
  let frag = fragmentSrc;
  for (const [key, value] of Object.entries(chunks)) {
    frag = frag.replace(`__${key}__`, value);
  }
  const vs = compile(gl, gl.VERTEX_SHADER, vertexSrc, `${label}.vert`);
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag, `${label}.frag`);
  const program = gl.createProgram();
  if (!program) throw new Error(`createProgram 失败：${label}`);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`着色器链接失败 [${label}]\n${log}`);
  }
  return new Program(gl, program, label);
}
