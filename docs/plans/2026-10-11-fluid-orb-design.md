# 流体悬浮球（FluidOrb）· 设计记录

日期：2026-10-11
范围：`src/components/fluid-orb/`（新增）、`src/config/ai-orb.ts`（新增）、`src/components/ai/AIOrbDock.tsx`（新增）、`src/layouts/app-shell/AppShell.tsx`、`common.json`（zh/en）

## 背景

为后续 AI 助手准备一颗视觉主体：一颗会呼吸、可点击抖动的玻璃泡泡，边缘有彩色流光，
内部偶尔飘过一道极光。AI 逻辑本次不做，只把「长什么样、参数怎么调、入口挂在哪、开关在哪」定下来。

参数表照 React Bits `<Orb />` 的 API 逐项落地（size / colors / state / volume / getVolume /
autoVolume / reactivity / animationSpeed / colorSpeed / glowIntensity / noiseScale / innerScale /
coreIntensity / rimWidth / rimIntensity / glints / halo / wobble / hoverTilt / interactive /
blend / intro / paused / resolution / ref.tap / className / style）。上游源码在本环境取不到
（raw.githubusercontent 502、reactbits registry 404），因此不抄实现，按参考图 + 本表重写。

## 决策与取舍

| 议题       | 结论                                  | 理由                                                                                                                                              |
| ---------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 渲染技术   | 原生 WebGL2 单片元着色器              | `noiseScale`/`rimWidth`/`glints`/`halo`/`resolution` 都要求逐像素计算；Canvas2D 渐变糊不到 crisp rim，CSS+feTurbulence 参数对不上且移动端功耗失控 |
| 依赖       | 零新增                                | 项目无 ogl/three；`CoreAurora.tsx` 已验证原生 WebGL2 这条路可行，复用其装配范式                                                                   |
| 球体建模   | 2D SDF + 球面法线近似，不做 raymarch  | 参考图本质是「玻璃泡泡」：一圈细亮边 + 近黑内部 + 边缘色散，真 3D 步进是白付成本                                                                  |
| 抖动实现   | 改 SDF 本身（椭圆 + 二/三阶形变模态） | 只缩放像「变焦」，模态叠加才像水球                                                                                                                |
| 逐帧数据   | 全走 ref，不进 React state            | 进 state 就是每帧重渲染                                                                                                                           |
| 极光显著度 | 常驻旋转气团，密度取中间档            | 初版按「不明显、偶尔飘过」做，与参考图不符；改为常亮，靠阈值留暗区而不是靠事件门控                                                                |
| 入口位置   | 右侧垂直居中                          | 桌面 dock 在左、手机 dock 在底，且手机折叠后右下已有 `DockHandle`（z-40）                                                                         |
| 开关语义   | 只留新增的静态 config 一道门          | 球今天不发请求，`toolbox.ai` 那道守数据流向的开关管不到它；接上 AI 动作后再叠回来                                                                 |
| 调参界面   | 不做                                  | 参数写在 `ai-orbConfig.orb` 里，调完回写默认值                                                                                                    |

## 着色器分层（一个 pass，由外向内）

1. **halo** — `exp(-max(d,0)/halo)` 解析衰减，不做真高斯模糊。canvas 边长 = `size * 1.8`，
   这个余量必须容得下光晕的 5σ：`halo=1.4` 时带宽 0.105 个半径，PAD=1.6 的半宽 0.8 装不下，
   外缘会被画布切成一条方边。
2. **rim 流光** — 极角 θ 参数化色轮，沿周长卷成圆环采样噪声得亮度包络。包络要「整圈基本都亮、
   只是有几段更亮」；对比度拉太高会断成不连续的弧段。
   细亮边是 `hairline` 叠 `rimBand` 两层，但硬线那层**权重压到 0.6、宽度放宽到 0.6rw**，
   同时描边位置的抖动 `shimmer` 幅度从 0.0035 降到 0.0012、频率从 2.4 降到 1.4：
   抖动幅度一旦与带宽同量级，亮线就沿周长乱跳，读作「炸刺 / 闪电」而不是柔光。
   这是边缘观感上返工的第二处——参考图那条边缘其实根本没有硬线，就是一条宽带叠一层大柔光。
