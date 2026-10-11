# 首页导览（页面介绍）· 设计记录

日期：2026-10-12
范围：`src/modules/page-tour/`（新增）、`src/components/fluid-orb/OrbBubble.tsx`（新增）、
`src/components/ai/AIOrbDock.tsx`、`src/layouts/app-shell/{AppShell,DockRail,DockHandle,MobileDock}.tsx`、
`src/pages/home-page.tsx`、`src/components/home/circuit/CircuitBoard.tsx`、`common.json`（zh/en）

## 背景

悬浮球接上眼睛之后已经会跟随鼠标、点一下换表情，但它对页面本身还是"哑"的。
这一步让它当讲解员：点气泡里的「页面介绍」，球逐个飞到首页的关键部位，
把该处用虚线框圈出来、周围模糊掉，气泡里换成讲解文案与「下一步」。

## 决策与取舍

| 议题       | 结论                                      | 理由                                                                                                                                                     |
| ---------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 聚光实现   | 目标四周铺 4 块 `backdrop-blur` 面板      | 不用 clip-path / SVG mask 挖孔：backdrop-filter 配挖孔在 Safari 上表现不一致。四块各自模糊身后内容，拼起来视觉上是一整片，且天然能跟着目标做位置尺寸过渡 |
| 层级       | 遮罩 z-45，球与气泡介绍期间 z-60          | 遮罩要盖住 dock（z-40）；球是讲解员，不能被自己请来的幕布挡住                                                                                            |
| 定位上下文 | 用 `absolute` 挂 app-shell 根，不用 fixed | 项目约定唯一滚动容器是 `<main>`（AGENTS.md §6），再开 fixed 层会跟这套壳打架                                                                             |
| 目标声明   | `data-tour` 属性 + 表驱动顺序             | 比在导览里写死一堆 CSS 选择器稳；元素改类名不会悄悄断掉，改结构时属性跟着走                                                                              |
| 移动端目标 | 从 `resolveShellLayout` 推导              | 手机本来就不渲染顶栏胶囊，再抄一份「mobile 去掉 topNav」迟早和布局表对不上                                                                               |
| 推进方式   | 气泡内「下一步 / 结束介绍」+「跳过」      | 点球已经是"开关气泡 + 换表情"，再让它兼任推进会误触；三件事分开                                                                                          |
| 非首页     | 点了先 `navigate('/')` 再开第一步         | 介绍是为首页写的，不在工具页做半套                                                                                                                       |
| 退出       | Esc、点模糊区、结束介绍，三条路           | 说明类功能不该要求用户走完                                                                                                                               |

## 关键实现点

**滚动回正**：电路板比视口高，不滚就框不全。`scrollDelta` 分三种情况——已在安全区内返回 0
（否则每次切目标都抖一下）、被上/下边缘裁到就朝反方向滚、目标比视口还高时**对齐顶部而不是居中**
（居会让上下两头都露在外面）。

**等滚动停稳再量**：平滑滚动过程中量到的是中间态，虚线框会画在半路上。所以 `scrollBy` 之后用
rAF 轮询 `scrollTop`，连续 3 帧不变才算停，另有 60 帧上限兜底。没用 scroll 事件，是因为事件里
拿不到"不再变化"这个信息。

**气泡四向翻转**：`placeBubble` 按「上 → 下 → 左 → 右」找第一个塞得下的位置，再沿交叉轴夹进
视口——球贴着屏幕右边时居中的气泡会有一半溢出屏幕，靠这个位移推回来。四个方向都塞不下时退回
上方，至少交叉轴的夹取还能救回一部分。

**球停在框外**：`orbStation` 默认站框下方、右边缘与框对齐，下方放不下翻上方。站框内就会挡住
自己要讲的东西。

## 实现中改掉的四处

1. **全站点击失灵**（最严重）：聚光层的宿主 div 是 `absolute inset-0 z-45`，常驻挂载但漏了
   `pointer-events-none`。导览没开时它虽然不渲染任何面板，那层空壳仍然铺满整屏、盖在 dock
   （z-40）之上，把全站点击都吞了——`elementFromPoint` 在页面任意坐标都返回它。
   改成宿主 `pointer-events-none`、四块面板各自 `pointer-events-auto`：既让空壳透明，
   又保住「点模糊区退出介绍」。
