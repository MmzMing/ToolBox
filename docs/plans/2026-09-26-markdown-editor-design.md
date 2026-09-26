# Markdown 编辑器（markdown-editor）设计

日期：2026-09-26 · 分类：文本（text） · 参考：https://tools.top/markdown-editor.html · 替换：`web/html-wysiwyg-editor`

## 1. 目标与范围

删掉基于 `document.execCommand` 的富文本编辑器，改做一个「源码 + 实时预览」的 Markdown 工作台：
左侧 CodeMirror 6 源码区（可见 `**bold**` 这类原始语法并着色），右侧 marked 渲染的净化 HTML，
配工具栏插入、草稿名、状态栏、三档视图模式与三种导出。

刻意不做：

| 项              | 原因                                                                     |
| --------------- | ------------------------------------------------------------------------ |
| 云端保存        | AGENTS.md §12 禁止后端，一切数据留在浏览器                               |
| 图片上传        | 无后端无法存文件；base64 内联会迅速顶爆 localStorage（单张照片 ≈2–4 MB） |
| Vim 模式        | +14.3 kB gz 的极客向能力，无人用即纯浪费                                 |
| XY 图/象限图    | Mermaid v12 新增图表，受众窄，先内置 10 种常见图                         |
| 协作 / 版本历史 | 单页工具不做协同，历史交给 CodeMirror 自带 undo stack                    |

## 2. 编辑内核选型

对比过四个候选：

| 方案                          | 结论                                                                       |
| ----------------------------- | -------------------------------------------------------------------------- |
| CodeMirror 6 最小集（选定）   | 唯一满足「可见语法 + 行号 + 真撤销栈 + 搜索 + 5 万行」的方案，与参考站一致 |
| 零依赖 textarea 增强          | 0 kB，但 textarea 本体无法着色；程序化改写 `value` 打断原生撤销栈          |
| TipTap `@tiptap/markdown`     | schema 驱动的 WYSIWYG，语法被吃掉；与被删工具、简历编辑器职责重复          |
| `@uiw/react-md-editor`/Vditor | 引入第二套 markdown 管线 + 第二个高亮器；Vditor 默认从 unpkg 拉资源        |

新增 7 个直接依赖（传递带入 `@lezer/{common,markdown}`、`@codemirror/lang-html`）：

```
@codemirror/state@6.7.6  view@6.43.13  commands@6.11.1  language@6.12.4  search@6.7.2  lang-markdown@6.5.2
@lezer/highlight@1.2.4
```

`@lezer/highlight` 必须显式声明：`tags.*` 是 `HighlightStyle.define` 的入参，而 pnpm 的隔离
`node_modules` 不暴露传递依赖，从项目根 import 会解析失败。

约 **185 kB min+gzip**，全部落在 `/markdown-editor` 这一个懒加载 chunk 内，其他路由字节不变。
`docs/design/技术栈文档.md` §4「所有工具依赖已预装，禁止 `pnpm add`」由本条设计决策破例。

不装 `@uiw/react-codemirror`（peer 拖整个 `codemirror` meta 包 + `theme-one-dark`），自写 ~60 行
`useEffect` 包装。不装 `@codemirror/language-data`（它的 22 个 `import()` 会让 Vite 多产 22 个
chunk），改为手工声明 6 个 `LanguageDescription`（js/ts/json/bash/yaml/html）喂
`markdown({ codeLanguages })`——实现期进一步收窄：一个 `lang-*` 包都不装，代码块高亮完全交给
预览侧的 highlight.js，编辑区只给 Markdown 结构着色，省掉约 100 kB。

**katex 锁 `0.16.47`，不要随手升 latest**：mermaid 的依赖是 `katex@^0.16.47`，装 0.18 会让包里
同时存在两份 katex（各 77 kB gzip）。锁到 0.16.47 后 pnpm 去重成一份。mermaid 自带的
`marked@16` 与站内 `marked@18` 无法同样合并（降 marked 会影响 format-converter），只在含图文档
懒加载时多付一次，已知并接受。

渲染侧零新依赖：`marked@18`（GFM 表格/任务列表/删除线/自动链接原生可用）、`dompurify@3`、
`highlight.js`（`lib/common`，`index.css` 已有 `.hljs` 双主题令牌）。预览排版不用
`@tailwindcss/typography`：先试过 `github-markdown-css@5.9.0`，观感偏密偏素，已回退；
改为自写 `preview.css`，度量对齐 tools.top 的 `.markdown-preview-content`（见 §5）。
重型渲染器按需加载：`mermaid@12.0.0`、`katex@0.16.47` 只在预览检测到围栏或数学定界符时
`await import()`。