3. **glass shell（折射）** — 气团是「隔着球壳看进去」的：采样坐标按球面法线反向偏折
   `refr = sph * (1 - k·(1-nz))`，中心不偏、越靠边缩得越狠；再叠一点随 ρ³ 增长的切向扭转。
   `k` 必须留底（现取 0.34）：0.62 那一档在 ρ=1 处把坐标压到 0.16 倍，整圈边缘采样到
   同一个噪声值，等于在边上抹出一条无结构的糊带——极光于是贴不上去。
   紧贴内侧另有一圈焦散带（`shell` 的钟形峰），最亮、色相偏得最多。
   **这条带才是「立体球」的来源**——没有它，边缘只是一圈描边，球是平的。
4. **gas（内部极光）** — 亮度**锚在边缘、向内衰减**：`fall = exp(-inward / 0.26·innerScale)`，
   `gasShape = gas * (0.28 + 1.2·fall)`。这与首页芯片 `CoreAurora` 是同一个结构。
   反过来做（中心一团雾 + 靠边再乘 mask 压暗）会在球心与球壳之间永远隔一圈黑带，
   看着就是极光浮在中间、没贴上去——这是本组件返工最多的一处。中心仍保留热核与暗区。
   密度场 `fbmSoft` 用「两层主结构 + 一层幅度仅 0.13 的细节」：主结构必须低频，否则一屏挤进
   七八个团、看着是碎烟；但只留两层又太秃，出不极光条那种拉丝感。细节靠 domain warp
   （幅度 0.7）被拽成长条，而不是自己长成一个个小团。
   色相与边缘**共用同一套「角度 → 色相」映射**：气团飘到哪一侧，那一侧的描边就是它的颜色；
   整条色轮沿球面铺一遍，气团本身就是七彩的。代价是 `atan` 在圆心无定义，所以低 ρ 处退回
   不带角度的色相再 mix 过去，否则最亮那团会翻成彩色噪点。密度只用来微微偏色（`f * 0.05`），
   不拿它整圈铺色轮——那样每根等密度线各取一色，出来是油膜彩虹。
   气团绕球心**自转**，角速度带一点「中心快、边缘慢」的差分，涡流才卷得起来；差分用
   `sin(uMotion)` 来回摆而不是随时间累积——累积会把噪声越拧越细，几十秒后整片糊成高频噪点。
   来回摆的副作用正好是「一阵卷起、一阵松开」，比恒定自转更像活的气体。
   转速走 `animationSpeed`，不单开参数。
   密度靠两个旋钮控制：基础频率 `0.96 * innerScale` 决定团的大小与个数，亮起阈值
   `smoothstep(-0.16, 0.66, f)` 决定留多少暗区。阈值卡在 -0.4 那种负值上等于整片微微
   发亮（太密），抬到正值又只剩一两个孤团（太稀），0 附近偏负才是「几团 + 大片黑」。
5. **glints** — 法线取 `normalize(vec3(sph*0.92, sqrt(1-ρ²)))`，两档镜面。指数必须到 40/160
   这个量级：这个投影下法线随位置变化很慢，指数小了会摊成一片柔光，读作一颗灰球。
6. **squish** — 点击形变写进 SDF：沿点击主轴的椭圆压缩 + 二/三阶形变模态。

## 物理与状态

- 弹簧状态 `{ amount, mode2, mode3 }` 存 ref；`tap(angle, strength)` 注入速度冲量，
  欠阻尼回弹，模态各自按自己的频率荡几圈。亚步长固定 1/120s，标签页被节流回来那一帧不会炸。
- `state` 四态只映射成一组 uniform 目标值（rim 提亮 / 色轮加速 / core 脉冲 / volume swell），
  帧内 `mix(cur, target, 1-exp(-dt·k))` 过渡，切换不跳变。
- `autoVolume` 用两个不同频率正弦相乘当音节、慢正弦门控当语句，恒输出 0..1，纯时间的函数。
- `hoverTilt` 指针 → 目标倾角，指数趋近，驱动高光与 rim 亮斑向指针偏移。
- `intro` 走 motion 的软弹簧（scale 0.86→1 + opacity）。
- 色轮相位按 `RIM_CYCLE_SECONDS = 18` 归一：不除这个常数，默认参数下边缘每秒翻完整一圈。

## config 与开关叠加

```ts
export const aiOrbConfig = {
  /** 产品级 kill switch：false 时入口不渲染、不建 WebGL 上下文 */
  enabled: true,
  dock: { side: 'right', size: 76, mobileSize: 60 },
  orb: { colors: [...], wobble: 0.25, refraction: 1.35, shellWidth: 1.15, halo: 1.05 },
}
```

