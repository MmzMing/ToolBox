# 简历工坊（Resume Builder）迁移设计

日期：2026-09-19 · 状态：已批准 · 分类：简历（新增第 8 个分类，侧栏首位） · 路由：`/resume`、`/resume/:id`

来源：`D:\my-tools\tool-resume`（Magic Resume v2.0.8，TanStack Start + React 18 + HeroUI + Tailwind v3，
`src/` 共 305 个 ts/tsx、约 32,165 行）。本文档记录把它移植进 ToolBox 的边界、落位与验收口径。

## 1. 目标

在 ToolBox 内提供完整的简历编辑能力，功能与旧项目对齐、不缺失：

- 入口页 `/resume`：上方模板墙（9 套模板），下方「我的简历」列表。
- 编辑器 `/resume/:id`：照旧项目的三栏工作台（设置 / 表单 / A4 预览）+ 右侧 dock。
- 数据 100% 留在浏览器：localStorage + File System Access 本地文件夹，不新增任何后端服务。

## 2. 非目标（已与用户确认移除）

| 移除项                                                                      | 原因                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| AI 润色、AI 语法检查（含 mark.js 预览高亮）                                 | 旧实现走 `/api/polish`、`/api/grammar` 服务端函数，AGENTS.md §12 禁止引入需后端/密钥的服务 |
| PDF 视觉导入（pdfjs-dist + 视觉模型）                                       | 同上；JSON 导入能力保留                                                                    |
| GitHub 贡献图                                                               | `basic.githubKey` 明文存 localStorage 且需跨域请求                                         |
| 一键 PDF 导出（`api.magicv.art`）                                           | 把简历原文 POST 到第三方，违背首页「数据不上传服务器」承诺；改由本地光栅化承担             |
| 英文营销落地页、FAQ 之外的 `components/home/*`                              | 与站内既有首页重复                                                                         |
| `/api/proxy/image` 头像代理                                                 | 无后端。**唯一行为退化**：跨域头像 URL 因 CORS 画不进 html2canvas，导出时跳过并提示        |
| 旧项目 `public/template-snapshots/en/*` 与 `assets/images/template-cover/*` | 前者只用 `zh/` 一套，后者在旧仓库内即零引用                                                |

许可：源项目为用户自有旧项目，按 ToolBox 现有 MIT 处理，不附加出处声明。

## 3. 方案取向

| 决策点         | 结论                                                                              | 理由                                                                                     |
| -------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 注册形态       | 新增 `resume` 分类 + 单个工具 `resume`（目录/工具名/path 三者一致，AGENTS.md §3） | 侧栏、首页卡片、命令面板、搜索、收藏、最近使用、`DocumentMeta`、sitemap 全部自动继承     |
| 编辑器外壳     | `router.tsx` 内 BaseLayout **之外**的第二条顶层路由                               | 三栏需要满屏；旧项目 workbench 本身就是脱离应用外壳的独立布局                            |
| 子路由的旧缺陷 | 不做前缀匹配补丁                                                                  | 编辑器不在 BaseLayout 内，面包屑/高亮问题不存在；共享文件改动面从 6 个缩到 4 个          |
| 当前简历真源   | 保留 `activeResumeId`，进入 `/resume/:id` 时 `setActiveResume(id)`                | 20+ 处组件用解构式全量取 store，改造为纯路由参数驱动的收益不抵风险                       |
| 拖拽排序       | `motion`（framer-motion 继任包）的 `Reorder`                                      | 6 处排序全部依赖 `Reorder.Item` + `useDragControls`；`framer-motion@11` 无 React 19 peer |
| 富文本         | `@tiptap/*` 3.31.3                                                                | 6 个字段存 Tiptap HTML，替换成本项目零依赖方案等于重写                                   |
| PDF            | `html2canvas-pro@2.4.3` + `jspdf@4.2.1`                                           | stock `html2canvas@1.4.1` 解析不了 Tailwind v4 的 `oklch()` 计算值                       |
| 日期输入       | `Popover` + vendor `components/ui/calendar.tsx`（`react-day-picker@10`）          | 替代 HeroUI `DateInput`；输出格式与 `至今` 语义逐字节保持一致                            |
| UI 底座        | 只保留 shadcn/ui + 令牌，不引入 HeroUI                                            | AGENTS.md §6；HeroUI 与 shadcn 两套样式体系并存不可维护                                  |
| 模板缩略图     | 直接拷 9 张 `zh/` PNG                                                             | 旧仓库已预渲染，避免移植 Playwright 脚本（沙箱无浏览器且构建期不该跑）                   |
| 字体           | `public/fonts` 149 MB 全量拷入                                                    | 用户拍板；接受仓库 6 MB → 约 155 MB、`dist/` 同步变大                                    |

## 4. 数据模型

单一 schema 渲染九套模板，与旧项目一致。`types.ts` 内一律 `type` + `as const` 联合（AGENTS.md §4 禁 enum/`interface` 继承链）。

```ts
type ResumeData = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  templateId: string | null
  basic: BasicInfo
  education: Education[]
  experience: Experience[]
  projects: Project[]
  certificates: Certificate[]
  customData: Record<string, CustomItem[]> // 键 = menuSections[].id，如 'custom-1'
  skillContent: string // Tiptap HTML
  selfEvaluationContent: string // Tiptap HTML
  activeSection: string // UI 态，随数据一起持久化
  draggingProjectId: string | null
  menuSections: MenuSection[]
  globalSettings: GlobalSettings
}
```

三条必须原样保留的既成事实（改动即破坏用户数据）：

1. `basic.employementStatus` 的拼写错误是线上数据字段名，不改。
2. 日期是**显示字符串**不是 Date：`"2021/07"`、`"2021/07 - 至今"`，解析容忍 `.` `/` `–` `—` 与 4/7 位长度，永不归一化。
3. 章节标识是字符串：`basic | skills | experience | projects | education | selfEvaluation | certificates | custom-N`。