2. **气泡完全不出现**：气泡是 `absolute`，而它所在的外层在默认态是 `inset-y-0` 的**整屏高竖带**，
   于是 `bottom-full` 把它顶到了视口之上。给球的外壳补 `relative` 才有正确的定位上下文。
3. **介绍结束后页面停在原地**：电路板那一步把页面滚了 297px，退出时没还原，用户的阅读位置丢了。
   改成 `start()` 记下 `scrollTop`、`stop()` 还原。实测 120 → 297 → 120。
4. **`OrbBubble.tsx` 同时导出组件和纯函数**触发 `react-refresh/only-export-components`。
   把 `placeBubble` 拆到 `orb-bubble-placement.ts`——它本来就该单独可测。

> 前两条都是"覆盖层忘了关指针"这一类错误。教训：**只要挂一层铺满的 absolute/fixed 容器，
> 落笔时就先写 `pointer-events-none`，再在真正要点的子元素上单独开 auto。**
> 单测抓不到它（没有 DOM 命中测试），只有 `elementFromPoint` 式的实测能抓到。

## 测试

纯逻辑 22 条：`targets.test.ts`（14：目标表按断点裁剪、虚线框夹取、4 块面板严丝合缝不压孔、
`scrollDelta` 四种情形、球位站定与翻转）、`orb-bubble-placement.test.ts`（8：四向优先级、
交叉轴夹取、气泡比屏幕宽时放弃位移）。UI 组件按 §10 不强制测。

## 验证

`pnpm lint && pnpm typecheck && pnpm test`（137 文件 / 2860 用例）全绿。
浏览器实测：点球开气泡（黑底亮边、箭头朝下）→ 点「页面介绍」→ 4 步逐个走完，
dock 步虚线框 (2,257,76,508) 套住左侧图标条、4 块模糊面板精确围在四周；
电路板步 `scrollTop` 从 0 变 297 把整块框进视口；结束介绍后球回停靠位、`cursor-grab` 恢复、
滚动位置还原 120。

## 遗留

- **移动端只过了单测，没目视**。`tourTargetsFor('mobile')` 断言为 dock/search/circuit 三步，
  但窄屏下气泡宽度、虚线框与球的站位没在真机或窄视口里看过。
- 导览文案只有首页四个目标；工具页、关于页没有对应步骤。
- 球"飞"过去只是 left/top 的 500ms 过渡，没有弧线或加速度；要更像活物得上 keyframes。
- 介绍期间球不可拖拽（`tour.active` 直接挡在 pointerdown 里），没给"拖走就退出介绍"的出口。

---

## 追加：导览配音（Madeline 人声）

范围：`src/modules/page-tour/{tour-voice.ts,use-tour-voice.ts}`（新增）、
`public/sounds/madeline/`（400 条 wav / 9.0 MB）、`src/config/ai-orb.ts`、`AIOrbDock.tsx`、
`common.json`（zh/en）

### 做法

音库是《Celeste》主角 Madeline 的人声素材，10 种情绪 × 4 条音轨 × 10 个变体 = 400 条
（`angry / deadpan / determined / distracted / normal / panic / sad / sadder / surprised / upset`，
各 40 条），每条 0.06~0.27s（中位 0.18s），正好是一个音节的尺度。所以"一句话"就是若干条
音效沿时间轴拼起来，和《动物森友会》《模拟市民》那类无词语音同一个路子——不念字，只给语气。

分两层，边界干净：

- `tour-voice.ts` 纯推导（文本 → `{clip, pauseBefore, seed}[]`），不碰 WebAudio，能单测。
  按标点切词组（中文没空格，只能靠标点分词），词组内停顿 45ms、逗号 160ms、句号 300ms。
  **一个字一条音效**，音节数超出 `MAX_PER_LINE=44` 预算时按比例并字而不是截断——
  中文四步文案是 38~43 个音节，正好全部落在一字一音上；英文同样内容 79~121 个字母，
  自动并成每条约 3 个字母，念得完也不会比中文慢一截。
