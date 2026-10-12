/**
 * 流体球着色器：一个 pass 从外到内叠出「玻璃泡泡」。
 *
 * 坐标系：p = (fragCoord/res - 0.5) * uSpan，uSpan 是画布边长占球直径的倍率，
 * 于是球半径恒为 0.5，所有带宽参数都以「占半径的比例」写，换 size 不用改数值。
 * p.y 取负，让 atan 的角度方向与屏幕一致（顺时针为正），tap(angle) 才是所见即所得。
 */

/**
 * 画布边长 = size * PAD，给 halo 留外扩余量。
 *
 * 余量不需要"刚好装下 5σ"——那条算术已经错过一次（halo 一大就被画布切成方边）。
 * 光晕在着色器里由 `haloFade` 那道窗口在画布边界前主动归零，所以 PAD 只管
 * "光晕想铺多远"，不再管"会不会露出方边"。调大它 = 光晕更松散，调小 = 更早收掉。
 */
export const ORB_CANVAS_PAD = 1.8

/**
 * colorSpeed=1 时色轮绕一圈的秒数。
 * 相位直接按「1 秒 1 个色轮」累加的话，默认参数下边缘每秒翻一整圈，
 * 看着像洗衣机而不是悬浮球——这个常数就是把它压回肉眼可跟的慢速。
 */
export const RIM_CYCLE_SECONDS = 18

export const ORB_VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

/** uniform 名清单，orb-gl 据此一次性取位置，改名会在这里编译期就暴露 */
export const ORB_UNIFORMS = [
  'uResolution',
  'uSpan',
  'uInk',
  'uRefraction',
  'uShell',
  'uMotion',
  'uColorPhase',
  'uClock',
  'uColors',
  'uColorCount',
  'uGlow',
  'uNoiseScale',
  'uInnerScale',
  'uCoreIntensity',
  'uRimWidth',
  'uRimIntensity',
  'uGlints',
  'uHalo',
  'uWobble',
  'uTilt',
  'uHoverTilt',
  'uLevel',
  'uReactivity',
  'uRimBoost',
  'uHaloBoost',
  'uCorePulse',
  'uSwell',
  'uSquish',
  'uSquishAngle',
] as const