## 5. 目录落位

```
src/tools/resume/index.ts                        export const resumeTools: readonly DefinedTool[]
src/tools/resume/resume/
├── index.ts                                     defineTool({ name, path:'/resume', icon:FileText, createdAt })
├── Resume.tsx                            入口页（default export，供 lazy）
├── types.ts                                     ResumeData 族 + ResumeTemplate
├── constants.ts                                 THEME_COLORS / 字体清单 / LAYOUT_CONFIG / HISTORY_LIMIT
├── initial-resume-data.ts                       中英种子，按当前 locale 取
├── resume.service.ts                    纯函数：JSON 校验、文件名 sanitize、A4 换算、分页线、markdown 序列化
├── history.ts                                   50 步快照栈 + 1000 ms 合并窗口（纯函数）
├── store.ts                                     zustand persist 'toolbox.resume' version 1 + migrate + normalize
├── file-sync.ts                                 File System Access 目录句柄（IndexedDB 'FileHandleDB'）+ 1.5 s 防抖
├── legacy-import.ts                             一次性读旧键 'resume-storage' → 改名 'resume-storage.migrated'
├── components/                                  EditorHeader / side-panel(五卡) / EditPanel / PreviewPanel /
│                                                PreviewDock / MobileWorkbench / RichEditor / IconSelector /
│                                                PhotoSelector / TemplateSheet / ExportDialog / basic|education|
│                                                experience|project|custom|skills|self-evaluation|certificates|layout
├── templates/                                   registry.ts + index.tsx + TemplateContext.tsx + shared/ +
│                                                classic|modern|left-right|timeline|minimalist|elegant|
│                                                creative|editorial|swiss（各 config.ts + index.tsx + sections/ 8 件）
└── export/                                      pdf.ts / print.ts / markdown.ts / json.ts
src/pages/resume-editor-page.tsx                 满屏三栏壳（路由页面级组件，AGENTS.md §2）
src/components/ui/calendar.tsx                   vendor 自 shadcn，适配 react-day-picker@10
src/test/tools/resume/resume/            *.service.test.ts
public/fonts/**, public/template-snapshots/zh/**
```

## 6. 共享文件改动（共 4 个）

| 文件                      | 改动                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `src/tools/categories.ts` | `categoryKeys` 首位加 `'resume'`；`categoryIcons.resume = FileText`（漏图标为硬 TS 错）      |
| `src/tools/index.ts`      | `import { resumeTools }` + `toolsByCategory` **首位**插入                                    |
| `src/plugins/router.tsx`  | 模块作用域 `lazy()` + 顶层路由 `{ path: '/resume/:id' }`，带 `Suspense` 与 `errorElement`    |
| `src/index.css`           | 8 条 `@font-face`、字体族变量、`@plugin "@tailwindcss/typography"`、`.resume-paper` 局部重置 |

不改 `base-layout.tsx`、`sidebar-content.tsx`、`tool-page.tsx`、`components/ui/` 既有组件。

## 7. 色彩与主题分层（硬约束）

Tailwind v4 令牌是 oklch，光栅化与"纸张必须恒定浅色"两件事同时要求分层：

- **编辑器外壳 / 设置卡 / dock / 入口页**：只用语义令牌（`bg-background`、`text-muted-foreground`、`border`、`size-4`），跟随亮暗主题。
- **`#resume-preview` 子树**：禁止语义令牌类。颜色一律来自 `template.colorScheme`（hex）与内联 `style`；
  根节点显式写 `color` 与 `background`，避免从 `<body>` 的 `text-foreground` 继承 oklch。
  旧项目模板层 0 个 `dark:` 类，行为一致。

违反此层规则的后果：html2canvas 抛 `unsupported color function oklch`，或暗色下简历变灰底。

## 8. 状态与持久化

- 单一 store：`useResumeStore`，`resumes: Record<string, ResumeData>` + `activeResumeId` + `history`/`future` 两张快照表。
- 所有写操作汇聚到 `updateResume(id, patch, options?)` 一个咽喉，统一打 `updatedAt`、入快照、排程文件同步。
  `setActiveSection`、`setDraggingProjectId` 传 `{ recordHistory: false }`。
- `persist` + `createJSONStorage`，`partialize` 只留 `{ resumes, activeResumeId }`，`version: 1` + `migrate`，
  水合后过 `normalizeResume()` 兜底（AGENTS.md §8）。`history`/`future` 不持久化，故撤销不跨刷新。
- localStorage 写入包 `createSafeLocalStorage()`：吞 `QuotaExceededError` 并按键名只告警一次——
  base64 头像与证书图都在这个 blob 里，属已知取舍。

## 9. 功能映射与验收清单

### 9.1 入口页 `/resume`

模板墙（9 卡：PNG + 名称 + 简介，点选建简历）／我的简历（卡片：标题、更新时间、进入编辑、重命名、复制、删除确认、新建、导入 JSON）。

### 9.2 编辑器