## 3. 文件结构

```
src/tools/text/markdown-editor/
├── index.ts                     defineTool + redirectFrom: ['/html-wysiwyg-editor']
├── MarkdownEditor.tsx           外壳：工具栏 / 分栏 / 状态栏 / 断点分流（default export，lazy）
├── markdown-editor.service.ts   纯函数：插入命令、计数、标题 slug、视图模式
├── markdown-editor.store.ts     zustand persist（toolbox.markdown-editor）
├── preview.css                  .md-preview 排版（预览与导出共用一份源码）
├── use-source-editor.ts         CodeMirror 6 生命周期（工具专属，不外泄到 composable/）
├── components/
│   ├── PreviewPane.tsx          marked → DOMPurify → 注入；mermaid / katex 二次渲染
│   ├── TitleInput.tsx           草稿名（无边框 Input，hover 才出边框）
│   ├── EditorToolbar.tsx        插入命令 + 视图模式 + 导出菜单
│   ├── StatusBar.tsx            行列 · 字符词数 · 保存状态 · 模式
│   └── preview-renderers.ts     mermaid/katex 懒加载与净化、宽表格滚动壳
└── export/
    ├── standalone-html.ts       自包含 HTML 文档组装（内嵌 CSS 常量）
    └── print.ts                 隐藏 iframe 打印（PDF 走浏览器「另存为 PDF」）
```

工具目录内再分 `components/`、`export/` 沿用简历工具先例（`src/tools/resume/resume/components/`）。

跨工具共用部分落 `src/utils/`（AGENTS.md §7「被第二个工具需要时先上移 utils」）：

- `src/utils/markdown.ts` — `renderMarkdown()` + `sanitizeMarkdownHtml()`。现状是 marked 实例已有
  3 份、turndown 2 份、下载 helper 3 份，且 `resume/rich-text.ts` 的 DOMPurify 白名单不含
  `table/img/input`，直接复用会把表格与图片滤掉。
- `src/utils/download.ts` — `downloadBlob()` / `downloadText()`。

**本次只做新增，不把 resume / image-stack / ai-image-gen 的重复实现一并重构**：那三个属于他人
分类的文件，改动面与回归风险与本次目标无关，合并留待后续单独任务。

## 4. 数据模型与持久化

```ts
type Draft = { title: string; content: string; updatedAt: number; seeded: boolean; ui: EditorUi }
type ViewMode = 'edit' | 'split' | 'preview'
```

store `toolbox.markdown-editor`，`version: 3`，**只有一份草稿**——多文档列表与切换下拉都已砍掉，
界面顶部留一个草稿名输入框即可。`ui` 含 `{ viewMode, syncScroll, renderMermaid, renderMath, lineWrap }`。

约束（AGENTS.md §8）：

- `partialize` 只落数据与 `ui`，动作不进存储。
- `migrate` + `merge` 双层兜底：`title/content` 非 string 归零、`updatedAt` 非有限数补当前时刻、
  `viewMode` 不在白名单内回退 `split`、布尔项逐个 `typeof` 校验。
- **v2 → v3 迁移**：v2 存的是 `docs[] + activeDocId`，`legacyDraft()` 取「当前打开的那份」，
  取不到退到最近修改的那份——砍功能不能让用户稿子消失。
- `storage` 用配额安全包装（照 `resume/store.ts:139` 的 `safeLocalStorage` 思路）：`setItem` 抛错
  时只 toast 一次并保留内存态，不静默丢数据。
- 自动保存 debounce 1s（参考 `resume/constants.ts:72` 的 `FILE_SYNC_DEBOUNCE_MS`）。
- 首访 seed 一篇双语示例草稿（`seeded` 置真后即使清空也不复活），内含标题/表格/任务列表/代码块
  /Mermaid/KaTeX，兼作功能自检。
- 正文单向流动：CM → React 镜像 → store。不做 store → CM 的反向同步 effect——自动保存有防抖
  窗口，反向同步会把用户刚敲的字覆盖掉。导入 .md 与首访 seed 都靠 `replaceDoc()` 显式写入。