export const ORB_FRAG = `#version 300 es
precision highp float;

#define TAU 6.28318530718

uniform vec2 uResolution;
uniform float uSpan;
/** 0=glow（自发光叠在暗页上），1=ink（当墨来画，亮页才有对比） */
uniform float uInk;
/** 玻璃罩折射强度：0=平贴一张图，1=标准球壳，越大边缘弯折越狠 */
uniform float uRefraction;
/** 玻璃壳带宽（占半径的比例），决定贴边那条焦散带有多宽 */
uniform float uShell;
/** 内部运动相位：由 CPU 累加 animationSpeed，改速度时图案不会跳位 */
uniform float uMotion;
uniform float uColorPhase;
uniform float uClock;
uniform vec3 uColors[4];
uniform int uColorCount;
uniform float uGlow;
uniform float uNoiseScale;
uniform float uInnerScale;
uniform float uCoreIntensity;
uniform float uRimWidth;
uniform float uRimIntensity;
uniform float uGlints;
uniform float uHalo;
uniform float uWobble;
uniform vec2 uTilt;
uniform float uHoverTilt;
uniform float uLevel;
uniform float uReactivity;
uniform float uRimBoost;
uniform float uHaloBoost;
uniform float uCorePulse;
uniform float uSwell;
/** 点击形变：x=主轴压缩量，y=二阶模态，z=三阶模态 */
uniform vec3 uSquish;
uniform float uSquishAngle;

out vec4 fragColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);

  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

/**
 * 气团密度场：两层主结构 + 一层很弱的细节。
 * 主结构必须低频——叠到第三层那个尺度，一屏会挤进七八个团，看着是碎烟不是软雾；
 * 但只留两层又太"秃"，出不极光条那种拉丝感，所以补一层幅度只有 0.13 的细节，
 * 靠 domain warp 把它拽成长条，而不是让它自己变成一个个小团。
 */
float fbmSoft(vec2 v) {
  float base = 0.6 * snoise(v) + 0.26 * snoise(v * 2.07 + vec2(1.7, 9.2));
  return base + 0.13 * snoise(v * 4.3 - vec2(3.1, 5.7));
}

/** 色轮沿周长铺一整圈：smoothstep 插值保证首尾闭合且没有折角 */
vec3 colorAt(float t) {
  float n = float(uColorCount);
  float scaled = fract(t) * n;
  float i = floor(scaled);
  int i0 = int(i);
  int i1 = int(mod(i + 1.0, n));
  return mix(uColors[i0], uColors[i1], smoothstep(0.0, 1.0, scaled - i));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = (uv - 0.5) * uSpan;
  p.y = -p.y;

  float ang = atan(p.y, p.x);
  float rad = length(p);
  vec2 ring = vec2(cos(ang), sin(ang));

  // 早退只是省算力：画布外本来就不画，超过这个半径的像素直接写透明。
  // 光晕能不能装得下不靠这里赌，由下面 haloFade 那道窗口负责归零。
  float canvasHalf = uSpan * 0.5;
  if (rad > canvasHalf * 0.96) {
    fragColor = vec4(0.0);
    return;
  }

  float sway = snoise(ring * max(0.6, uNoiseScale) * 0.55 + vec2(uMotion * 0.11, -uMotion * 0.07));
  float breathe = 1.0 + uLevel * uSwell * uReactivity * 0.15;
  float r0 = 0.5 * breathe + uWobble * 0.022 * sway;

  // 椭圆压缩沿点击主轴，二/三阶模态各自荡一圈：三个频率不同才有果冻感，
  // 只留压缩会像「变焦」，只留模态则中心不挪位
  vec2 axis = vec2(cos(uSquishAngle), sin(uSquishAngle));
  vec2 perp = vec2(-axis.y, axis.x);
  vec2 pa = vec2(dot(p, axis), dot(p, perp));
  float ax = max(0.35, 1.0 - uSquish.x * 0.9);
  float ay = max(0.35, 1.0 + uSquish.x * 0.62);
  float rr = length(pa / vec2(ax, ay));
  float d = rr - (r0 + uSquish.y * 0.05 * cos(2.0 * ang) + uSquish.z * 0.035 * cos(3.0 * ang));

  float inside = 1.0 - smoothstep(-0.0035, 0.0035, d);
  float rho = clamp(rr / max(r0, 1e-4), 0.0, 1.0);
  vec2 sph = p / max(r0, 1e-4);
  float nz = sqrt(max(0.0, 1.0 - rho * rho));
  vec3 n = normalize(vec3(sph * 0.92, nz));
  float fresnel = pow(1.0 - nz, 2.6);

  float s = ang / TAU;
  vec3 rimCol = colorAt(s + uColorPhase);

  // 边缘亮度包络：整圈基本都亮、只是有几段更亮。参考图是一条完整的细亮边加几团
  // 高光，不是「大半圈全暗、只留一两段弧」——对比度拉太高会断成不连续的弧段。
  float envN = snoise(ring * max(0.6, uNoiseScale) * 0.62 + vec2(uMotion * 0.06, 4.3));
  float env = smoothstep(0.1, 0.9, envN * 0.5 + 0.5);
  float envelope = 0.5 + 0.8 * env;

  // 描边位置的抖动幅度必须远小于带宽：一旦同量级，亮线就沿周长乱跳，
  // 读作「炸刺 / 闪电」而不是柔光。频率也压低，让弯折是大尺度的缓慢起伏。
  float shimmer = snoise(ring * max(1.0, uNoiseScale) * 1.4 + vec2(-uMotion * 0.12, 1.1));
  float rw = max(0.0015, uRimWidth * 0.013);
  float edge = d - shimmer * 0.0012 * (0.35 + uWobble);
  float rimBand = exp(-abs(edge) / rw);
  // 硬线只留一点意思：宽度从 0.3rw 放宽到 0.6rw、权重再压一档。
  // 参考图二那条边缘其实根本没有硬线，就是一条宽带叠一层大柔光。
  float hairline = exp(-abs(edge) / (rw * 0.6));

  vec2 tiltDir = uTilt * uHoverTilt;
  float tiltLen = length(tiltDir);
  float facing = tiltLen > 1e-4 ? dot(ring, tiltDir / tiltLen) : 0.0;
  float tiltBoost = 1.0 + max(0.0, facing) * tiltLen * 0.9;

  float outside = max(d, 0.0);
  // halo 只能画在轮廓之外：exp(-outside/w) 在内部恒为 1，若不加这道门，
  // 乘上只随角度变化的包络就会把整颗球涂成风车状放射条纹。
  float outsideMask = smoothstep(-0.004, 0.004, d);
  float haloBand = exp(-outside / max(0.003, uHalo * 0.075)) * outsideMask;
  float haloTight = exp(-outside / max(0.0015, uHalo * 0.022)) * outsideMask;
  // 外晕比描边本身平滑得多：亮弧向外扩散成一团，而不是把内部的扇形拓出去
  float haloEnv = 0.35 + 0.65 * env;
  // 光晕必须在画布边界之前**归零**。exp 衰减永远留一条尾巴，切在画布方形边缘上
  // 就是一圈方边——暗底上看不出来，白底上 alpha 还要被 pow(lum, .8) 抬亮，特别明显。
  // 窗口起点放在尾巴本来就只有 15% 的地方，所以观感上的光晕半径几乎不变。
  float haloFade = 1.0 - smoothstep(canvasHalf * 0.78, canvasHalf * 0.96, rad);

  // 玻璃罩：气团是「隔着球壳看进去」的，所以采样坐标要按球面法线反向偏折。
  // 中心 nz=1 → 不偏；越靠边 nz→0 → 沿法线往里缩，图案被挤向切线方向，读作透镜
  // 而不是平面贴图。再叠一层随 rho³ 增长的切向扭转，边缘的弯折才够明显。
  // 压缩量必须留底：0.62 那一档在 rho=1 处把坐标直接压到 0.16 倍，
  // 整圈边缘采样到同一个噪声值，等于在边上抹出一块无结构的糊带——极光就贴不上去。
  float bend = uRefraction * (1.0 - nz);
  vec2 refr = sph * (1.0 - 0.34 * bend);
  // 气团绕球心自转。角速度给一点「中心快、边缘慢」的差分，涡流才卷得起来；
  // 但差分必须有界——这里用 sin 来回摆而不是随时间累积，否则噪声会被越拧越细，
  // 几十秒后整片糊成高频噪点。静态的 ρ³ 扭转叠在同一个角度里，省掉第二次旋转。
  float spin = uMotion * 0.34 + 0.12 * sin(uMotion * 0.06) * (1.0 - rho * rho);
  float angle = spin + 0.55 * uRefraction * rho * rho * rho;
  float cs = cos(angle);
  float sn = sin(angle);
  refr = vec2(refr.x * cs - refr.y * sn, refr.x * sn + refr.y * cs);

  // 紧贴内侧的一圈是壳的截面：压缩最狠、最亮（焦散）、色相偏得最多。
  // 这条带才是「立体球」的来源——没有它，边缘只是一圈描边，球是平的。
  float shell = smoothstep(1.0 - uShell * 0.34, 1.0, rho);
  refr *= 1.0 - 0.18 * shell * uRefraction;
  float caustic = shell * (1.0 - shell) * 4.0;

  refr *= 0.96 * uInnerScale;
  vec2 warp = vec2(
    fbmSoft(refr + vec2(0.0, uMotion * 0.07)),
    fbmSoft(refr + vec2(4.7, 1.9) - vec2(uMotion * 0.05, 0.0))
  );
  // warp 幅度决定气团是「一个个团」还是「一根根条」：调大就是把细节拽成长拉丝
  float f = fbmSoft(refr * 0.85 + warp * 0.7 + vec2(uMotion * 0.028, -uMotion * 0.02));
  // 亮起阈值决定留多少暗区：卡在 -0.4 那种负值上等于整片都微微发亮，看着就是「密」；
  // 抬到正值又只剩一两个孤团，太空。0 附近偏负一点是参考图那种「几团 + 大片黑」。
  float gas = pow(smoothstep(-0.16, 0.66, f), 1.15);
  // 气团与边缘共用同一套「角度 → 色相」映射：气团飘到哪一侧，那一侧的描边就是它的颜色，
  // 两边不再各说各话。整条色轮沿球面铺一遍，所以气团本身就是七彩的，
  // 不需要再靠 warp 场分块去凑第二第三个色相。
  // 中心 atan 无定义，所以低 ρ 处退回不带角度的色相，否则最亮那团会翻成彩色噪点。
  float gasPhase = uColorPhase + f * 0.05 + 0.08 * shell;
  vec3 gasCol = mix(
    colorAt(gasPhase * 0.6 + 0.12),
    colorAt(s + gasPhase),
    smoothstep(0.16, 0.6, rho)
  );
  gasCol = mix(gasCol, vec3(1.0), 0.4 * gas * gas);
  float drift = 0.7 + 0.3 * (0.5 + 0.5 * sin(uMotion * 0.3 + f));

  // 极光锚在边缘、向内衰减——和首页芯片那圈是同一个结构。
  // 之前反过来做（中心一团雾 + 靠边再乘 coreMask 压暗），于是球心与球壳之间
  // 永远隔着一圈黑带，看着就是极光浮在中间、没贴上去。
  float inward = max(-d, 0.0);
  float fall = exp(-inward / max(0.02, 0.26 * uInnerScale));
  float gasShape = gas * (0.28 + 1.2 * fall);
  float coreMask = inside;

  float core = exp(-rho * rho / max(0.012, 0.05 * uInnerScale)) * uCoreIntensity;
  vec3 coreCol = mix(colorAt(uColorPhase + 0.5), vec3(1.0), 0.45);
  float hotR = 0.05 + 0.03 * uLevel * uReactivity;
  float hotDot = exp(-dot(p - tiltDir * 0.08, p - tiltDir * 0.08) / (hotR * hotR));

  vec3 L = normalize(vec3(-0.32 + tiltDir.x * 0.7, 0.55 + tiltDir.y * 0.7, 0.78));
  float ndl = max(dot(n, L), 0.0);
  // 高光两档的指数都要很大：这个投影下 n 随位置变化很慢，pow 的指数不到三位数
  // 就会摊成一整片柔光，读作一颗灰球而不是玻璃反光（第一版就糊在这里）。
  float glint = (pow(ndl, 40.0) * 0.05 + pow(ndl, 160.0) * 0.45) * uGlints * inside;
  float crescent = exp(-abs(d + rw * 1.7) / (rw * 1.1)) * pow(max(0.0, -facing), 3.0);

  // 近白的镜面与热核在白底上只会变成灰渍，ink 模式下基本关掉它们，
  // 让球面上留下的都是站得住的饱和色
  float spec = mix(1.0, 0.12, uInk);
  vec3 col = rimCol * rimBand * envelope * uRimIntensity * uRimBoost * tiltBoost;
  col += mix(rimCol, vec3(1.0), 0.5) * hairline * envelope * uRimIntensity * uRimBoost * tiltBoost * 0.6;
  col += rimCol * (haloBand * 0.55 + haloTight * 0.35) * haloEnv * uHalo * uHaloBoost * haloFade;
  col += rimCol * fresnel * inside * 0.42 * uRimIntensity;
  // 焦散带：壳的截面处把气团和描边一起提亮，形成一圈贴边的亮带。
  // 它不吃 coreMask（coreMask 正是为了在边缘把气团压暗而设），否则这条带出不来。
  col += gasCol * gas * caustic * 0.85 * uRefraction;
  col += mix(rimCol, vec3(1.0), 0.18) * caustic * envelope * 0.3 * uRimIntensity;
  col += gasCol * gasShape * drift * coreMask * uCoreIntensity;
  col += coreCol * core * coreMask * (0.5 + 0.55 * uCorePulse * (0.5 + 0.5 * sin(uClock * 3.1)));
  col += vec3(1.0) * hotDot * (0.6 + 0.4 * uLevel) * uCoreIntensity * 1.1 * spec;
  col += mix(rimCol, vec3(1.0), 0.7) * glint * spec;
  col += mix(rimCol, vec3(1.0), 0.5) * crescent * envelope * 0.5;

  col *= uGlow * (1.0 + uLevel * uReactivity * 0.35 * uSwell);
  // Reinhard：不压的话高亮段各通道一起溢出到 1，彩色边缘会烧成白
  col = col / (1.0 + col);

  float lum = max(col.r, max(col.g, col.b));
  float glowAlpha = clamp(lum * 1.22, 0.0, 1.0);

  // ink：把这团「光」当墨的浓度用。色相先归一化再按覆盖率压上去——直接拿 col 乘
  // alpha 只会摊成一层灰，因为亮部本来就接近白。也别给内部填深色，那在白底上是
  // 一块黑盘子，不是「干净的墨」。
  vec3 hue = col / max(lum, 1e-4);
  float inkAlpha = clamp(pow(lum, 0.8) * 1.5, 0.0, 1.0);
  float a = mix(glowAlpha, inkAlpha, uInk);
  fragColor = vec4(mix(col, hue * a, uInk), a);
}
`
