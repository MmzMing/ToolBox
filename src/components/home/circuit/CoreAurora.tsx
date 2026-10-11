import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'

/** 指针：xy 用与着色器相同的「画布高度」单位，z 是激活强度 0..1 */
export type AuroraPointer = { x: number; y: number; push: number }

export type CoreAuroraProps = {
  /** 圆角占芯片宽度比例，与 CSS rounded-[9%] 对齐 */
  radiusRatio: number
  pointer: MutableRefObject<AuroraPointer>
  /** 关掉动画时只渲一帧 */
  still?: boolean
}

/** 时间流速：所有噪声漂移共用这一个倍率 */
const SPEED = 0.5
/** 边框巡游速度：周长坐标一共 8 份，实速 = SPEED * SPIN，一圈约 18 秒 */
const SPIN = 0.9
/** 极光从边框向内渗透的基准深度，占芯片高度比例（云密处会再渗深些） */
const DEPTH = 0.3

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

/**
 * 片元主体改编自 reactbits <Aurora />：snoise 与「噪声 → 指数 → 平滑过渡出 alpha」
 * 这套算法骨架原样保留——效果就是这套数学，改一笔就不是那个味道。
 *
 * 相对参考源码的四处适配：
 * 1. 跑在原生 WebGL2 上（项目没有 ogl），`#version 300 es` 直接用；
 * 2. 参考源码的极光沿 uv.x 横着铺、按 uv.y 出高度带，这里把空间坐标换成
 *    「沿圆角矩形周长的匀速坐标 s」与「离边框的径向深度 inward」——
 *    极光于是贴着边框内侧铺成一圈，s 上加时间让整圈顺时针绕边框巡游；
 * 3. 气体感靠 2D fbm 云：云团缓慢漂移、云密处极光向里渗得深，
 *    所有因子都是平滑乘积，不做径向等高线，避免出现星芒状硬边；
 * 4. 周长噪声把 s 卷成圆环再采样（ring = cos/sin），s=0 与 s=8 的接缝因此消失，
 *    否则左边框中缝会有一道亮暗断层。
 */
const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform vec2 uResolution;

uniform vec2 uHalf;
uniform float uRadius;
uniform float uDepth;
uniform float uLine;
uniform float uSpin;
uniform vec3 uPointer;

out vec4 fragColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v){
  const vec4 C = vec4(
      0.211324865405187, 0.366025403784439,
      -0.577350269189626, 0.024390243902439
  );
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);

  vec3 p = permute(
      permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0)
  );

  vec3 m = max(
      0.5 - vec3(
          dot(x0, x0),
          dot(x12.xy, x12.xy),
          dot(x12.zw, x12.zw)
      ),
      0.0
  );
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

/** 四层叠加的分形噪声：极光那团"气体"的絮状纹理 */
float fbm(vec2 v) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i += 1) {
    sum += amp * snoise(v);
    v = v * 2.03 + vec2(1.7, 9.2);
    amp *= 0.5;
  }
  return sum;
}

