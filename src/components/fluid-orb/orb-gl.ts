import { ORB_FRAG, ORB_UNIFORMS, ORB_VERT } from './orb-shader'

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (shader === null) {
    return null
  }
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

/**
 * 一张铺满裁剪空间的大三角 + 一个片元着色器：这颗球没有几何，所有形状都在 SDF 里算，
 * 所以不需要顶点属性之外的任何东西。
 *
 * 与 CoreAurora 同一套约定：dispose 里只删 buffer/program，不调
 * `WEBGL_lose_context.loseContext()`——dev 下 StrictMode 会把 effect 跑两遍，而 canvas
 * 是同一个元素，第二次 getContext 拿回来的是刚被主动丢掉的同一个上下文，着色器会全部编译失败。
 */
export type OrbRenderer = {
  /** 对齐 CSS 尺寸 × dpr × resolution；返回后备缓冲尺寸是否变化（静止帧靠它决定要不要重绘） */
  resize(resolution: number): boolean
  clear(): void
  uniform1f(name: (typeof ORB_UNIFORMS)[number], value: number): void
  uniform2f(name: (typeof ORB_UNIFORMS)[number], x: number, y: number): void
  uniform3f(name: (typeof ORB_UNIFORMS)[number], x: number, y: number, z: number): void
  uniformColors(rgb: readonly number[], count: number): void
  draw(): void
  dispose(): void
}

export function createOrbRenderer(canvas: HTMLCanvasElement): OrbRenderer | null {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    powerPreference: 'low-power',
  })
  if (gl === null) {
    return null
  }

  const vertex = compile(gl, gl.VERTEX_SHADER, ORB_VERT)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, ORB_FRAG)
  const program = vertex === null || fragment === null ? null : gl.createProgram()
  if (vertex === null || fragment === null || program === null) {
    return null
  }
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
    gl.deleteProgram(program)
    return null
  }
  gl.useProgram(program)

  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'position')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

  const locations = new Map<string, WebGLUniformLocation | null>(
    ORB_UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)]),
  )
  gl.uniform1i(locations.get('uColorCount') ?? null, 4)
  gl.clearColor(0, 0, 0, 0)

  const loc = (name: string) => locations.get(name) ?? null

  return {
    resize(resolution) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const scale = Math.max(0.25, Math.min(2, resolution))
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr * scale))
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr * scale))
      const changed = canvas.width !== width || canvas.height !== height
      if (changed) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
      }
      // 无条件写：首帧后备缓冲尺寸可能恰好等于 canvas 的默认 300×150，
      // 只在变化时写会让 uResolution 停在 (0,0)，着色器里除以它直接黑屏。
      gl.uniform2f(loc('uResolution'), width, height)
      return changed
    },
    clear() {
      gl.clear(gl.COLOR_BUFFER_BIT)
    },
    uniform1f(name, value) {
      gl.uniform1f(loc(name), value)
    },
    uniform2f(name, x, y) {
      gl.uniform2f(loc(name), x, y)
    },
    uniform3f(name, x, y, z) {
      gl.uniform3f(loc(name), x, y, z)
    },
    uniformColors(rgb, count) {
      gl.uniform3fv(loc('uColors'), rgb)
      gl.uniform1i(loc('uColorCount'), Math.max(2, Math.min(4, count)))
    },
    draw() {
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    dispose() {
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    },
  }
}
