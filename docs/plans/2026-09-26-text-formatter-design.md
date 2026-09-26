# 文本格式化工具（text-formatter）设计

日期：2026-09-26 · 分类：文本（text） · 参考：https://tools.top/text-formatter.html

## 1. 目标

把三个功能重复的旧工具（`text-statistics` 文本统计、`case-converter` 命名转换、`list-converter`
列表转换）合并为一个「左输入 / 右输出 + 快捷规则」的文本批处理工具：

- 规则一键作用于当前结果，连续点击自动串联加工；带撤销 / 重做栈。
- 底部状态栏显示行列与字符数，点击统计块弹出完整文本统计面板（承接原「文本统计」全部指标）。
- 命名风格与分隔符转换作为规则保留，旧 URL 通过 `redirectFrom` 重定向，不产生 404。

## 2. 规则清单（9 组 64 条）

图中 36 条全部覆盖，其余为调研补充。刻意不做：简繁转换（需词典依赖，违反 AGENTS.md §12
「优先零依赖」）、自定义正则替换（本次只收录一键规则）、Base64/URL 编解码（`encoder-decoder` 已有）。

| 组         | 数量 | 规则                                                                                                                       |
| ---------- | ---- | -------------------------------------------------------------------------------------------------------------------------- |
| 排序与顺序 | 6    | 升序、降序、按行长升、按行长降、反转行序、随机打乱行                                                                       |
| 大小写     | 5    | 全部大写、全部小写、每词首字母大写、句首大写、大小写互换                                                                   |
| 命名风格   | 8    | camel / Pascal / snake / CONSTANT / kebab / Train / Title / Sentence（逐行）                                               |
| 提取       | 6    | 邮箱、URL、数字、中文、英文单词、IPv4                                                                                      |
| 分隔符互转 | 15   | 逗号/分号/句号/`&`/空格/竖线/顿号 → 换行（7）；换行 → 上述 7 种（7）；合并为一行                                           |
| 包裹与编号 | 4    | 加双引号、加单引号、SQL 列表 `'a','b'`、添加行号                                                                           |
| 转义       | 4    | HTML 转义/反转义、Java 转义/反转义                                                                                         |
| 清理与删除 | 11   | 删除空格、修剪行首尾、压缩连续空格、删空行、删重复行、删标点、删特殊字符、删数字、删 HTML 标签、删注释行、删零宽与控制字符 |
| 格式转换   | 5    | 全角→半角、Tab→4 空格、统一换行符为 LF、Markdown→纯文本、HTML→纯文本                                                       |

「每词首字母大写 / 句首大写」只改首字母、保留原有分隔与词形；命名风格组走 `change-case`
的分词重组（`snake_case` → `camelCase` 这类跨风格转换依赖它），两者行为有意不同。

## 3. 状态模型

```ts
type FormatterState = { base: string; past: string[]; present: string; future: string[] }
```

- 左卡编辑 `base`，同时把链重置为 `[base]`（`present = base`，未应用规则时两卡内容相同）。
- 点规则 → `present = rule.apply(present)`，旧值入 `past`，清空 `future`。
- 撤销 / 重做在 `past` / `future` 间搬动 `present`；`past` 上限 50 步。
- 「覆盖源文本」把 `present` 写回 `base` 并清空链；「重置」回到 `base`（可撤销）。
- 空文本点规则提示后忽略；规则抛错在 `applyRule` 内 try/catch，提示且不污染链。

纯 reducer 放 `text-formatter.service.ts`，组件用 `useReducer` 装配。

## 4. 布局

- `ToolLayout` 常规（非沉浸式）模式。
- 上方 `xl:grid-cols-2` 放成对 `IoCard`（窄屏堆叠），下方是规则面板。
- `IoCard` 新增两个可选 prop：`footer` 状态条插槽、`floatingActions` 去掉标题栏并把粘贴/清空/
  复制悬浮到内容区右上角。两者默认关闭，`code-formatter`、`format-converter` 仍是带标题栏形态。