## 5. 界面与交互

外壳 `immersive: true` → `ToolLayout` 的 `fill` 分支（`tool-layout.tsx:59`）：SEO 标签照常，可见
头部由工具自管。注意 `BaseLayout` 是 `min-h-svh` + 文档级滚动（`main` 只有 `flex-1`），`h-full`
在这里解析不出确定高度、工具栏会随页面滚走，所以根容器写死 `h-[calc(100svh-3.5rem)]`（减掉
sticky 顶栏的 `h-14`），让工具栏与状态栏固定、只有两个面板内部滚动。

- 顶部一行 `h-12 shrink-0` 工具栏：草稿名 · 插入组 · 标题 · 块级元素 · 图表 · 公式 · 大纲 ·
  视图模式 · 全屏 · 导出；语言/主题沿用站点顶栏。分组之间用 `Separator orientation="vertical"`。
- 桌面（≥1280）：`ResizablePanelGroup orientation="horizontal"` = 源码 | 预览，两个面板内部各自
  `overflow-auto` 且带 `min-h-0`（AGENTS.md §6）。
- 手机（<768）：`split` 退化为「仅编辑」，面板折叠跟着退化后的 `effectiveMode` 走；工具栏横向滚动。
- 视图模式三档：编辑 / 分栏 / 预览，走工具栏的视图下拉，持久化。
- 导入：拖 `.md` / `.markdown` / `.txt` 到编辑区即替换草稿（`filesFromDataTransfer`），不占工具栏位置。
- 全屏：`fixed inset-0 z-50 h-svh`，不调 `requestFullscreen`——§6 已记录浏览器工具栏伸缩会改变
  视口高度，自绘覆盖层可控得多。
- 同步滚动：`marked` v18 的 token 不带 `position`，改为 `walkTokens` 累加 `token.raw` 的行数推出
  块起始行，renderer 给 h1–h6 打 `data-line`；预览滚动时取视口顶部最近的 `data-line` 块，用
  `行号 / 总行数` 映射编辑区滚动位置，纯比例滚动仅作无标题文档的兜底。回声用一次性令牌
  （`'editor' | 'preview'`）吞掉，不用计时器也不在事件回调里读 `Date.now()`。
- 状态栏：`行 X, 列 Y | N 字符, M 词 | 已保存 / 未保存 / 保存失败 | 模式`。行列取自 CodeMirror
  `state.selection.main`；词数按「CJK 每字计 1，拉丁按空白分词计 1」混合计数。
- 主题：`EditorView.theme` 直接写 `var(--foreground)` 等令牌值，`EditorView.darkTheme` 与
  `lineWrapping` 一起放 `Compartment`，跟随站点主题开关重配。
- 预览排版：`preview.css` 的 `.md-preview`，度量取自本仓库作者的博客渲染
  （`D:\my-blog\my-blog` 的 `src/styles/markdown.css` / `markdown-extend.styl` /
  `expressive-code.css`）：内容列 `min(55rem, 100%)` 居中、`1rem / 1.75` 行高、标题不加装饰线
  只靠字号字重分层（h1 2.25em/800、h2 1.5em/700、h3 1.25em/600）、链接是**虚线下划线 + 4px
  offset + hover 落底色**、`em` 紫色波浪下划线、`del` 红色 2px 删除线、行内代码无描边只有底色
  与 0.375rem 圆角、代码块 0.75rem 圆角 + 1px 描边 + 右上角大写语言角标（hover 淡出）、表格用
  分隔边框只画竖线 + 偶数行底色、引用块退化成一道 3px 左线无底色不斜体、图片 0.75rem 圆角。
  颜色写成 `var(--令牌, 十六进制)`：站内跟语义令牌明暗自动切，导出的独立文件没有 `:root`
  就落到第二重兜底值，于是预览与导出共用同一份 CSS 源码（导出侧用 `?inline` 读文本）。
- 块级公式与图表套**带标题栏的卡片**（`.md-card` / `.md-card-head` / `.md-card-title` /
  `.md-card-body`）：1px 描边 + 0.75rem 圆角 + 标题栏底色与下边框 + 正文区 `overflow-x: auto`，
  hover 时补一层浅阴影（博客的 `.diagram-container` 同款）。标题文字是用户可见文案，所以由
  `renderMarkdown(source, { labels })` 从 i18n 注入成真文本，而不是 CSS `content`——这样导出物
  里也带着标题。行内公式不加框，跟随正文基线。