- `use-tour-voice.ts` 只管排程：每条一个 `BufferSource`，`at += duration / playbackRate` 往后推。
  没有先拼成一个大 buffer——效果一样，但能逐条调速率、能中途 `stop()`、不用为重采样改口径。

**取音用 FNV-1a 哈希而不是 `Math.random`**：同一句话必须永远念成同一个调。随机取音听起来是
噪声不是话，而且出问题复现不了。哈希的键是**这条音效承担的那几个字**而不是它在句中的序号，
所以同一个字在哪儿都念成同一个音、重复出现的词也就念得一样——这是"像话"和"像抽噪声"的分界。
`seed` 顺便当播放速率抖动（0.94~1.06），免得每条一个调。

`aiOrbConfig.tour.lines[step]` 可给 `clips` 数组显式指定整句音效，给了就完全照它播——
这就是"一句话挑多个音效拼起来"的手调入口。电路板那步用了 7 条 `surprised_*`。
十种情绪现在都可选，改 `lines[step].emotion` 即可。

### 改掉的三处

1. **一句话被自己打断成杂音**（本轮实测抓到）：开口条件最初写成"这一步测到位置了才念"，
   把 `tour.rect` 放进了依赖。而 rect 在滚动过程中会被视口监听反复写入新对象
   （`use-page-tour` 的 `scroll` 监听），于是平滑滚动的每一帧都重新 `speak()` 一次，
   同一句被自己掐了十几遍。改成只以 `stepKey / active / sentence` 为触发条件。
   实测修前 41 次 `start()`、修后每步恰好一个 cluster（当时的计数是 14 / 15 / 13 / 7 条；
   换成一字一音之后同一步变成 42 条）。
2. **`useEffect` 依赖整个 `voice` 对象**：hook 每次渲染返回新字面量，依赖它等于依赖"每次渲染"。
   解构出稳定的 `stop` 再依赖。
3. **cleanup 里读 `cacheRef.current`** 触发 `react-hooks/exhaustive-deps` 警告。
   在 effect 体内先取局部变量。

### 交互

气泡右上角一枚 `Volume2`，点一下重播本句（`speak` 开头就 `stop`，所以是"从头念"不是"叠上去"）。
它不是静音键：配音的开关在 `aiOrbConfig.tour.sound`，代码级。导览结束（走完 / 跳过 / Esc）
会把已排程的音效掐掉，否则球都回 dock 了声音还在念后半句。

### 验证

`pnpm lint && pnpm typecheck && pnpm test`（138 文件 / 2880 用例）全绿，其中 `tour-voice.test.ts` 20 条。
有一条单测直接读 `public/sounds/madeline/` 按 10 种情绪比对文件清单——命名规律一旦和实际资源
对不上，运行时就是成片 404，只能靠这种闸拦住。

浏览器实测（CDP 可信点击 + 打桩记录 `AudioBufferSourceNode.start`）：dock 那步 42 条音效，
正好等于该句 42 个音节（一字一音），平均单条 0.181s、整句 9.95s 念完；首条 `pauseBefore=0`、
句号前后 300ms、逗号 160ms、组内 45ms 全部对得上；速率抖动落在 0.94~1.05；
音效请求全 200，控制台无报错。七种新加情绪各抽一条走 HTTP 复核均为 200。
静音态下走完一步 0 次 `start()`；取消静音不重播当前句；点重播键多出一个干净的 cluster。

### 遗留（新增）

- **版权**：这批 wav 是《Celeste》的第三方素材，现在 400 条 / 9.0 MB 躺在 `public/` 里，
  站点部署即对外分发。上线前要么换成可再分发的音库（Kenney Voiceover Pack 是 CC0 的现成替代），
  要么拿到明确授权。
- 无运行时静音开关。想临时闭嘴只能 Esc 退出导览。
- 中文整句约 10 秒，比原来（三个字并一条）长两倍多；嫌拖就调 `MAX_PER_LINE`，
  它同时是预算和并字比例。
- 十种情绪目前只排上三种（normal / determined / surprised），其余七种进了库没被用到。
