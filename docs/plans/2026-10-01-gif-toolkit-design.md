# GIF 工具族（video-to-gif / gif-maker / gif-compressor / gif-editor）设计

日期：2026-10-01 · 分类：`images` +3、`video` +1 · 共享内核：`src/modules/gif/`

## 1. 目标与竞品缺口

对标 [ezgif 全工具清单](https://ezgif.com/all)、[GIPHY Create](https://giphy.com/create)、
[makeagif](https://www.makeagif.com/)、[CloudConvert](https://cloudconvert.com/gif-converter)、
[ScreenToGif](https://segmentfault.com/a/1190000048069485)、SOOGIF / gif.cn / yasuotu，以及本地派
[LZL Tool](https://lzltool.com/gif-compressor)：

| 竞品具备                                                    | 本项目做法                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| 上传到服务器处理（ezgif 200MB、1 小时后清除；广告 + 限流）  | 全量本地处理，明示「文件不离开你的设备」                    |
| 一个意图一个 URL（`/optimize` `/compress` `/video-to-gif`） | 同样拆薄工具，共用一套内核                                  |
| 体积目标只有 KB 数字                                        | **平台预设 + 自动搜索达标参数**（竞品都不做平台化预设矩阵） |
| 逐帧编辑只有 ScreenToGif（Windows 独占）                    | 在线唯一帧级编辑器                                          |
| YouTube / TikTok / 微博 URL 抓取                            | **不做**（CORS + ToS，且 §12 禁后端）                       |
| 服务端 FFmpeg 覆盖 MKV/HEVC/AVI                             | **不做**（见 §3 ffmpeg 取舍）                               |
| 免费版加视觉水印、每日配额、登录提速                        | **不做**（反品牌，且本地工具无成本可言）                    |

**刻意不做**：URL 输入、ffmpeg.wasm、gifski、AI 抠图、逐帧像素涂抹、GIF→MP4（留 v2）、
WebP/APNG/AVIF 动图互转、视觉特效与贴纸、账号与分享链接。

## 2. 决策记录（11 项，已与用户逐条对齐）

| #   | 决策                     | 结论与理由                                                                                           |
| --- | ------------------------ | ---------------------------------------------------------------------------------------------------- |
| Q1  | 产品形态                 | 多入口薄工具 + 共享内核。路由是扁平的（`router.tsx:24-31`），一意图一 URL 才吃得到独立搜索词         |
| Q2  | 首批范围                 | video-to-gif、gif-maker、gif-compressor、gif-editor 四个                                             |
| Q3  | 编解码内核               | `gifenc`（编码）+ `modern-gif`/`gifuct-js`（解码），全 MIT                                           |
| Q4  | 与 image-compressor 边界 | gifsicle 加载逻辑上移到 `modules/gif/optimize.ts`，`engines/gif-image.ts` 改为调用；GIF 结果卡加内链 |
| Q5  | 视频取帧                 | `<video>` + `seeked` + `drawImage`，主线程取帧、Worker 编码                                          |
| Q6  | 超限策略                 | 逐帧流式编码（不整帧常驻）+ 硬上限拒绝，并给可操作的降级建议                                         |
| Q7  | ffmpeg.wasm              | v1 不引入                                                                                            |
| Q8  | 编辑器深度               | 帧级操作，不做像素涂抹                                                                               |
| Q9  | 达标搜索                 | 经验公式估初值 + 最多 5 轮实测，按破坏性从小到大排阶梯                                               |
| Q10 | 分类归属                 | 分插 `images` / `video`，不新建分类、不改 `categories.ts` 与 `tools/index.ts`                        |
| Q11 | 移动端                   | 桌面优先；移动端可用但自动收紧上限，时间轴退化为数字输入 + 预览帧                                    |

## 3. 引擎与许可证（硬约束）

本站 `package.json` 声明 MIT 且为公开仓库，许可证必须逐项核过：

- **`gifenc`**（[MIT](https://github.com/mattdesl/gifenc)，3,897 B gzip，零依赖，DOM-free 可进 Worker）。
  API：`GIFEncoder(opts)` / `quantize(rgba, maxColors, { format, oneBitAlpha, clearAlpha,
clearAlphaThreshold, clearAlphaColor })` / `applyPalette(rgba, palette, format)` /
  `writeFrame(index, width, height, { palette, first, delay, repeat, transparent,
transparentIndex, dispose })` / `finish()` / `bytes()`。
  **README 明写「currently no dithering support」，且不做帧差优化** —— 见 §5 的后处理补偿。
- **`modern-gif`**（[MIT](https://www.npmjs.com/package/modern-gif)，2.1.0 / 2026-04，编解码都支持，
  内置 floyd-steinberg / atkinson / stucki 抖动与多 Worker）。社区小（63 星、约 5.2 万月度下载），
  所以 M0 要先跑基准；`gifuct-js`（MIT，1 KB/模块，仅解码）是退路。
- **已具备**：`gifsicle-wasm-browser`（`public/codecs/gif/index.browser.js` + `public/wasm/gif.wasm`）。
  npm 标 MIT 但内嵌 GPL-2.0 [gifsicle](https://github.com/kohler/gifsicle)，约 146 KB gzip。
  **它已在 `compress.worker.ts` 的 module Worker 里跑通**（`gif-image.ts:18-24` 动态 `import()`），
  所以「gifsicle 能否进 Worker」不是未知项。代价是要在文档与页面承认 GPL 组件的存在。
- **排除 `gifski-wasm`**（[AGPL-3.0](https://github.com/ImageOptim/gifski)）：画质最好，但 AGPL 会把
  打进 bundle 的分发物拖进传染义务，与本站 MIT 直接冲突。
- **排除 `ffmpeg.wasm`**（`@ffmpeg/core` 与 `core-mt` 是 **GPL-2.0-or-later**，因编入了 x264）：
  core wasm 32,232,419 B 原始 / 约 10 MB gzip；[实测记录](https://blog.csdn.net/qq_43274490/article/details/163371446)
  称移动端首开下载约 30MB 需 3–5 秒，单线程吞吐只有**原生的 9.8%**、4 逻辑核并行约 **28%**，
  内存峰值「数百 MB 到 3GB 以上」；`core-mt` 还要 COOP/COEP 全站跨源隔离，而 Safari 不支持
  `credentialless`。它相对现有链路的唯一不可替代价值是容器/编码覆盖（MKV/AVI/HEVC/ProRes），
  画质侧靠 §5 的 gifsicle 后处理逼近。若日后要做，身份只能是「按需下载的兼容模式」，
  动态 import + Cache API 持久化，绝不进 `public/codecs/` 默认资源。

## 4. 共享内核 `src/modules/gif/`

```
src/modules/gif/
├── types.ts          GifFrame { rgba: Uint8ClampedArray; delayCs } · GifMeta { loop, transparent } · FrameSource 接口
├── encode.ts         quantize → applyPalette → 逐帧 writeFrame 流式（不整帧常驻）
├── decode.ts         GIF → 全帧展开 RGBA + 元数据（**强制 unoptimize 语义**，否则逐帧编辑必出鬼影）
├── optimize.ts       gifsicle 封装：--lossy / --colors / --dither / -O1..3 / --crop / --resize / --delay / --loopcount
├── frame-source.ts   VideoFrameSource · ImageFilesFrameSource · GifFrameSource · RendererFrameSource
├── budget.ts         上限表 + estimateGifBytes() + checkBudget() → { ok, reason, suggestion }
├── targets.ts        平台预设表 + searchUnderTarget(注入 encode 回调的阶梯搜索)
└── worker/           gif.worker.ts + use-gif-worker.ts（照 image-compressor 的双 Worker 模式）
```

**数据流**：主线程 FrameSource 取一帧 RGBA → transferable `postMessage` 进 Worker → `encode.ts`
增量 `writeFrame` → 需要优化时同 Worker 内调 `optimize.ts` → Blob 回主线程 → `utils/download.ts`
的 `downloadBlob`（**不用**工具目录里现有的两份 `download.ts` 副本，§7 禁止重复）。
取帧留主线程是因为 Worker 无 DOM，造不出 `<video>`；量化、编码、优化全在 Worker。

**上限表**（超限直接拒绝并给可操作提示，Q6）：

|           | 输出宽                     | 时长 | 帧数 | 预估体积 |
| --------- | -------------------------- | ---- | ---- | -------- |
| 桌面 ≥768 | ≤480px（720px 需二次确认） | ≤20s | ≤300 | >12MB 拒 |
| 移动 <768 | ≤320px                     | ≤10s | ≤120 | >6MB 拒  |

**时间单位**：GIF 只有 1/100 秒的 `delay`，内部一律用 centisecond 整数，禁止毫秒浮点参与换算
（Pillow 的 `duration` 是 ms，off-by-100 是经典事故源）。

**错误处理**：容器不在白名单 → 拒并列出支持格式；单帧 seek 超 3s → 跳过该帧并累计 warning，
末尾提示「已跳过 N 帧」；iOS canvas 上限 4096×4096 预检；Worker 崩溃 → `terminate` 重建 + 一次性提示。

## 5. 画质链路的补偿

gifenc 无抖动、不做帧差，所以质量与体积都靠后处理闭合：

- 需要降颜色数时交给 `gifsicle --colors=N --dither=floyd-steinberg`（现有 `gif-image.ts` 已在这么用）。
- 体积交给 `--lossy` + `--optimize=3`（站内现在只有 `-O3 --colors --dither`，**`--lossy` 是这次新增的杠杆**）。
- 帧间差分交给 gifsicle（gifenc 输出的是全帧关键帧，gifsicle `-O3` 会自动做最小差异帧）。
- 注意 gifsicle 的 `--dither` 默认关闭是有意为之：它会让文件变大并可能让噪声本身「动起来」，
  所以抖动在 UI 里是**可选项且默认关**。
- 首帧必须全帧，否则出现开场闪帧。
- `-O3` 不保证变小，个别输入会变大 → 输出体积大于输入时保留原文件并提示（照 image-compressor
  已有的 `preservedOriginal` 语义）。

## 6. 四个入口的功能与 UI 边界

**`/video-to-gif`**（video，`icon: Clapperboard` 同分类已有）
单视频，白名单 mp4/mov/webm（H.264/VP8/VP9）。参数：起止时间、fps（5/8/10/12/15/24，默认 12）、
输出宽（240/320/480/720，默认 320）、裁剪（1:1 / 4:3 / 16:9 / 自由）、循环、体积目标、抖动开关。
取帧即降采样：`seeked` → `drawImage` 到**目标尺寸**离屏 canvas → `getImageData` → transfer；
不做「全尺寸取帧再缩」，那会白吃一倍内存。进度两段显示（取帧 N/M、编码 N/M），均可取消。
移动端：起止时间退化为数字输入 + 预览帧。

**`/gif-maker`**（images）
≥2 张静帧（png/jpg/webp/avif，heic 走已有 `heic-to`），卡片流拖拽排序（交互照 `image-stack`）。
尺寸归一化：GIF 逻辑屏要求同尺寸 → 按目标最长边缩放 + 居中垫底色（可选透明）。
延时默认 10cs，支持统一与逐帧。EXIF 方向靠 `createImageBitmap(blob, { imageOrientation: 'from-image' })` 消除。
上限：>300 张拒（桌面档）。

**`/gif-compressor`**（images）
单个或多个 GIF，批量走 `jszip`。两模式：手动（尺寸 / 颜色数 / lossy / 抖动 / 帧抽样）与
平台预设（见 §7），预设走估算初值 + 最多 5 轮实测。输出原体积 vs 新体积 + 达标徽章 + 并排 A/B 预览。
收口：`optimize.ts` 上移后 `engines/gif-image.ts` 改为调用它，image-compressor 的 GIF 结果卡加一行
「要卡平台体积 → /gif-compressor」的内链。

**`/gif-editor`**（images）
单 GIF 解码为全帧后：勾选删帧 / 复制帧 / 改单帧延时 / 反向 / 乒乓 / 旋转 90·180·270 /
水平垂直翻转 / 整体 resize·crop / 改 loop / 抽帧导出 PNG(ZIP) / 拼接第二个 GIF（异尺寸走 maker 的居中垫底）。

每个入口仍是标准三件套。`service.ts` 只放**可单测的纯逻辑**（参数归一化、gifsicle 命令数组构造、
预算估算、阶梯搜索、fps↔delay 换算）；像素与编码属 Worker，不进 service（§7 要求 service 零 DOM）。

## 7. 平台预设与达标搜索

| 目标             | 约束                     | 来源可靠性                                                                                                                            |
| ---------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 微信表情         | ≤200KB、≤240×240、≤3s    | **工具站点流传值，无官方文档** → UI 措辞必须写「参考值」                                                                              |
| Slack 自定义表情 | 128KB 建议、方图、≤50 帧 | [Slack 官方帮助](https://slack.com/intl/zh-sg/help/articles/206870177-)                                                               |
| Discord sticker  | 500KB、320×320           | [规格说明](https://eu.esotericsoftware.com/blog/How-to-create-your-own-Telegram-and-Discord-stickers)；消息附件 20MB（2026-08-17 起） |
| GitHub 附件      | 10MB                     | [GitHub Docs](https://docs.github.com/zh/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)              |
| X / 微博         | 无权威 GIF 规格          | 按视频口径处理，**不硬编数字**                                                                                                        |
| 自定义           | 用户输入 KB              | —                                                                                                                                     |

搜索阶梯按破坏性从小到大：降 fps → 降尺寸 → 降颜色数 → 加 `--lossy`。最多 5 轮，
每轮是一次完整「编码 + 优化」。§12 实测修正了两点：① 帧差对高动效内容收益为 0，所以照片型内容
要把**降尺寸排在降 fps 之前**才有效；② 一轮实测成本约 0.1–1.8 秒，5 轮最坏约 9 秒。
5 轮仍不达标就停止并给可操作建议（剪短 / 减帧 / 转 MP4），而不是无限跑。
**达标结果必须把最终参数显示给用户**——实测照片内容要进 Slack 128KB 得退到 160×90 + 64 色，
不显示出来用户会以为工具把图弄坏了。先验公式在 `budget.ts`，实测校验在 `targets.ts`，
两者都是纯函数，测试用 fake encode 注入。

## 8. 落地清单

- 新增依赖：`gifenc` +（`modern-gif` 或 `gifuct-js`）。理由：站内只有 MP4 输出（`mp4-muxer`）与
  gifsicle（只吃 GIF），**没有任何 RGBA→GIF 编码能力**；两者 MIT、合计约 25KB gzip、无功能重叠。
- 新增 `src/modules/gif/`（§4 全部文件 + worker）。
- 新增 4 个工具目录三件套：`pnpm create:tool -- images gif-maker` 等（禁止手工复制）。
- 注册只动 `src/tools/images/index.ts`、`src/tools/video/index.ts`。
- i18n：`locales/{zh,en}/tools-images.json` +3 键块、`tools-video.json` +1 键块；`keywords` 双语齐全。
- 纯 JS 依赖，**不需要新增 `public/codecs/` 资源**；若日后加 wasm，必须走 `scripts/prepare-codecs.mjs`
  与 `vite.config.ts:71` 的 dev 中间件。
- **不碰**：`src/tools/index.ts`、`src/tools/categories.ts`、`components/ui/`。
- 文档同步：`docs/design/功能介绍文档.md` 补四个工具、`docs/INDEX.md` 与 README 的工具数
  （48 → 52）、`pnpm generate:sitemap` 重生成。

## 9. 测试与验收

`src/test/modules/gif/` 与 `src/test/tools/{images,video}/…`（镜像源码目录）：

- `budget`：三档上限的通过/拒绝边界值、移动端分档生效。
- `targets`：注入 fake encode，断言 5 轮内达标返回最优组合；不达标返回 suggestion 而非死循环。
- `optimize`：命令数组构造正确性 —— **这是唯一的安全面**。gifsicle 吃的是字符串命令，
  `--colors=N` 这类拼接前必须 `Number.isInteger` 收窄，尺寸/延时/lossy 全部数值化，
  禁止任何用户字符串直通命令（§12）。
- `encode`/`decode`：手工构造 RGBA 编出 GIF 再解回，断言帧数 / delayCs / loop 往返一致，全程不碰 DOM。
- `maker`/`video` 的 service：尺寸归一化与居中垫底、fps→centisecond 取整、排序后帧序映射、非法输入抛英文 `Error`。
- 门禁：`pnpm lint` + `pnpm typecheck` + `pnpm test`（含 i18n parity、tool-seo keys、html-sinks 三个脚本）全绿；
  dev server 在 375 / 900 / 1440 三断点实测，并在 iOS Safari 或同内核设备上验一次取帧与内存表现。
- 按 AGENTS.md §11，改动只留在工作区，不 `add` / `commit` / `push`。

## 10. 里程碑（顺序按风险排，不按价值排）

| 步骤 | 内容                                                                                                                                                                                                                   | 状态                                                                                                                  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| M0   | POC 验三个真未知：① gifenc 无抖动 + gifsicle 后处理的画质是否可接受；② 「60 帧 320px 压进 Slack 128KB」是否现实；③ `<video>`+seek 取 96 帧（12fps×8s）在 Safari 的耗时与精度。任一不过 → 回 Q9/Q5 重议，不得先写工具层 | ✅ Chrome 侧完成，结论见 §12；**Safari 真机仍待补测**                                                                 |
| M1   | `modules/gif` 内核 + `/gif-compressor`（含 `gif-image.ts` 重构，先啃最不确定的）                                                                                                                                       | ✅ 内核 5 文件 + Worker 通道 + 工具 + 51 单测；浏览器实测两种模式通过                                                 |
| M2   | `/gif-maker`（不依赖视频解码，最快出第二个入口）                                                                                                                                                                       | ✅ 3 图 → 200×140 GIF 浏览器实测通过                                                                                  |
| M3   | `/video-to-gif`                                                                                                                                                                                                        | ✅ Chrome 实测：2.5s WebM → 30 帧 320×180（71KB），目标 5KB 时 4 轮搜索到 144px/48 色/lossy200；**Safari 真机待补测** |
| M4   | `/gif-editor`                                                                                                                                                                                                          | ✅ 删帧/复制/排序/反向/旋转/导出全链路实测通过                                                                        |

### M2–M4 落地时新增的共享件

- `src/components/file-drop-zone.tsx`：站点原本有 `image-compressor` 与 `image-stack` 两份几乎相同的上传区，
  再加三个工具就是第四份。抽出 `FileDropZone`（点选/拖拽含文件夹/剪贴板粘贴）与 `FileAddButtons`（工作区内
  「继续添加」），新工具一律复用。**旧的两份尚未迁移**，留作后续统一。
- `src/utils/array-ops.ts`：`moveItem` / `reverseItems` / `boomerang` / `deleteAt` / `duplicateAt`。
- `src/utils/format-bytes.ts`：体积人性化显示。
- `src/modules/gif/image-frames.ts`（主线程取像素）、`video-frames.ts`（seek 取帧 + 空帧重试 + seek 超时跳过）、
  `transform.ts`（纯像素旋转/翻转 + canvas 缩放）、`shrink.ts`（对已编好的 GIF 做达标搜索，压缩器与视频工具共用）。
- Worker 协议新增 `encode` 与 `decode` 两种请求；RGBA 走 transferable。

### 浏览器实测抓出的两个真 bug（单测没抓到）

1. **`stepAt` 覆盖了调用方的选择**：阶梯原本直接写入绝对值（`maxColors: spec.maxColors`），
   导致调用方传入的 64 色/lossy120 在第 0 级被改写回 256 色/lossy0。改成相对起点收紧：
   `min(start.maxColors, spec.maxColors)` 与 `max(start.lossy, spec.lossy)`。
2. **编辑器导出被压扁**：帧已是旋转后的 80×120，却又把 `optimizeOptionsFor(params, meta)` 的 resize
   传了下去，gifsicle 按**旋转前**的 120×80 比例重算高度 → 成品 80×53。修法：编辑器的优化步只传
   `{optimizeLevel: 3, maxColors: 256}`，不再 resize。
3. 另外修正了一处测试素材自身的错误：gifenc 的 `delay` 入参是**毫秒**，按厘秒填会让 fixture 的
   帧延时变成 2cs。代码没错，是测试写错了。

M1 落地时对设计做的三处修正（已同步进代码与测试）：

1. `maxColors` 合法区间是 **2..256**（GIF 调色板上限就是 256），不是 2..255。
2. `checkBudget` 删掉了「预估体积 >12MB 拒绝」这条 —— 在 480×480×300 帧的顶格下估算只有 2.4MB，
   该分支永远不可达；同时补上原本缺失的 `maxHeight` 上限（只限宽不限高是个真漏洞）。
3. `gifsicle` 的 glue 只能用**变量**保存路径再 `import()`，字面量会被 `vite:import-analysis`
   判定为「import public 下的 JS」而构建失败。
4. 压缩器没有 fps 杠杆（gifsicle 不改帧率），所以搜索阶梯里让它停在地板值 5 不再下探。

## 11. 已知缺口与风险

- `modern-gif` 与 `gifenc` 的**实际输出体积/画质没有公开基准** —— 已由 §12 的 POC 实测补上。
- 微信表情约束无官方来源，UI 只能标「参考值」，不写成承诺。
- `gifsicle-wasm-browser` 恢复的是 gifsicle 1.92，上游已到 1.96，存在能力漂移；且 npm 标 MIT 而内嵌
  GPL 代码 —— 需要在文档里显式声明该组件及其许可证。
- `<video>+seek` 的精度受关键帧间隔影响，Safari 更差，实际起止点会偏；v1 的口径是
  「按 seek 结果为准 + 预览即所得」，不做承诺级精确裁剪。**Safari/iOS 的 seek 耗时与精度本机无法测**
  （Windows 环境），必须在真机上补测后才能宣布 M3 完成。
- 移动端 4096×4096 canvas 上限与 jetsam 内存回收是硬墙，只能靠 §4 的上限表与拒绝提示兜住。
- `gifenc` 的 `quantize()` 内部按 `new Uint32Array(data.buffer)` 读像素，**传入的 RGBA 数组必须独占
  整个 ArrayBuffer**（从大 buffer 里 `subarray` 出来会读到越界数据）。取帧时始终用新分配的数组。
- Node/Vitest 侧 `import 'gifenc'` 会命中 `main`（CJS，无具名导出），必须 `import pkg from 'gifenc'`
  再解构；Vite 侧走 `module`（ESM）才支持具名导入。测试环境要按前者写。

## 12. M0 POC 实测结果（2026-10-01，Node 24 + Chrome，临时脚本已删）

**编码耗时与体积**（320×180 × 60 帧；`ui` = 屏幕录制型内容，`photo` = 平滑渐变照片型内容）

| 引擎配置               | ui 体积 | ui 耗时 | photo 体积   | photo 耗时 |
| ---------------------- | ------- | ------- | ------------ | ---------- |
| gifenc 256 色          | 118.8KB | 68ms    | 835.4KB      | 156ms      |
| gifenc 128 色          | 118.8KB | 61ms    | 708.9KB      | 141ms      |
| gifenc 64 色           | 118.8KB | 59ms    | 517.8KB      | 127ms      |
| modern-gif 256 无抖动  | 119.7KB | 361ms   | 1194.5KB     | 862ms      |
| modern-gif 128 + floyd | 108.9KB | 670ms   | **1667.5KB** | 2923ms     |
| modern-gif 64 + floyd  | 87.0KB  | 726ms   | 1564.0KB     | 2167ms     |

**结论 1：gifenc 比 modern-gif 快 5–10 倍且输出更小，编码只用 gifenc。**
`modern-gif` 降级为**只取 `decode` / `decodeFrames`**（Node 里可直接跑，正好喂 §9 的往返单测）。

**结论 2：抖动是体积反向杠杆。** photo 内容开 floyd-steinberg 从 1194.5KB 涨到 1667.5KB（**+40%**），
耗时从 862ms 涨到 2923ms。设计上「抖动默认关」是对的，UI 上必须写成"更细腻但更大更慢"。

**gifsicle 后处理**（对 gifenc 256 色输出，浏览器内 module Worker + 生产同源 glue）

| 命令                                          | ui 118.8KB →        | photo 835.4KB →         |
| --------------------------------------------- | ------------------- | ----------------------- |
| `-O3`                                         | 55.8KB (53%↓) 52ms  | **835.1KB (0%↓)** 266ms |
| `-O3 --lossy=40`                              | 42.3KB (64%↓) 83ms  | 579.7KB (31%↓) 836ms    |
| `-O3 --lossy=80`                              | 40.1KB (66%↓) 80ms  | 556.8KB (33%↓) 713ms    |
| `-O3 --lossy=200 --colors=128`                | 37.6KB (68%↓) 78ms  | 335.1KB (60%↓) 625ms    |
| `-O3 --resize=240x135 --lossy=160`            | 33.3KB (72%↓) 184ms | 325.8KB (61%↓) 409ms    |
| `-O3 --resize=160x90 --colors=64 --lossy=200` | 16.0KB (87%↓) 94ms  | 119.9KB (86%↓) 215ms    |

**结论 3：帧差（`-O3`）对低动效内容是最大杠杆（53%↓），对高动效照片内容完全无效（0%↓）**
—— 因为 gifenc 输出的是全帧关键帧，静止区域才能被差异掉。所以自动搜索的阶梯顺序
（§7：fps → 尺寸 → 颜色数 → lossy）对照片内容必须**优先降尺寸**才有效，实测只有
`resize=160x90 + 64色 + lossy=200` 才把 60 帧照片压进 119.9KB（Slack 128KB 达标）。

**结论 4：达标搜索的成本可以接受。** 一轮 = gifenc 编码（60 帧约 70–160ms）+ gifsicle 优化
（50–1600ms）≈ **0.1–1.8 秒**，5 轮最坏约 9 秒，桌面可接受、移动端需按 §4 收紧档。

**结论 5（真机风险）：`<video>`+seek 在 Chrome 表现极好** —— 36 帧交替正序/倒序 seek 共 373ms
（平均 seek 10ms、drawImage+getImageData 0.3ms），`currentTime` 误差 0.000s。
但**首轮实测有 1/36 帧读回全黑，重跑变成 36/36 正常** —— 说明存在偶发空帧。
实现时必须做**读回像素校验 + 最多重试一次**，不能假设 seek 成功即帧有效。

**上限表的标定依据**：480×270 × 300 帧（桌面档顶格）= gifenc 758.7KB / 518ms / 1.73ms每帧；
若不做流式，RGBA 常驻内存为 **148MB** —— 这就是 §4「逐帧流式、不整帧常驻」的量化理由。
经验公式初值：UI 类内容约 **20KB/百万像素**（无帧差），经 `-O3` 后降到约 9KB/百万像素。

## 13. gif-editor 增强：裁剪 / 实时预览 / 倍速（2026-10-01 追加）

用户验收后追加三项，均已实现并浏览器实测：

| 能力        | 实现                                                                            | 关键取舍                                                                                        |
| ----------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 画面裁剪    | `crop-overlay.tsx`：预览图上拖框平移 + 四角缩放，配 自由/1:1/16:9/4:3/9:16 锁定 | 裁剪框存在**旋转后**的坐标系里，所以所见即所得；代价是旋转一下旧框会被 `clampRect` 重新收进画面 |
| 实时预览    | `use-frame-player.ts`：canvas 上按每帧延时循环播放                              | **逐帧现算现画，不预生成整套变换帧**——300 帧 480px 全量常驻是 270MB 量级，而单帧现算只有 1–3ms  |
| 加速 / 减速 | `speed.ts`：0.25×–4× 档位，只缩放 delay                                         | 倍速不删帧，所以**体积不变、时长变短**；低于 2 厘秒会被抬到下限并提示，否则浏览器丢帧表现为闪烁 |

新增共享内核：`modules/gif/crop.ts`（`centerCrop`/`clampRect`/`sizeForRatio`/`mapRect`）、
`modules/gif/speed.ts`、`transform.ts` 增加 `cropImage`（逐行 memcpy 的纯像素裁剪）。
`centerCrop` 同时替换了 video-to-gif 里原有的 `cropFor`，避免两个工具各写一份裁剪数学。

实测数据（8 帧 200×120、每帧 20 厘秒的素材）：1:1 裁剪框几何 = left 20% / width 60% / height 100%，
输出 120×120；倍速 2× 后时长徽标 1.6s → 0.8s；导出成品 naturalSize = 120×120，与预览一致。

**验证踩坑记录**：内置浏览器标签页处于 hidden 状态时 Chrome 会把 `setTimeout` 节流到约 1 秒一次，
逐帧 200ms 的播放器看起来"完全不动"。判断播放循环是否真的工作，要用
`putImageData` 调用计数或直接比较两帧像素，而不是在隐藏标签页里等时间。

## 14. 排版返工 + gif-maker 能力补齐（2026-10-01 追加）

用户反馈两点：右侧工具栏「反人类、冗余说明过多」，以及 gif-maker 功能太少、gif-editor 层次不清。

**面板排版统一**（gif-compressor / gif-maker / gif-editor / video-to-gif 四处一致）：
弃掉自定义 `ParamField` 堆叠，改用 `components/panel-fields.tsx` 的
`PanelGroup(Card + divide-y) > PanelSection(Collapsible + grid-cols-2)`；
单位写进标签括号（`边距(px)`）而不是输入框后缀，说明只在必要处留一行。
布局从 `ResizablePanelGroup`（可拖拽分栏 + 面板内 `ScrollArea`）换成
`grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,340px)]`——
右栏固定 340px 上限，<xl 时整块换行到工作区下方；页面内不再有第二层滚动容器，
符合 AGENTS.md §6「唯一滚动容器是 `<main>`」。

**gif-maker 新增**：

| 能力                 | 实现                                                                                                 | 取舍                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 最终比例 + 填充方式  | `crop.ts` 的 `canvasForRatio`（长边锁定 `settings.width`）+ `placementRect`（contain/cover/stretch） | 比例锚定**首图**，其余图按同一画布贴入；`source` 档表示不锁比例       |
| 颜色数 / 抖动        | gifenc `quantize` 的 `maxColors` 与 `dithering` 入参                                                 | gifenc 只有 Bayer 抖动，够用；`lossy` 交给 gifsicle                   |
| 目标体积达标搜索     | 复用 `shrink.ts`（§7 的 7 级梯 + skip-ahead）                                                        | 三工具共用一条搜索链路，不再各写一遍                                  |
| 帧排序 / 反向 / 乒乓 | `utils/array-ops.ts`：`moveItem`/`reverseItems`/`boomerang`/`duplicateAt`/`deleteAt`                 | 指针拖拽换序走 `data-frame-index` + `elementFromPoint`，不引入 dnd 库 |
| 实时预估             | `estimateBytes(frames, canvas)`（§12 的 20KB/百万像素）                                              | 只做量级提示，徽标写「预估」，不假装精确                              |
| 逐帧延时改用「秒」   | `speed.ts` 的 `secondsToCs`/`csToSeconds`，输入 `0.20` → 存 20 厘秒                                  | 厘秒仍是唯一内部单位，秒只是 UI 表皮                                  |

**gif-editor 三层结构**：上层预览（canvas + 裁剪框）、中层播放（播放/暂停 + `Slider` 进度条 +
`N / M · x.xs` 读数）、下层缩略图卡片横向条（点击跳转并自动暂停、勾选、逐帧秒数、上移/复制/删除）。
`use-frame-player` 从 `requestAnimationFrame` 循环改为 state 驱动的 `setTimeout` 链，
播放头越界用派生值 `Math.min(playhead, frames.length-1)` 收敛，避免在 effect 里回写 state。

实测（8 帧 200×120 素材）：卡片条 8 张、`sliderMax=7`、点击第 6 张后读数 `6 / 8`、
跳转即暂停；maker 锁 1:1 后画布 320×240 → 320×320，导出 2 KB 并提示「已用 gifsicle -O3 优化」。

## 15. gif-editor 整页化：撑到视窗底部 + 右栏升级为工具栏（2026-10-01 追加）

用户反馈两点：三层结构没撑到视窗底部（缩略图下方一大片空白），以及顶部动作条应该并入右栏。

**整页式布局**：`index.ts` 标 `immersive: true` 走 `ToolLayout` 的 fill 分支（页内自管版面），
组件自带紧凑头部（图标 + h2 标题 + 描述 + 收藏 / 复制链接），根容器
`min-h-[calc(100svh-3.5rem)]`（3.5rem 是顶栏高）。用 `min-h` 而不是 `h`：
内容超过一屏时文档正常滚动，不会被固定高度裁掉。
工作区列 `flex-col` + 预览面 `flex-1`，于是「预览 → 播放条 → 缩略图条」三层把剩余高度
全部吃掉，缩略图条贴到视窗底边。

**预览自适应**：预览面 `flex items-center justify-center`（水平垂直都居中，不再 `self-start`），
画布按可用空间等比缩放，区间 `0.1×–4×`（上限 4× 防止小图标糊成一面墙）。
尺寸来源是 `ResizeObserver` + **挂载时同步 `getBoundingClientRect()` 一次**——
隐藏标签页里 Chrome 不投递 RO 回调，只挂观察器会永远拿不到首帧尺寸。
裁剪框不需要改：`CropOverlay` 读的是 `getBoundingClientRect()`，CSS 缩放对它透明。

**右栏变成工具栏**（三段，不再只是导出）：

| 段       | 内容                                                                              |
| -------- | --------------------------------------------------------------------------------- |
| 帧操作   | 帧数/时长徽标、反向、乒乓、删除选中、拼接 GIF、导出 PNG 帧                        |
| 画面变换 | 裁剪比例档位（自由 / 1:1 / 16:9 / 4:3 / 9:16 + 重置）、倍速、旋转、翻转、输出尺寸 |
| 导出     | 循环、压缩优化、应用并导出                                                        |

配套改动：`FavoriteButton` 的 props 收窄为 `Pick<Tool, 'path'>`，
这样整页式工具可以直接传 `index.ts` 里的 `DefinedTool`（它没有 `isNew`/`category`）。

实测（8 帧 200×120 素材，1901×953 视口）：预览面 1257×575，画布 CSS 800×480（位图 200×120 放大 4×）
且水平垂直双居中；缩略图条底边 937 = 视口 953 − 16px 内边距；锁 1:1 后裁剪框 288×480
（60% 宽 × 100% 高，居中）与缩放后的画布严丝合缝；导出走通，成品卡片出现且下载可用。

**React Compiler 限制记录**：`useMemo` 依赖里放每轮渲染新建的对象（如 `exportSize` 的返回值）
会触发 `preserve-manual-memoization` 报错，编译器直接放弃优化该组件。
这类单行算术改成普通派生常量即可，不要为了「看起来规范」硬套 memo。

## 16. 面板说明改悬停气泡（2026-10-01 追加）

`components/panel-fields.tsx` 的两种说明分成两条通道，避免右栏被成段的解释文字塞满：

| prop   | 语义                                                        | 呈现                                            |
| ------ | ----------------------------------------------------------- | ----------------------------------------------- |
| `tip`  | **静态解释**（这一档是干什么用的）                          | 标签后的 `CircleHelp` 问号 + Radix Tooltip 气泡 |
| `hint` | **随行变化的读数/状态**（滑块当前值、被抬到延时下限的帧数） | 控件下方的 `text-xs` 一行                       |

问号用 `<span tabIndex={0}>` 承载：`TooltipProvider` 已在 `BaseLayout` 顶层装配（`delayDuration=0`），
气泡经 Portal 挂到 body，用 `aria-describedby` 与触发元素关联，键盘聚焦同样可读出。
`PanelField` / `PanelSwitchField` / `PanelSliderField` 与全部派生控件都接受 `tip`。

四个 GIF 工具里 `fill-hint`、`dither-hint`、`optimize-hint`、`target-hint`、`width-hint`、
`lossy-hint` 全部转成 `tip`；编辑器倍速档的 `speed-clamped` 保留 `hint`，因为它是「刚刚发生了截断」
的即时反馈，藏进气泡就失去意义。image-compressor / image-stack 等既有工具未动，
它们继续用 `hint`，行为不变。

实测：编辑器 2 个问号（输出尺寸、压缩优化）、制作器 4 个（填充方式、抖动、压缩优化、目标）、
压缩器手动模式 2 个（有损强度、抖动），段内已无残留的行内说明；气泡 213×42 落在触发元素上方。

## 17. 缩略图矩阵化 + 载入进度（2026-10-01 追加）

**缩略图从单行改成矩阵**：`grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] auto-rows-min content-start`

- `overflow-y-auto`，120 帧在 1257px 宽栏里排成 11 列 × 11 行。播放头换行时用
  `[data-frame-index]` 找卡片、只调 `strip.scrollTop`（不用 `scrollIntoView`，避免连带把整页滚走）。

**高度占比 3:2**：预览面 `flex-[3_1_0%]`、缩略图矩阵 `flex-[2_1_0%]`。
这里踩到一个必须记下的 CSS 陷阱：**`min-h-[calc(100svh-...)]` + `flex-basis:0%` 不锁高度**——
容器高度仍由内容决定，于是「画布按可用空间放大 → 容器被撑高 → 可用空间更大」形成正反馈，
实测一次就把预览面顶到 1764px、整页 2870px。改成固定 `h-[calc(100svh-3.5rem)]`
（与 music-to-video 一致，超出部分溢出到文档滚动）后闭环断开：预览 438px、矩阵 291px、
矩阵底边 937 = 视口 953 − 16px 内边距。

**载入进度**：`decodeGif(source, onPhase?)` 在两个阶段边界上报（`parse` 拿到帧数、`frames` 合成完），
顺带把 `decodeFrames(source)` 改成 `decodeFrames(source, { gif })` 复用已解析结果，省掉一次整文件重解析。
Worker 协议加 `GifProgress = { id, type:'progress', phase, total }`；它没有 `ok` 字段，
hook 用 `!('ok' in data)` 把它与终态分开（判别联合里错误分支没有 `type`，不能按 `type` 收窄）。
UI 侧 `LOAD_STEPS` 把阶段映射成 10 / 40 / 75 的里程碑百分比，配 `Progress` 与阶段文案。

**不做假百分比**：帧合成是一整段同步工作（modern-gif 的 `range` 必须从 0 开始才不破坏 disposal 链，
分块解码是 O(n²)），所以进度只在真实阶段边界跳，中间显示「合成 N 帧…」而不是平滑爬升。

实测（120 帧 320×240 素材）：进度条 indicator transform 依次 `translateX(-90%) → -60% → -25%`
（即 10% → 40% → 75%），文案 读取文件… → 解析文件头… → 合成 120 帧…；
制作器的取帧进度同样补了 `Progress` 条（原来是只有按钮上的 `N/M` 文字）。