| 区块           | 必须可用                                                                                                                                                                                                                                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 三栏壳         | 默认 `20/32/48`；自定义把手（1 px 线 + 20 px 命中区 + 握柄）；视口 `<1440` 自动折叠左栏；面板矩阵变化时 `key=sizes.join('-')` 强制重挂载；预览栏只 `hidden` 不卸载（导出依赖 `#resume-preview` 恒存）；挂载时 `body` 加滚动锁                                                                                                                                                     |
| EditorHeader   | 标题内联改名（`onBlur` 提交，空值回落「未命名简历」）；备份状态徽标（正常绿盾 / 待同步脉冲）；撤销/重做按钮 + `Ctrl/⌘Z`、`Ctrl/⌘Y`、`Ctrl/⌘Shift+Z`（可编辑目标内不劫持）；主题下拉；导出入口                                                                                                                                                                                     |
| SidePanel 五卡 | 布局：章节增（6 个标准模块按模板 `availableSections` 与已存在项过滤 + 空白自定义章节）/删（确认）/显隐/拖拽重排（`basic` 钉死首位不可拖）；主题色：12 预设 + 取色器（100 ms 防抖）；排版：字体 4 选、行高 1–2 步 0.1、基础/主/副标题字号取 `[12,13,14,15,16,18,20,24]`；间距：页边距 0–100、章节 1–100、段距 1–50，滑杆 + ▲▼ 数字框；模式：图标模式 / 副标题居中 / 弹性头部三开关 |
| EditPanel      | 按 `activeSection` 分发；卡头 emoji + 章节标题可内联改名（`basic` 禁用）                                                                                                                                                                                                                                                                                                          |
| 条目面板       | `Reorder.Item` 左侧 `w-12` 拖拽条（`dragListener={false}` + `useDragControls`，展开态禁用）；摘要行（标题、眼睛显隐、垃圾桶 + 确认弹窗、箭头旋转 180°）；`AnimatePresence` 高度展开内联表单；项目链接与链接文字；教育 GPA/学位；「至今」开关                                                                                                                                      |
| 基础信息       | 对齐三卡（左/中/右）；头像（点击、拖拽、粘贴、本地文件、canvas 压缩、宽高、比例锁、圆角含自定义、显隐）；字段重排（姓名与职位固定）；字段显隐/删除；逐字段 lucide 图标；自定义字段（图标/标签/值/显示标签/显隐/删除/重排）                                                                                                                                                        |
| 技能与自评     | 单个富文本 `Field`                                                                                                                                                                                                                                                                                                                                                                |
| 证书           | 多文件选择 + `activeSection==='certificates'` 时的 document 粘贴监听；宽度滑杆 10–100%；三级压缩阶梯 1200/0.8 → 800/0.7 → 600/0.5 → 400/0.4，目标 base64 ≤ 2 MB                                                                                                                                                                                                                   |
| PreviewPanel   | `210mm×297mm` 白纸 + 阴影；`scale-[58%] origin-top` → `md:scale-90 md:origin-top-left`；内联 `padding: pagePadding`、`font-family`；分页参考线红色虚线（步长 `1122.5 - 2*pagePadding`，上限 20）；`MutationObserver` + `ResizeObserver` + 100 ms 节流测高；自动一页纸缩放；点击 `[data-resume-section-id]` 反向激活章节                                                           |
| PreviewDock    | 磁贴：切模板 / 自动一页纸 / 分页线 / 导出 / 复制简历 / 折叠左栏 / 折叠中栏 / 折叠预览 / 回首页（`@remixicon` 图标改 lucide）                                                                                                                                                                                                                                                      |
| 模板层         | 9 套模板 + `registry.ts`（新增模板 = 建目录 + 加一行）；`setTemplate` 同步把 `colorScheme.primary` 与三档间距、`basic.layout` 写回 `globalSettings`                                                                                                                                                                                                                               |
| 富文本         | Tiptap：粗斜下划线、删除线、标题、有序/无序/任务列表、对齐、颜色、高亮、链接、水平线、引用、撤销重做；`BetterSpace` 空格行为；列表缩进样式                                                                                                                                                                                                                                        |
| 图标选择器     | 1848 个 lucide 图标（`icons` 映射）搜索 + 9 分类                                                                                                                                                                                                                                                                                                                                  |
| 移动端         | 三 tab（内容 / 样式 / 预览）                                                                                                                                                                                                                                                                                                                                                      |
| 全局           | 无保存按钮、无脏标记；每次写同步落 localStorage + 1.5 s 防抖落文件                                                                                                                                                                                                                                                                                                                |

### 9.3 导入导出

| 通道           | 机制                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 长图 PDF（主） | 离屏 A4 宽容器 → `html2canvas-pro`(scale 2) → `jspdf` 单页 `[210, 实测] mm`                                                              |
| 长图 PNG       | 同一次捕获 → `canvas.toBlob`                                                                                                             |
| 浏览器打印     | 隐藏 iframe + `@page { size:A4; margin:0 }` + `print-color-adjust:exact`，等字体/图片/双 rAF 后 `print()`                                |
| JSON           | `<sanitize(title)>.json`                                                                                                                 |
| Markdown       | `turndown` HTML→MD，按 `menuSections` 顺序输出 `##`                                                                                      |
| 导入 JSON      | 解析 + 校验后铺到 `initialResumeState`，**新 uuid + 新时间戳**，绝不覆盖源                                                               |
| 导入旧数据     | 首访检测 `localStorage['resume-storage']`，一次性迁移后改名 `resume-storage.migrated`                                                    |
| 捕获前置       | `optimizeImages`（fetch→data URL）、`bakeObjectFitCoverImages`（cover 图预裁到 canvas）、`waitForImages`、`document.fonts.ready`、双 rAF |

## 10. i18n

旧项目 684 键 / 15 命名空间 + 自研 `useTranslations` shim。移植时不搬 shim：

- 全部收敛到单文件 `src/modules/i18n/locales/{zh,en}/tools-resume.json`，嵌在 `resume.*` 下；
  顶层 `resume.title` / `.description` 供 `ToolLayout` 与侧栏取用（AGENTS.md §9）。
- `categories.json` 双语补 `resume`。
- 数组值（图标分类、FAQ）走已开启的 `returnObjects: true`。
- 组件内 `useTranslation('tools-resume')`，键路径 `resume.<域>.<key>`。
- 章节名是**用户数据**（`menuSections[].title`），不是 i18n 键，不进语言包。

## 11. 测试

`src/test/tools/resume/resume/`，只测纯逻辑：

- `resume.service.test.ts`：JSON 校验（空/非对象/缺字段/多余字段）、文件名 sanitize（非法字符、超长、空）、
  A4 与分页线换算（`pagePadding` 边界）、markdown 序列化顺序。