/** 七彩虹色：余弦色板沿周长铺满一整色轮 */
vec3 spectrum(float t) {
  return 0.5 + 0.5 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67)));
}

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);

  float d = sdRoundBox(p, uHalf, uRadius);
  // 边缘留一点软过渡避免锯齿
  float inside = 1.0 - smoothstep(-0.004, 0.0, d);
  float inward = max(-d, 0.0);

  // 周长坐标 s ∈ [0,8)：把点径向投影到芯片矩形上再沿四条边匀速展开，
  // 长短边上的亮斑才同速跑（按 atan 取角的话角点附近会明显变慢）
  vec2 q = p / uHalf;
  float m = max(abs(q.x), abs(q.y));
  vec2 qb = clamp(q / max(m, 1e-4), -1.0, 1.0);
  float s = 1.0 + qb.y;                              // 右边 0..2
  s = mix(s, 3.0 - qb.x, step(0.999, qb.y));         // 上边 2..4
  s = mix(s, 5.0 - qb.y, step(qb.x, -0.999));        // 左边 4..6
  s = mix(s, 7.0 + qb.x, step(qb.y, -0.999));        // 下边 6..8

  // s 递增是逆时针，所以给 s 加时间＝图案沿 s 减小方向走＝屏幕上顺时针；
  // mod 回 [0,8) 既保证色轮与圆环采样永远闭合，也避免长时间运行后浮点精度烂掉
  float sRot = mod(s + uTime * uSpin, 8.0);
  vec2 ring = vec2(cos(sRot * 0.7853981634), sin(sRot * 0.7853981634));

  // 沿周长的亮度包络：圆环上低倍率噪声 → 几团宽"气团"顺时针巡边。
  // smoothstep 只拉对比、不断连续，包络始终平滑，不会切出硬边
  float blob = snoise(ring * 1.1 + vec2(uTime * 0.05, 2.1)) * 0.5 + 0.5;
  blob = smoothstep(0.10, 0.85, blob);
  float envelope = 0.22 + blob;

  // 气体纹理：2D fbm 缓慢漂移 → 漂浮的雾感；
  // 云密的地方衰减长度变长，极光丝从边框向里"长"出来，深浅全是平滑乘积
  float clouds = fbm(p * 2.6 + vec2(uTime * 0.07, -uTime * 0.05));
  clouds = smoothstep(-0.15, 0.75, clouds);
  float fall = exp(-inward / (uDepth * (0.55 + 0.90 * clouds)));

  float glow = fall * envelope * (0.30 + 0.90 * clouds);

  vec2 from = p - uPointer.xy;
  float touch = exp(-dot(from, from) * 20.0) * uPointer.z;
  glow += touch * fall * 0.6;

  // 色相沿周长铺满一整圈，并跟着 sRot 一起顺时针转
  vec3 rampColor = spectrum(fract(sRot * 0.125 + uTime * 0.02));

  // 描边与极光共用同一条包络明暗：一缕光绕着边走，而不是整圈均亮
  float edgeBright = 0.35 + 0.85 * blob + touch;
  // 1px 级别的 crisp 描边（外半边被画布边缘裁掉，正好剩一条贴边线），
  // 再加一道紧贴描边内侧的饱和亮带，就是目标图里边框内沿那圈"热气"
  float line = exp(-abs(d) / uLine);
  float hug = exp(-inward / (uLine * 6.0)) * inside;

  vec3 color = rampColor * glow * inside * 1.2
             + rampColor * hug * edgeBright * 0.5
             + mix(rampColor, vec3(1.0), 0.25) * line * edgeBright;

  // Reinhard 压高光：不压的话亮段各通道一起溢出到 1，彩虹会烧成白
  color = color / (1.0 + color);

  float alpha = clamp(max(color.r, max(color.g, color.b)) * 1.25, 0.0, 1.0);
  fragColor = vec4(color, alpha);
}
`

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
 * 主芯片卡片内部的极光：七彩气体贴着圆角边框内侧铺一圈，整圈顺时针巡游。
 *
 * 项目里没有 ogl 也没有别的 WebGL 库，而参考源码里 ogl 只用来画一张铺满裁剪
 * 空间的大三角、建个 program，所以把着色器直接接在原生 WebGL2 上：
 * 效果一致，且不必为此新增依赖。
 *
 * 画布与芯片盒完全重合（不再外扩光晕余量）：极光只留在卡片内部，
 * 圆角交给外层容器的 overflow-hidden 裁，描边外半边被画布边缘自然裁成贴边线。
 *
 * 拿不到 WebGL2（或编译失败）就把画布收起来，让芯片自己的底色顶着——
 * 首页不能因为一个装饰效果开天窗。
 *
 * cleanup 里只删 buffer/program，不调 WEBGL_lose_context.loseContext()：
 * dev 下 StrictMode 会把 effect 跑两遍，而 canvas 是同一个元素，
 * 第二次 getContext 拿回来的是刚被主动丢掉的同一个上下文，于是着色器全部编译失败。
 */
export function CoreAurora({ radiusRatio, pointer, still = false }: CoreAuroraProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) {
      return
    }
    const hide = () => {
      canvas.style.display = 'none'
    }
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: true })
    if (gl === null) {
      hide()
      return
    }
    gl.clearColor(0, 0, 0, 0)

    const vertex = compile(gl, gl.VERTEX_SHADER, VERT)
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = vertex === null || fragment === null ? null : gl.createProgram()
    if (vertex === null || fragment === null || program === null) {
      hide()
      return
    }
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
      hide()
      gl.deleteProgram(program)
      return
    }
    gl.useProgram(program)

    // 一张铺满裁剪空间的大三角（ogl 的 Triangle 就是这个）
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    const u = (name: string) => gl.getUniformLocation(program, name)
    const loc = {
      time: u('uTime'),
      res: u('uResolution'),
      half: u('uHalf'),
      radius: u('uRadius'),
      depth: u('uDepth'),
      line: u('uLine'),
      spin: u('uSpin'),
      pointer: u('uPointer'),
    }
    gl.uniform1f(loc.depth, DEPTH)
    gl.uniform1f(loc.spin, SPIN)

    const start = performance.now()
    let push = 0
    let frame = 0
    let onScreen = true

    const draw = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
      }
      const aspect = canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 1
      gl.uniform2f(loc.res, width, height)
      // 对齐 ogl 的 time * speed * 0.1（它的 time 是 ms * 0.01）→ 秒 × speed
      gl.uniform1f(loc.time, ((now - start) / 1000) * SPEED)
      // 坐标以画布高度为 1：芯片盒就是画布，半宽 = aspect / 2
      gl.uniform2f(loc.half, aspect / 2, 0.5)
      gl.uniform1f(loc.radius, radiusRatio * aspect)
      gl.uniform1f(loc.line, 1.25 / canvas.clientHeight)

      push += (pointer.current.push - push) * 0.08
      gl.uniform3f(loc.pointer, pointer.current.x, pointer.current.y, push)

      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const loop = (now: number) => {
      draw(now)
      if (!still && onScreen) {
        frame = requestAnimationFrame(loop)
      }
    }

    const observer = new IntersectionObserver(([entry]) => {
      const next = entry?.isIntersecting ?? true
      if (!next) {
        cancelAnimationFrame(frame)
      } else if (!onScreen && !still) {
        frame = requestAnimationFrame(loop)
      }
      onScreen = next
    })
    observer.observe(canvas)
    frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    }
  }, [pointer, radiusRatio, still])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full"
    />
  )
}