- 宽表格由 `wrapWideTables()` 在渲染后包一层 `.md-table-scroll` 横向滚动容器（博客
  `content-overflow.ts` 的同款做法），溢出在表格内部消化，不把整块预览推成横向滚动。
- 插入命令一律走 `view.dispatch` 事务（不是改 `value`），因此 **Ctrl+Z 能撤销工具栏操作**；
  包裹型命令在已有标记时反向取消标记。

工具栏内容对齐参考站「元素」组：粗体 / 斜体 / 删除线 / 行内代码 / 标题 H1–H3 / 无序列表 /
有序列表 / 任务列表 / 引用 / 链接 / 图片（仅 URL）/ 代码块 / 表格（3×3）/ 分隔线。图表下拉提供
10 种 Mermaid 模板：流程图 / 时序图 / 类图 / 状态图 / 甘特图 / 饼图 / 思维导图 / 时间轴 /
用户旅程 / GitGraph。公式下拉插入 `$…$` 与 `$$…$$` 模板。

实现期的几处修正：

- 链接与图片**不弹输入框**：命令插入 `[选中文本]()` 并把光标停在括号内的 url 位置，用户直接
  接着打字即可。省掉一个对话框组件与它的焦点管理，行为与其它 Markdown 编辑器一致。
- 图表与公式的二次渲染 debounce 350ms：跟随每次按键重跑 mermaid layout 会明显卡顿并让图闪动，
  文本预览仍然实时。
- 面板折叠跟着 `effectiveMode`（小屏把 split 退化为 edit 之后的值）而不是 `ui.viewMode`，
  否则手机上状态栏写着「仅编辑」却仍是两栏并排。
- 同步滚动的回声用一次性令牌（`'editor' | 'preview'`）吞掉对侧那一次事件，不用时间戳；
  列表时间也改成绝对日期（`Intl.DateTimeFormat`）。原因相同：事件回调或渲染期读 `Date.now()`
  会被 React Compiler 的 purity 规则拦下。

## 6. 渲染管线与安全

`marked@18 { gfm: true, breaks: false }` + 自定义 object renderer：

- `heading` → 生成 `id`（自实现 GitHub slug：小写、去标点、空格转 `-`、CJK 保留、重名加 `-1`
  后缀），并写 `data-line`。
- `code` → `highlight.js` 命中语言用 `hljs.highlight`，未知语言用 `hljs.highlightAuto`，抛错回退
  `escapeHtml`；`mermaid` 围栏不交给 hljs，输出占位 `<div data-mermaid="…">`。
- `link` → `target="_blank" rel="noopener noreferrer"`。
- 数学：用 marked 的 `extensions` 加 `inlineMath` / `blockMath` 两个 tokenizer。为避开中文正文里
  `$5`、`$ 100` 的误判，规则定为「定界符内侧非空白、块级 `$$` 独占行」。渲染侧 `await import('katex')`。

净化是出口必经环节（marked 自身不净化）：

```ts
DOMPurify.sanitize(html, {
  USE_PROFILES: { html: true },
  ALLOW_DATA_ATTR: true, // data-line 需要
  ADD_ATTR: ['target', 'align', 'checked', 'disabled', 'start', 'colspan', 'rowspan'],
})
```

实现期修正一处：图表与公式的源码**不经 `data-*` 属性传递**。DOMPurify 会因为属性值里出现
`>` 而丢弃该属性（实测 `data-md-source="A --&gt; B"` 整个消失），而 mermaid 的 `-->` 与
`$a > b$` 无处不在。改为：mermaid 源码留在占位的 `<pre><code>` 文本里，公式源码留在 span 的
文本里，渲染侧读 `textContent` 取回——顺带这就是渲染失败/关闭时的可读降级，不需要额外兜底。

- **不加 `DOMPurify.addHook`**：hook 是全局注册的，在本工具注册会连带改变简历工具
  `sanitizeRichTextHtml` 的行为。外链的 `target/rel` 改在 marked 的 `link` renderer 里补；
  协议闸门交给 DOMPurify 自身的 `ALLOWED_URI_REGEXP`（默认即拒 `javascript:`、只放行
  img/audio/video 上的 `data:image`）。