- `history.test.ts`：50 步上限、1000 ms 合并窗口内同类补丁只留一条、`recordHistory:false` 不入栈、
  `restoreResumeSnapshot` 在模板被删/章节缺失时的回落。
- `legacy-import.test.ts`：旧键映射、缺 `menuSections` 时补默认、损坏 JSON 抛错不崩页。
- `file-sync.test.ts`：`shouldImportResumeFromFile` 的 `updatedAt` / `lastModified` 新旧判定。

## 12. 里程碑

每个里程碑完成定义 = `pnpm lint && pnpm typecheck && pnpm test` 全绿。

1. 骨架：分类注册、两条路由、types/constants/store/history/service、两页空壳
2. 模板层 + 字体 + 入口页模板墙 + 新建/复制/删除
3. 三栏外壳 + SidePanel + PreviewPanel（分页线、自动一页纸）
4. 全部表单面板 + Tiptap + 拖拽排序 + 图标选择器 + 头像/证书
5. PreviewDock + TemplateSheet + 三栏折叠 + 移动端三 tab
6. 导出五条 + File System Access 同步 + 旧数据迁移 + i18n 全量 + 文档计数（49→50 工具、7→8 分类）

## 13. 已知风险

| 风险                                                                | 处置                                                                                                            |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `motion@13` 与 React 19 的 `Reorder` 行为未在本仓库验证             | 里程碑 3 首个提交即做拖拽实测，不通则退 `@dnd-kit`（已装），代价是 6 处排序重写                                 |
| `react-day-picker@10` 与 shadcn calendar 的 `classNames` 槽位有漂移 | vendor 时以安装包内 `dist/cjs/types` 为准逐个核对                                                               |
| oklch 泄漏进纸张层                                                  | §7 分层禁令 + `html2canvas-pro` 双保险；里程碑 2 结束前跑一次真实导出                                           |
| 149 MB 字体进仓库与 `dist/`                                         | 用户已确认；不改动 `vite` 静态拷贝行为                                                                          |
| localStorage 配额（base64 头像 + 证书图）                           | 保留旧项目的静默吞异常 + 一次性告警；入口页在接近配额时提示改用文件夹同步                                       |
| 沙箱内置浏览器视口宽为 0，UI 只能量测不能截图                       | 三档断点（`<768` / `768–1279` / `>=1280`）用 `getBoundingClientRect` 量测核对，最终视觉验收需用户在真浏览器确认 |

## 14. 里程碑 1 实施记录（2026-09-19）

落地时相对本设计产生的四处偏离，均已验证：

1. **目录与工具名统一为 `resume`**。初稿写的是目录 `resume-builder` + path `/resume`，
   违反 AGENTS.md §3「目录名 = 工具名 = path 去斜杠」，改为 `src/tools/resume/resume/`、
   service 文件名 `resume.service.ts`、persist 键 `toolbox.resume`。
2. **`lazy()` 不能写在 `router.tsx` 里**。该文件只导出路由表（非组件），加组件会触发
   `react-refresh/only-export-components` 而断掉热更新，因此新增
   `src/plugins/resume-editor-route.tsx` 承载 `Suspense` + 懒加载。
3. **字体只搬 10 个文件（约 120 MB）**。`SourceHanSerifSC_Light.otf`（23 MB）在 `font.css` 有声明、
   在 `SidePanel` 无选项，且没有任何代码引用该 family 名，属孤儿资产；
   `AlibabaPuHuiTi-2-55/75` 与 `NotoSansSC-*.{woff2,js}` 旧仓库里本就不存在。
   旧项目的 `public/fonts` 只有 `SourceHanSerifSC` 三档缺失却被 `font.css` 引用（当前即 404），
   移植时按 `AlibabaPuHuiTi-3-*` / `MiSans-*` / `NotoSansSC-*.otf` / `SourceHanSerifSC-*.otf` 补齐，
   并把每族三个 weight 归到同一个 CSS family 下。
4. **种子会整体覆盖 `globalSettings`**，导致 `fontFamily` 为 `null`（旧项目同款缺陷）。
   已在 `createResume` 里以 `{ ...DEFAULT_GLOBAL_SETTINGS, ...seed.globalSettings }` 收口。

实测通过（dev server + 内置浏览器量测）：侧栏首个分类为「简历」（计数 1）、面包屑
「工具集 / 简历 / 简历工坊」、`<title>` 为「简历工坊 · ToolBox」、模板墙 9 张快照无破图、
空态文案正确；点模板卡 → 建简历 → 跳 `/resume/<uuid>`，编辑器带 `robots:noindex`，
`toolbox.resume` 落盘 `version: 1` 且 `history`/`future` 未被持久化，
种子里的 `employementStatus` 拼写与 7 个基础字段顺序保持原样。
`pnpm lint`、`pnpm typecheck`、`pnpm test`（51 文件 / 586 用例）、`pnpm build` 全绿，sitemap 51 → 52 URL。

另需 `pnpm-workspace.yaml` 记 `ignoredBuiltDependencies: [core-js]` 与 `strictDepBuilds: false`：
`jspdf → canvg → core-js` 的 postinstall 只打印赞助横幅，跳过即可；
否则 pnpm 11 的运行前依赖检查会把「有构建脚本被忽略」当错误，导致所有 `pnpm <script>` 失败。

## 15. 里程碑 2 实施记录（2026-09-19）

移植 83 个模板文件 + `rich-text.ts` / `project-link.ts` / `custom-field.ts` 三个纯函数库，
`lint`、`typecheck`、`test`（588 例）、`build` 全绿。