显示条件只有 `aiOrbConfig.enabled` 一道门。**刻意不再叠** `toolbox.ai` 的用户总开关：
那颗开关守的是「内容要不要发往你配置的服务商」（§12），而这颗球目前不发任何请求，
一起关掉只会让装饰效果连带消失，起不到任何告知作用。等球真的接上 AI 动作再把门加回来。

点击行为**没接**：`AIConfigDialog` 只挂在简历工具页里，在全局壳层点它不会有反应，
所以入口先不给自己 `button` 语义（不包 button、不给 aria-label），只留一颗可点按形变的球。

## 悬浮入口可拖拽

`AIOrbDock` 用 pointer capture 把球拖到视口任意位置，左上角夹在 `[0, innerWidth-size]` 内。
没拖过时挂 CSS 的「右侧垂直居中 + 按实际溢出量让位」，拖过之后才换成显式 `left/top`——
这样首帧不读 `window`，预渲染与 hydration 的 DOM 保持一致；`resize` 时把已拖出的球夹回视口。
贴边让位量按 `size*(PAD-1)/2` 实算，写死 `pr-3` 会把外扩的光晕裁掉。

## 眼睛：移植 Grok Bot 的 39 态

源：`D:\my-tools\tools-bot\grok-icon-study`（Grok Bot.app v0.18.0 的学习复刻，版权归 xAI）。
只取角色引擎的**眼形几何 + 状态表**，不搬它的 3D pose、身形 morph 与 notify badge。

| 源                                                          | 这边                | 说明                                                                                    |
| ----------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------- |
| `GROK_GEO.eyes`（25 组 × 左右 × 48 点）                     | `orb-eye-shapes.ts` | 由 `scripts/gen-orb-eyes.mjs` 生成，坐标保留 1 位小数（体积省三分之一，一单位不到 1px） |
| `EYE_PLAYLIST` / `EYE_HOLD_MS` / `BLINK_MS` / `WINK_STATES` | `orb-eye-states.ts` | 39 态 = Lifecycle 7 + Reactions 16 + Agent morphs 3 + Product lifecycle 13              |
| `queueBlink` / `consumeBlink` / `winkLid`                   | `orb-eyes.ts`       | 照抄，含 1.08 过冲与 14% 二次眨                                                         |
| `SPRINGS` / `FACE_TUNE`                                     | `orb-eyes.ts`       | 只留 x / y / blink / eyeScale 四支弹簧                                                  |

**最关键的一处：眼形自带位置，必须重新归心。**
源数据把表情连位置一起烘进几何里了（原角色靠 3D pose 矩阵把脸转到球面上），25 组的双眼中点
从 (71,57) 一路跑到 (190,165)。直接拿来用，idle 的两只眼会双双落在球的右上角。
所以每组先算出自己的 `PAIR_MID`，渲染时减掉它再落到 `FACE_ANCHOR`（比球心高 12 单位）。
`orb-eyes.test.ts` 里有一条遍历 39 态断言「双眼中点落在 FACE_ANCHOR」的回归测试。

**两处有意的简化**

1. 源用 `flattenPath` + `buildSpan` 把身形路径采样成扫描线来夹取眼睛位置（它的身子是不规则
   blob）。球永远是正圆，同一件事有解析解：`clampToDisc` 沿径向把超界的眼睛拉回 `R - 眼睛外接圆`。
2. 不做 3D `turn` / `tilt` / `roll`，所以 `use3d` 与 `rot3` / `relRot` 整块不搬，正面朝向。

**配色不写死**：`fill="currentColor"` + 外层 `text-foreground`。暗色 `--foreground` 是
`oklch(0.985)`（近白）、亮色是 `oklch(0.145)`（近黑），正好是要求的「暗底白眼睛、亮底黑眼睛」，
主题切换自动跟随，组件里没有任何颜色字面量。

**鼠标跟随走窗口级 pointermove，不是球体自己的 hover。**
悬浮球只占屏幕一角（76px），要求用户把鼠标移到球上才动等于没有跟随。所以 `OrbEyes` 在
`window` 上听 `pointermove` / `pointerdown`，每帧读一次球心，算「指针在球的哪个方向」，
按 3 倍球径饱和——页面上绝大多数位置都是满偏转，对小尺寸球来说方向才是信息量，幅度不是。
`getBoundingClientRect` 放在 rAF 里而不是事件回调里，否则甩鼠标时会把强制重排塞进输入路径。
幅度给到 20 / 14 个 viewBox 单位（约球直径的 9%）：第一版只给 9 单位，在 76px 的球上折算
不到 3px，肉眼看不出来。触屏没有悬停，`pointerup` 之后没有方向可跟，退回待机漂移。
弹簧负责跟手，另叠两条极慢正弦当待机漂移，没鼠标时眼睛也不会死在正中。