- `!DOMPurify.isSupported` 时 fail-closed 退回 `escapeHtml`，与 `resume/rich-text.ts` 一致。
- Mermaid 以 `securityLevel: 'strict'` 渲染，产出的 SVG 再过 `DOMPurify` 的
  `{ USE_PROFILES: { svg: true, svgFilters: true } }`，且**不**把 `svg` 加进 HTML 侧白名单。
  `theme` 随站点明暗切换，用自增 id 规避 mermaid 的按 id 缓存。

## 7. 导出

| 格式     | 实现                                                                                                                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Markdown | `downloadText(content, \`${sanitizeFileName(title)}.md\`, 'text/markdown')`，复用 `utils/file-name.ts`                                                                                                       |
| HTML     | `export/standalone-html.ts` 组装自包含单文件；内联 `preview.css?inline`（同一份预览源码，`var()` 第二重兜底取色）+ `.hljs` 字面色 + 打印规则                                                                 |
| PDF      | `export/print.ts`：隐藏 iframe 载入同一份 HTML，`@page { size: A4; margin: 16mm }` + `print-color-adjust: exact`，`pre/table/[data-mermaid]` 加 `page-break-inside: avoid`；用户在打印对话框选「另存为 PDF」 |

PDF 选浏览器打印而非 `jspdf + html2canvas-pro`：矢量、文字可选中可搜索、原生分页、零新依赖；
html2canvas 路线会位图化（代码发虚、文字不可选）。Mermaid 的 SVG 在打印流里依旧是矢量。

## 8. 删除与迁移

- 删 `src/tools/web/html-wysiwyg-editor/`（三件套）、`src/test/tools/web/html-wysiwyg-editor/`。
- `src/tools/web/index.ts` 去掉注册；`locales/{zh,en}/tools-web.json` 去掉 `html-wysiwyg-editor` 块（各 18 键）。
- 新工具 `index.ts` 写 `redirectFrom: ['/html-wysiwyg-editor']`，`router.tsx:31` 自动生成
  `loader: () => redirect(...)`，旧链接与已收录页面不失效。
- 同步 `README.md` 与 `docs/design/功能介绍文档.md` 的工具清单（总数不变，web −1 / text +1）。
- **`@tiptap/*` 依赖保留**：它只被 `resume/components/rich-editor/RichEditor.tsx` 使用，与被删的
  execCommand 实现无关。
- `sitemap.xml` 由 `scripts/generate-sitemap.mjs`（prebuild）扫目录生成，无需手工登记。

## 9. i18n

命名空间 `tools-text`，新增 `markdown-editor` 键块（zh/en 齐全）：`title` / `description` +
工具栏、下拉分组、状态栏、导出菜单、确认对话框、示例文档正文。`keywords` 双语写在 `index.ts`。
`scripts/check-i18n-duplicate-keys.mjs` 与 `scripts/check-tool-seo-keys.mjs` 在 `pnpm test` 中卡关，
键名与「目录名 = name = path 去斜杠」必须一致。

## 10. 测试

`src/test/tools/text/markdown-editor/`（只测纯逻辑，AGENTS.md §10）：

- 插入命令：空选区 / 多行选区 / 已有标记时反向取消 / 文档边界。
- 计数：中英混排字符与词、空串、纯空白、CRLF。
- 标题 slug：大小写、标点、CJK、重名后缀。
- `walkTokens` 行号推导与 `data-line` 正确性；Mermaid 围栏识别。
- 数学 tokenizer：识别与**不**识别边界（`$5`、`$ 100`、行内 `$$`、未闭合）。
- `sanitizeMarkdownHtml`：`<script>`、`img onerror`、`javascript:` href、`data:text/html`、
  表格/图片/任务列表必须存活。
- `buildStandaloneHtml`：标题转义、CSS 注入、净化后正文不被二次转义。
- store 水合：脏字段类型纠正、非法 viewMode 回退、v2 `docs[]` 迁移取当前打开的那份（含 activeDocId 悬空与 docs 为垃圾数组两种坏数据）。

## 11. 验收

`pnpm lint && pnpm typecheck && pnpm test` 全绿；`pnpm dev` 浏览器手测三断点（<768 / 768–1279 /
≥1280）× 明暗主题，覆盖示例文档渲染、工具栏撤销栈、同步滚动、三种导出、刷新后草稿与视图模式
恢复。按 AGENTS.md §11 不执行任何 git 写操作。