**批量改写规则**：`@/types/*` → 相对路径且拆成 `import type`（`getBorderRadiusValue`、`DEFAULT_CONFIG`
是值不是类型，单独指向 service / constants）；`@/lib/utils` 里的 `formatDateString` /
`formatDateRange` → service 的 `formatDisplayDate` / `formatDisplayDateRange`（用 `as` 保留调用点不变）；
`framer-motion` → `motion/react`；自研 i18n shim → `useTranslation('tools-resume')`；
`min-h-screen` → `min-h-full`（纸张是定尺寸 A4，不该跟视口高）；剥离 7 处 `GithubContribution`。

**顺手修掉的旧缺陷**（都改变了行为，逐条说明）：

1. `text-baseFont` / `text-subtitleFont` 共 133 处来自旧 `tailwind.config.ts` 的自定义色，
   v4 下改名为 `text-paper-ink` / `text-paper-muted` 并落进 `@theme`（色值不变），
   避免 camelCase 自定义属性名在 v4 的不确定行为。
2. 9 个 `BaseInfo` 的 `useMemo` 依赖数组漏了 `locale`——切换语言后纸张里的日期不重算，已补。
3. 8 个 `SectionTitle` 的 `useMemo` 依赖是一个每次渲染都新建的数组（`ctx?.menuSections ?? []`），
   memo 完全失效；对 ≤10 项的 `find` 本就不该 memo（§5），直接去掉。
4. **纸张里的列表原本没有圆点**：Tailwind 预置清掉 `ul/ol` 的 `list-style`，旧项目只有 editorial
   模板用 `prose` + `[&>ul]` 补回，另外 8 套模板无论屏上还是导出的 PDF 都是无圆点的裸行。
   移植时在 `.resume-paper` 补了层级化列表样式（disc/circle/square、decimal/lower-alpha/lower-roman）、
   blockquote、hr、code、a。这是一处**有意的视觉变更**，代价是模板快照 PNG 与新渲染有细微差异。
5. A4 像素基准用 `1122.5`（96 dpi，等于 CSS 里 `297mm` 的实际换算）替代旧代码的 `297 * 3.78 = 1122.66`，
   后者是按 Puppeteer 调的，与 DOM 真实值差 0.16px/页。

**两处架构调整**：`TemplateContext.tsx` 拆成 `TemplateContext.ts`（只放 context + hook）+
由 `TemplateSurface` 直接渲染 Provider，否则组件与 hook 同文件导出会被 react-refresh 拒绝；
按 layout 取组件改用 `createElement`，绕开 `react-hooks/static-components` 对"渲染期创建组件"的判定。

**oklch 风险实测结论**：纸张子树内仍有 142 个节点的计算色是 oklch，来自全局
`* { border-color: var(--border) }`（Tailwind v4 所有节点都有 `borderTopColor: oklch(...)`，
即使 `border-style: none`）以及从 `body` 继承的 `color`。`html2canvas-pro` 能正常解析，
真实导出通过：`新建简历 20b25a.pdf`、`application/pdf`、783,772 字节、无 console 报错。
另外已把 `#resume-preview` 根节点的 `color`/`background` 显式写成模板的十六进制色，
这样暗色主题下纸张仍是白底，且不依赖 -pro 也能少一类解析失败。

**字体实测**：`document.fonts` 里 `Alibaba PuHuiTi 3.0` 的 `100 400` 与 `500 900` 两个区间均 loaded，
纸张 `font-family` 计算值为 `"Alibaba PuHuiTi 3.0", sans-serif`。

## 16. 里程碑 3 实施记录（2026-09-19）

新增 `SettingCard` / `NumberField` / `ColorPicker` / `layout/LayoutSetting` / `layout/LayoutItem` /
`SidePanel`（五张卡）并挂进编辑器左栏。`lint`、`typecheck`、`test`（588 例）、`build` 全绿。

**相对旧版的结构性改动**：

1. 旧的间距设置把「滑杆 + 数字框 + ▲▼ 步进」复制了三遍（约 270 行，每份还带一个 `onChangeRef`
   补丁绕过 lodash 闭包），这里抽成 `NumberField` 复用三次；字号选择（正文/主标题/小标题）
   同样抽成 `FontSizeSelect`。
2. `LayoutSetting` / `LayoutItem` 不再从 `SidePanel` 逐层穿 6 个 store action，而是各自用
   selector 取用（§8 禁止整店订阅）。旧代码 `const { activeResume, ... } = useResumeStore()`
   会让左栏每次输入全量重渲。
3. 删除确认按钮的 `bg-gradient-to-r from-rose-500 to-orange-400` 硬编码渐变改回 `variant="destructive"`
   （§6 禁硬编码色）；隐藏章节按钮的图标色同理去掉 `text-red-400`。
4. `ColorPicker` 不放 `components/ui/`：那是 shadcn CLI 的领地，且 react-colorful 是本工具专属依赖。
   顺带去掉 `forwardRef` + `useForwardedRef`（React 19 直接传 ref）。
5. 主题色节流从 lodash `debounce` 改成组件内一个 timer ref，省掉 lodash 依赖。

**实测**（内置浏览器量测，dev server 5321）：点 `#0047AB` → 纸张 `h3` 计算色 `rgb(0, 71, 171)`、
`globalSettings.themeColor` 落盘；页边距步进 +3 → `#resume-preview` 的 `padding-top` 跟着变；
眼睛图标隐藏「专业技能」→ 纸张从 5 段变 4 段且 `menuSections` 记为 `skills:false`（列表里仍在，
只是不出现在纸上）；12 个预设色板、5 张卡标题齐全。

**一处已知的量测假象**：同一任务里连点三次 ▲ 只 +1，因为步进读的是本次渲染闭包里的 `value`。
真人点击分属不同任务、中间必然重渲，所以不构成缺陷；自动化脚本里才会踩到。

## 17. 里程碑 4（上半）实施记录（2026-09-19）