- 状态栏：左卡 `行 X · 列 Y` + `N 字符 · M 行`；右卡只有计数——`TextareaCopyable` 的输出是
  `<pre>` 而非 textarea，没有光标，故不显示行列。
- 点击计数块用 `Popover` 展开 14 项统计网格（字符 / 不含空格 / 字母 / 数字 / 中文 / 词 / 行 /
  唯一行 / 句 / 段 / 最长行 / UTF-8 字节 / 平均词长 / 阅读时长）。
- 规则按组平铺，每组 lucide 图标小标题 + `flex-wrap` 按钮。
- 按组着色通过 9 个 `--rule-*` 语义令牌实现（`index.css` 亮暗两套），不硬编码颜色。
- 两张卡各带一个「全屏」按钮（参考 tools.top 的 Fullscreen），打开 86svh 的 Dialog：输入侧是
  可编辑 textarea，输出侧是只读行号视图，与卡片共用同一份 state。

## 4.1 性能

统计要全量扫文本，逐键重算就是卡顿来源，三处收敛：

- `analyzeText` 改单遍 `codePointAt` 扫描 + 码点类别缓存，去掉 `[...text]`、`text.match(/\p{L}/gu)`、
  `TextEncoder.encode` 这类按字符量级的数组分配；130KB 文本从 20.8ms 降到 6.0ms，530KB 从 74ms
  降到 22ms（用例语义与数值不变，由 `text-formatter.service.test.ts` 兜底）。
- 统计走 `useDeferredValue`，输入先画旧数字，重活让出主线程。
- `RulePanel` 用 `memo`，`onPick` 经 `presentRef` 保持引用稳定，输入时不再重建 64 个按钮；
  `LineGutter` 也 `memo` 并改用 `countLines`（数换行符，不 split），千行文本不再每键重建 DOM。

## 5. 文件改动

**新增**

- `src/tools/text/text-formatter/index.ts` — `defineTool`，`redirectFrom: ['text-statistics', 'case-converter', 'list-converter']`
- `src/tools/text/text-formatter/text-formatter.service.ts` — 规则原语、`analyzeText`、`caretFromOffset`、`FormatterState` reducer
- `src/tools/text/text-formatter/text-formatter.rules.ts` — 64 条规则注册表（纯逻辑，不含图标）
- `src/tools/text/text-formatter/RulePanel.tsx` / `StatsBar.tsx`
- `src/composable/use-caret-position.ts`
- `src/test/tools/text/text-formatter/{text-formatter.service.test.ts,text-formatter.rules.test.ts}`

**删除**：`src/tools/text/text-statistics/`、`src/tools/text/case-converter/`、
`src/tools/development/list-converter/` 及 `src/test/` 下三个镜像目录。

**修改**：`src/tools/text/index.ts`、`src/tools/development/index.ts`、
`src/modules/i18n/locales/{zh,en}/tools-text.json`、`src/modules/i18n/locales/{zh,en}/tools-development.json`、
`src/components/io-card.tsx`、`src/index.css`、`README.md`（顺带校正早已失真的工具总数，文本 6 → 5、
开发表去掉「列表转换」一行）、
`docs/design/功能介绍文档.md`、`docs/development/开发计划.md`。

sitemap 由 `scripts/generate-sitemap.mjs` 扫描目录自动生成，路由由 `plugins/router.tsx` 从
`tools` 数组生成，均无需手工登记。

## 6. 验收

`pnpm lint && pnpm typecheck && pnpm test` 全绿；规则表驱动测试覆盖空输入 / 单行 / 多行 /
CRLF / 中文标点 / emoji / 无匹配；浏览器手测三断点（<768、768–1279、≥1280）与亮暗主题。
按 AGENTS.md §11 不执行任何 git 写操作。