逐帧只写 `d` 与 `transform` 两个属性，不进 React state；`d` 还额外做了跳过——眼形只在切换中
才变，注视与眨眼只动 transform，而 `d` 是 48 个点拼出来的长串。

## 点击轮换情绪，点多了会生气

规则全在 `orb-mood.ts`，是纯函数（`tapMood(cycler, now)`），不碰 DOM、不起定时器。

- 一次点击 → 沿 `ORB_EYE_MOODS` 的顺序换到下一个情绪，走完 39 个再循环。
- 两次点击间隔 ≤ `ANNOY_GAP_MS`(900ms) 算连着点，计数累加；隔久了直接归零，不记仇。
- 连到 `ANGRY_AFTER_CLICKS`(5) 次就翻成 `angry`，并锁 `ANGRY_HOLD_MS`(3.5s)；锁定期内再点
  只往后推截止时间——所以一直狂点会一直生气，而不是点一下怒、再点一下又笑嘻嘻。
- 冷却后从上次停下的下标继续轮换。

**生气状态不等于 `d` 不变**：`angry` 自己的播放列表是 `[7, 16]`，锁定期内眼形仍在这两态之间
轮播，所以观测量要选「有没有继续往后换家族」，而不是「字符串是否相同」。

**触发点放在 `AIOrbDock` 而不是 `FluidOrb`**：只有它同时握着 pointer capture 和位移量，
能区分「点」和「拖」。按下到抬起移动超过 6px 就算拖拽，不换表情。
球体自身的挤压形变仍由 FluidOrb 在 pointerdown 上做，两者互不干扰。

不做 `button` 语义也不给 aria-label：换表情是玩法，不是能抵达的操作。

## 文件划分

orb 专属纯逻辑留在自己目录，不进 `src/utils/`（§2 禁止单工具专属逻辑入 utils）。

```
src/components/fluid-orb/
├── FluidOrb.tsx      # 外壳：canvas、props→uniform ref、指针与点击、ref.tap、CSS 兜底
├── OrbEyes.tsx       # 眼睛 SVG 覆盖层：逐帧写 d/transform，离屏与后台停 rAF
├── orb-eyes.ts       # 纯函数：归心、眨眼队列、wink、弹簧注视、贴边夹取、SVG 属性产出
├── orb-eye-states.ts # 39 态表：播放列表 / 停留 / 眨眼 / wink / FACE_TUNE / SPRINGS
├── orb-mood.ts       # 纯函数：点击轮换顺序、连点计数、生气锁定期
├── orb-eye-shapes.ts # 25 组眼形（生成，勿手改）
├── orb-shader.ts     # VERT / FRAG + uniform 清单 + PAD / RIM_CYCLE_SECONDS
├── orb-gl.ts         # compile / link / DPR resize
├── orb-physics.ts    # 纯函数：弹簧、模态衰减、state 目标值、autoVolume 包络、电平优先级
├── orb-colors.ts     # 纯函数：hex→linear RGB、2~4 色循环、linear→CSS 色串（兜底用）
├── orb-defaults.ts   # 参数表默认值的唯一来源
└── types.ts          # FluidOrbProps / OrbState / OrbBlend / FluidOrbHandle
src/config/ai-orb.ts                     # kill switch + dock 位置 + 站点默认参数
src/components/ai/AIOrbDock.tsx          # 悬浮入口（可拖拽）
src/test/components/fluid-orb/{orb-physics,orb-colors,orb-eyes,orb-mood}.test.ts
scripts/gen-orb-eyes.mjs                 # 从源仓库重新生成 orb-eye-shapes.ts
```

`colors` 的 sRGB→linear 转换不可省，否则 `#ff006e` 在着色器里偏色。

## 降级与边界

- 无 WebGL2 或编译失败 → 不渲 canvas，退化为 CSS 径向渐变静态球，不崩不空。
- `prefers-reduced-motion` 或 `paused` → 只渲一帧静止，参数变化时重渲。
- IntersectionObserver 离屏 + `visibilitychange` 隐藏 → 停 rAF。
- StrictMode 双跑 effect：沿用 `CoreAurora` 结论，cleanup 里不调 `loseContext()`。
- 尺寸为 0、`colors` 非 2~4 个、`volume` 越界 → clamp 兜底。
- 悬浮入口是 `pointer-events-auto` 的独立 absolute 层，z 序排在内容遮罩（z-30）与 dock（z-40）之间。