已落地：`EditPanel` 按章节分发、`Field`（text/textarea/date/date-range/editor）、
`DateField`、vendor 的 `components/ui/calendar.tsx`、`RichEditor`（Tiptap 3）+ `BetterSpace`、
泛型 `ItemPanel`、`SectionHeader`，以及工作经历 / 教育 / 项目 / 技能 / 自评 / 自定义六个面板。
`lint`、`typecheck`、`test`（588 例）、`build` 全绿。

**剩余（下一个切片）**：`basic` 与 `certificates` 两个面板，连带 `IconSelector`（1848 图标）、
`PhotoSelector` / `PhotoConfigDrawer`、证书多图上传与压缩阶梯。当前这两个章节在中栏显示
`resume.editor.panelPending` 提示，纸张渲染不受影响。

**踩到的一次真实白屏**：编辑器路由在 BaseLayout 之外，而 `TooltipProvider` 是由
`base-layout.tsx` 提供的，`SectionHeader` 里的 `Tooltip` 在渲染期抛
``Tooltip` must be used within `TooltipProvider``，被 `errorElement` 接住 → 整页空白且 DOM 全空。
修在 `resume-editor-route.tsx` 补 `<TooltipProvider delayDuration={200}>`。
教训：**脱离外壳的路由必须自己补齐外壳提供的 provider**；`ThemeProvider` 与 `Toaster`
因为在 `RouterProvider` 之外侥幸没事。dev 服务器要用 `--force` 重启过一次，
否则 Vite 的依赖预构建缓存不认识新装的 `@tiptap/core`，请求直接 500。

**其它记录**：

- `@tiptap/core` 必须显式安装：pnpm 的严格 `node_modules` 下不能依赖 `@tiptap/react` 的传递依赖。
- 旧 `Field.tsx` 里躺着一套从未接上渲染的 shadcn Calendar 状态（`yearInput` / `displayMonth` /
  `fromDate` 只写不读），移植时丢弃；HeroUI 的 `DateInput` 换成 `DateField`（`Popover` + `Calendar`，
  `captionLayout="dropdown"` 直接选年月），输出仍是 `YYYY/MM`，「至今」仍写入字面量字符串。
- 四个条目面板共用一个泛型 `ItemPanel`，替代旧项目里 4 份约 300 行的近似复制。
- 三处 React 19 / eslint-plugin-react-hooks 7 的修正：`setState` in effect 改成 `draft ?? title`
  派生；初值用惰性 `useState(() => ...)` 而不是空依赖 `useMemo`；Tiptap 的 `onUpdate` 只被创建时
  捕获一次，故 `onChange` 走 ref 转发——否则条目面板的 `patch` 闭包会拿到过期条目并写丢数据。
- `react-day-picker@10` 的 classNames slot 是下划线名（`day_button`、`month_caption`、
  `button_next`、`dropdowns`…），与 v8 时代抄来的 shadcn 片段不通用，按安装包内 `UI` 枚举逐个核对。

**实测**（dev server 量测）：中栏字段为 公司/职位/起止时间/工作描述；`.tiptap` 与
`[contenteditable]` 各 1、工具栏 11 个 `aria-pressed` 按钮；改「公司」→ 纸张文本实时更新且
`experience[0].company` 落盘；日期弹层有 31 个日格 + 2 个年月下拉，选完写入 `2021/07`；
富文本里输入的串同时出现在存储的 HTML 与纸张渲染结果中。测试数据已还原。

## 18. 里程碑 4b 实施记录（2026-09-20）

补齐基本信息面板与右侧悬浮工具条，并顺带做完导出全通道（原属 M6）。
`lint`、`typecheck`、`test`（588 例）、`build` 全绿。

**新增**：`BasicPanel`（布局三卡 / 头像 / 基础字段 / 自定义字段）、`AlignSelector`、
`PhotoSelector` + `PhotoConfigDrawer`、`IconSelector`、`CertificatesPanel`、
`Dock` + `DockIcon` + `PreviewDock`、`TemplateSheet`、`ExportDialog`、
`export/print.ts`、`export/markdown.ts`、`export/json.ts`、`export/download.ts`、`image-utils.ts`。

**与旧版的差异（逐条）**：

1. **GitHub 贡献图整块不搬**（BasicPanel 尾部的 Access Token / UseName 两行输入 + 开关）：
   需要 PAT 明文入库 + 跨域请求，属已确认的移除项。`basic.githubKey` 等三个字段仍留在数据模型里，
   仅为兼容旧数据，UI 不再暴露。
2. **头像 URL 不再走 `/api/proxy/image`**（无后端）。跨域图片仍会显示，但导出时可能被 canvas
   判为污染而跳过——这是纯前端的固有边界。
3. **vaul 抽屉 → shadcn `Sheet`**：本项目没有 vaul，且 §6 不引入第二套 UI 库。
   旧抽屉是 `modal={false}` 的常驻左滑面板，Sheet 是模态的，交互上多一层遮罩。
4. **magicui `Dock` 重写**：原版靠 `React.Children` 逐层探听子组件的 `type.name === 'TemplateSheet'`
   来决定在哪里画分隔线，且用了 `any`。改成显式的 `<DockDivider />`，行为一致、无内省。
5. **图标清单是 60 个精选而非全部 1848 个**：旧项目本就是一份带分类的精选表（此前调研把它记成了
   "1848 图标"，已订正）。lucide-react v1 删掉了品牌图标，
   `Github`/`Linkedin`/`Twitter`/`Facebook`/`Instagram` 与 `Building2`/`Filter` 已不存在，
   分别换成 `AtSign`/`Contact`/`Rss`/`Share2`/`MessageCircle`/`Newspaper`/`Hash`、`Landmark`、`Funnel`。
   另修一处旧 bug：旧表里存的 `"SearchIcon"` 是 import 别名而非 lucide 导出名，选它纸张上渲染不出图标。
6. **BasicPanel 不再本地镜像字段顺序**：旧实现用 `useState` + 两个 `ref` + 两个同步 effect 复刻了一份
   `fieldOrder`/`customFields`，切换简历会读到上一份残留；改为直接读写 store 的 `basic`。
7. **章节标题只画一次**：旧版 `EditPanel` 卡头和每个条目面板各有一个标题区，这里统一由 `EditPanel`
   渲染 `SectionHeader`，`ItemPanel` 不再自带。
8. 三处 React 19 / eslint-plugin-react-hooks 7 的适配：`PhotoConfigDrawer` 的"打开时同步草稿"从
   effect 改成渲染期比对 `open`；`IconSelector` 与 `TemplateSurface` 的运行期组件类型改用
   `createElement`；`react-resizable-panels` v4 把 `ref` 换成了 `panelRef`，且没有
   `onCollapse`/`onExpand` 回调，折叠状态改由编辑器页自己持有、只把命令式句柄当动作出口。

**实测**（dev server 量测）：基本信息面板四段齐全，3 张对齐卡、5 个图标选择器、5 个拖拽把手
（姓名与职位按规则钉死，既无把手也无删除键）；模板抽屉 9 张快照零破图；切到经典模板后
`templateId=classic` 且 `globalSettings` 被回写为 `[16, 12, 32]`（旧版"切模板连带改样式"的行为保留）；
导出对话框 5 个通道齐全；dock 9 个键位齐全，收起设置栏实测 373px → 0px、标签翻成"展开设置栏"、
再点回 373px。

**里程碑归属变化**：导出五通道与打印/Markdown 已在本次完成，M6 只剩本地文件夹同步的设置页、
旧数据迁移入口收尾，以及文档计数（49→50 工具、7→8 分类）。M5 剩移动端三 tab 与 FAQ 对话框。

## 19. 首轮验收反馈修正（2026-09-20）

用户对照旧项目实机截图提出四条，均已修复并实测：

1. **基础字段标签漏了 i18n 前缀**。`BasicPanel` 取的是 `resume.basicFields.<key>`，
   而语言包（也是模板层在用的）路径是 `resume.basicPanel.basicFields.<key>`，
   i18next 缺键时原样回吐键名，于是表单里出现 `resume.basicFie…` 压在输入框上。
2. **顶栏简历名可编辑**。原来是只读 `<span>`；改为就地 `Input`，失焦提交、`Enter` 提交、
   `Esc` 放弃，清空回落到 `resume.editor.untitled`。按 `resume.id` 加 `key` 以在切换简历时丢弃草稿。
3. **主题色选中的对勾居中**。色板按钮缺 `flex items-center justify-center`，
   绝对定位的底色 `<span>` 挤掉了行内布局。实测对勾相对按钮中心的偏移为 `[0, 0]`。
4. **导出补齐第六个通道：分页 A4 PDF**。旧对话框的六个磁贴里，"导出 PDF"是服务端
   Puppeteer 打 `@page` 做的真分页；此前只搬了长图那条，所以"没有分页"。
   新增 `exportPaperToPagedPdf`：整张长图光栅化后按 `页高 - 2×页边距` 逐页切片，
   每片重绘到一张 A4 画布并补回上下边距，再 `addPage` 拼成多页 PDF。
   切片几何与 `pageBreakOffsets()` 同源，因此屏上的分页参考线就是实际切刀位置。
   实测 1516px 的示例简历输出 2 页、807,346 字节。

**顺带修的一处真实缺陷**：`export/download.ts` 在 `anchor.click()` 之后同步
`URL.revokeObjectURL(url)`，与浏览器接管 blob 的时机抢跑（自动化里表现为 fetch 该 URL 直接失败）。
改为 `setTimeout(..., 0)` 释放。

## 20. 里程碑 5 / 6 收尾（2026-09-20）

至此设计范围内的功能全部落地，无剩余分批项。

**M5 补齐**：`MobileWorkbench`（<768 断点走底部三 tab：内容 / 样式 / 预览，含顶部章节胶囊、
`AnimatePresence` 切换动效与 `layoutId` 指示条）、`FaqDialog`（帮助按钮 + 四条折叠问答）。
旧版 FAQ 入口那颗带轨道光点与呼吸辉光的"魔法玻璃球"是 200 多行装饰 SVG，只保留功能。

**M6 补齐**：`BackupBadge`（顶栏备份状态徽标：未备份 / 保存中转圈 / 已备份 + 时间）+
`SyncSettingsDialog`（选择或更换文件夹、显示已绑定目录名、立即备份 N 份、从文件夹导入、
解除绑定、不支持时的降级说明）；入口页也放了「本地备份」按钮。
store 新增 `syncAllResumes()` 与 `importFromDirectory()`，并把 `syncPending` 接上真实的
防抖计数（原来声明了却从不更新）。

**实测**：入口页备份对话框渲染完整（尚未选择文件夹 / 选择文件夹 / 立即备份 3 份 / 从文件夹导入 /
自动保存提示 / 重新授权脚注）；编辑器顶栏徽标显示"未备份"、标题输入框存在；
FAQ 四条问题齐全，展开后答案正确显示 `toolbox.resume`；`document.body.innerText` 中已无
未解析的 `resume.*` 键。`innerWidth` 为 1885，因此移动端三 tab 分支本次只做了静态验证，
其实测需把窗口拖到 <768 由你确认。

**清理**：删掉未被使用的 `PREVIEW_SCALE`、`FIXED_BASIC_FIELD_KEYS`、`fieldPlaceholderKey`
与 `FALLBACK_ICON` 的多余导出；`docs/INDEX.md`、`docs/design/功能介绍文档.md`（新增
「简历 Resume（1）」小节）、`docs/design/详细设计文档.md` 侧栏小节、`docs/development/开发计划.md`
阶段 26 一并同步为 50 个工具 / 8 个分类（计数按注册表现算：resume 1 + crypto 10 + web 11 +
images 3 + development 11 + cheatsheet 4 + text 7 + life 3 = 50）。