## 测试

只测纯逻辑：`orb-physics`（弹簧收敛、冲量响应、模态单调衰减、autoVolume 恒在 0..1）、
`orb-colors`（非法 hex、sRGB→linear 端点、循环插值首尾闭合）、
`orb-eyes`（39 态表完整性、播放列表不越界、眨眼队列、贴边夹取、**遍历 39 态断言双眼归心**、
巨大帧间隔不产生 NaN）。UI 组件按 §10 不强制测。

## 验证

`pnpm lint && pnpm typecheck && pnpm test`（134 文件 / 2831 用例）全绿，新增 72 条 orb 纯逻辑用例。
临时挂一个 `orb-lab.html` 多入口页在浏览器里逐项目视（验完已删）：描边形态、内部暗度、
极光出现与消失、点击从正圆压成椭圆并荡动、暗亮两种 blend、以及悬浮入口在 app-shell
右侧竖边的实际位置与贴边让位。
眼睛在真实页面上验：76px 下位置与大小、暗色 `fill` 取 `oklch(0.985)`、切到亮色取 `oklch(0.145)`、
眨眼与换表情时不跑偏（归心断言 midX/midY 落在 FACE_ANCHOR）。
注视量过数值：指针甩到页面左下，左眼 translate 从 84.4 → 60.6（−23.8 单位）；
换到右上回到 89.0 / 93.2（x +28.4、y −15.6），两只眼成对移动且脸心不偏。
WebGL 不可用时的 CSS 兜底只过了代码路径与类型检查，没真在无 WebGL 的环境里目视过。

## 实现中改掉的四处

1. **风车状放射条纹**：`haloBand = exp(-outside/w)` 在球内部恒为 1，乘上只随角度变化的
   亮度包络，等于把扇形拓满整张画布。补一道 `outsideMask` 把 halo 关在轮廓之外。
2. **中心彩色噪点**：极光与核心的取色混进了 `atan` 角度，而 atan 在圆心附近无定义，
   最亮那一小团沿角度急速翻页。两处改成只按 `uColorPhase` 取色，不带角度。
3. **一颗灰球**：镜面高光的宽柔档指数只有 7——这个投影下球面法线随位置变化很慢，
   `pow(ndl, 7)` 摊满大半个半球。抬到 40/160 两档后才读作玻璃反光。
4. **整颗球右移半格**：画布用 `inset-0 m-auto` 居中，但画布比球盒宽属于超约束，
   CSS 把 auto 边距算成 0 并退化成左对齐。改回 `left-1/2 top-1/2` + translate，
   并让 dock 的贴边让位量按 `(PAD-1)/2 * size` 实算，否则外扩的光晕被视口裁掉。

## 遗留

- **`blend: 'ink'` 只是不坏，不算好看**。第一版给内部填了深色「本体」，白底上直接变成
  一块黑盘子；现在改成色相归一化后按覆盖率压墨、并把近白的镜面与热核基本关掉，
  结果是干净的，但对比度明显低于暗页。这颗球的观感是为暗页调的，亮页要好看需要
  另做一套减法混色，不属于本次范围。
- 极光节奏（自转速度、差分摆幅、亮起阈值）与 rim 包络对比度都是目视定的保守值，没逐帧校过。
- `state` 四态与眼睛的 `mood` 39 态是**两套独立的东西**：前者驱动球壳的亮度/转速，后者只驱动
  眼形播放列表。目前没有把 `state` 映射到 `mood` 的关系表，接 AI 时要决定谁说了算。
- 眼睛没接 `volume`：`stepEyes` 留了 `openness` 入参，说话时把眼睛睁大一点是现成的，但还没人喂它。
- 表情切换只做在**同一状态内的眼形之间** lerp；换 `mood` 时是从当前眼形直接过渡到新列表第一组，
  源里也是这个行为，但球上表情跨度更大，必要时可以加一条「换 mood 先眨一下」的过渡。
- 悬浮入口与沉浸页（`isImmersivePath`）的关系未定：视频/图片类工具全屏时是否让位。
- 点击行为刻意没接：`AIConfigDialog` 只挂在简历工具页里，在全局壳层点它不会有任何反应，
  所以入口先只做一颗可点按形变的球，不包 `button`、不给 `aria-label`。