**最终门禁**：`pnpm lint`（0 警告）· `pnpm typecheck`（0 错误）· `pnpm test`（51 文件 / 588 用例）·
`pnpm build`（sitemap 52 URL）。i18n `tools-resume.json` zh/en 各 337 键，逐键对齐。

## 21. 分页与二轮验收修正（2026-09-20）

**分页截断**：A4 边界是固定像素，按它硬切会把一行字劈成两半；旧版靠服务端 Puppeteer 打
`@page`，由浏览器分页引擎天然只在行盒之间断页。纯前端的等价做法是先问 DOM 哪些位置是
行与行之间的空白，再把切刀吸附过去：

- 新增 `resume/page-break.ts` 的 `measureLineBottoms()`：用 `Range.getClientRects()` 取纸张内
  每个文本行盒的底边（外加块元素底边），换算成不受 `transform: scale()` 影响的自然像素。
- `export/pdf.ts` 的 `exportPaperToPagedPdf()` 按这份候选点定刀，再用 `rowHasInk()` 逐行探测
  画布像素兜底（候选行正好压在分隔线 / 阴影上时有限上移，最多让出 20 CSS 像素）。
- `PreviewPanel` 的分页参考线走同一批候选点与同一套几何（`snapBreakOffsets`），
  屏上看到的线就是实际切刀位置。参考线与候选点改在 `measure` 里量，不再渲染期读 ref。

**分页导出丢页**（用户报"第二页没数据"）：`cuts` 是每页起点，旧循环条件
`cuts[last] < contentBottom - contentHeightPx * 0.5` 会在还剩半页内容时提前退出，
末尾那一整段被静默丢弃。改为循环到 `contentBottom` 并始终把它作为末位哨兵推入。
实测 2 页文档的两张 JPEG 分别为 661 KB / 109 KB（修复前只出 1 页）。

**头像设置弹窗崩溃**：`t('resume.photoConfig.borderRadius')` 既当标题又当选项对象，
i18next 返回对象后被当作 React children 渲染，整页崩。拆成 `borderRadius`（标题字符串）
与 `borderRadiusOptions.*`（选项）。顺带补一条 `src/test/modules/i18n/locale-parity.test.ts`：
逐命名空间比对 zh/en 的键路径，缺译/多译都会红。

**编辑器四处**：中栏 `EditPanel` 的滚动容器是 `flex flex-col`，而 shadcn `Card` 自带
`overflow-hidden`——按 flexbox 规范，非 visible 溢出的 flex 子项自动最小尺寸为 0，
于是卡片被压到容器高度并裁掉内容（表现为"没法滑动"）。去掉多余的 flex 包装即可。
分隔线悬停整条变绿（`hover:bg-primary`，去掉 `withHandle` 小药丸）；`DockIcon` 无 `onClick`
那一支原先把 `TooltipTrigger asChild` 直接套在 `Sheet`/`Dialog` 根节点上，透传的指针事件被
组件根吃掉，中间垫一层 `span` 后「切换模板」「导出」的提示恢复；导出图标换成 `Download`。

**章节图标换成本项目图标**：`MenuSection.icon` 从 emoji 改存 lucide 导出名
（`DEFAULT_SECTION_ICONS`、两份种子数据、`normalizeResume` 注入的 basic 章节），
渲染统一走新的 `components/SectionIcon.tsx`（查表 + `createElement`）。
`normalizeSectionIcon()` 把旧 emoji 映射到新名字，store 的 persist `version` 升到 2，
让已有数据在水合时重跑 normalize 完成换算。

**入口页重做**：模板墙不再常驻页面，改为 `CreateResumeDialog`（`从空白开始` hero +
`从模板开始` 九宫格截图，`max-w-[1100px]` / `h-[85svh]` / 内部 ScrollArea）。
两个创建入口都在弹窗里：`从空白开始` hero 建空白，九宫格用该模板的示例简历起步；
打开弹窗只有一个入口——网格首格那张虚线「新建简历」卡片，顶栏不再放重复的新建按钮。
`ResumeCard` 按 A4 比例出真缩略图——整张 A4 用 `ResizeObserver` 量到的容器宽度等比缩小，
图层 `pointer-events-none`，底部渐变压标题 + `模板名 · 时间`，页脚三键 编辑/复制/删除。
删掉随之失效的 `resume.mine.empty`、`resume.templates.heading`、`resume.templates.use`、
`resume.mine.updatedAt` 四个键（zh/en 同步，各 341 键）。

**门禁**：`pnpm lint`（0 警告）· `pnpm typecheck`（0 错误）· `pnpm test`（52 文件 / 609 用例）·
`pnpm build`（通过）。工具计数不变（50 个工具 / 8 个分类），本轮只改简历内部。

## 22. 示例数据改为后端方向（2026-09-20）

九套模板共用同一份种子数据，示例简历从"高级前端工程师 宋哈娜 / 北京市朝阳区"改为
"后端开发工程师 哈基墩 / 广东广州"（英文种子同步为 `Hajidun / Backend Engineer /
Guangzhou, China`）。专业技能、工作经历与三个项目全部换成后端口径：Java / Go、
Spring 生态、MySQL 索引与分库分表、Redis 与 Kafka、分布式事务与限流降级、
K8s 与可观测性；项目为交易中台订单服务、分布式任务调度平台、实时风控系统。
`blankResumeZh/En` 由 sample 展开后清空内容字段，因此无需另改。

`public/template-snapshots/zh/*.png` 九张缩略图是按旧数据截的静态图，不改就会和弹窗里
点进去看到的内容对不上。本次在浏览器里逐个模板把 `#resume-preview` 克隆成固定
210mm×297mm 的 A4 框，用 `html2canvas-pro`（scale 2）重截为 1588×2246 PNG 落回原路径，
尺寸与格式与旧图一致。截图脚本是一次性验证工具，未进仓库。
