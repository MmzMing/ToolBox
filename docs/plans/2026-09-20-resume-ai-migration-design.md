# 简历工坊 AI 能力迁移设计

日期：2026-09-20 · 状态：已实现 · 分类：简历 · 路由：`/resume`、`/resume/:id`

来源：`D:\my-tools\tool-resume`（Magic Resume）的 `src/lib/server/ai-provider.ts`、`src/config/ai-models.ts`、
`src/components/shared/ai/AIPolishDialog.tsx`、`src/store/useGrammarStore.ts`、`src/lib/pdf-import*` 等约 25 个文件。

## 0. 本文档推翻的既有决策

`2026-09-19-resume-builder-design.md` §2 把「AI 润色」「AI 语法检查」「PDF 视觉导入」列为非目标，理由是
"旧实现走服务端函数，AGENTS.md §12 禁止引入需要后端/密钥的服务"。本次以**纯前端直连 + 用户自带 key**
重新纳入这三项，并连带纳入它们依赖的**AI 服务商配置**。该 §2 的这三行就此作废。

由此必须同步修改 AGENTS.md §12 与四处隐私文案，见 §7。

## 1. 实测：谁能被浏览器直连

从 `http://localhost:5173` 发起带 `Authorization` / `x-api-key` 的 POST 探测（不含任何简历内容）：

| 服务商    | 端点                                        | 结果            | 浏览器直连 |
| --------- | ------------------------------------------- | --------------- | ---------- |
| deepseek  | `api.deepseek.com/v1`                       | 401             | 可         |
| 通义 qwen | `dashscope.aliyuncs.com/compatible-mode/v1` | 401             | 可         |
| 豆包 ark  | `ark.cn-beijing.volces.com/api/v3`          | Failed to fetch | 不可       |
| Anthropic | `api.anthropic.com/v1`                      | Failed to fetch | 不可       |
| OpenAI    | `api.openai.com/v1`                         | 6s 超时         | 不可       |
| Gemini    | `generativelanguage.googleapis.com`         | 6s 超时         | 不可       |

探测局限：单次采样、且超时无法区分「CORS 被拦」与「本机网络不可达」。因此**不把结论写死成可用性判断**，
只在目录上给提示，真实结论由连接测试当场给出（见 §6.1）。

## 2. 决策记录

| 决策点             | 结论                                                               | 理由                                                                       |
| ------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| 后端               | 不加任何后端与代理                                                 | 用户拍板。官方端点不承诺可用，目录逐家标注「可能需自备可跨域地址」         |
| 范围               | 4 块能力一次做完，不分期                                           | 用户拍板，要求功能不丢失                                                   |
| 设置入口           | 简历列表页工具栏两个按钮：`AI 辅助`总开关 + `AI 服务商`设置弹窗    | 用户拍板。编辑器内不加第三个按钮，未配置时在原页打开同一弹窗               |
| 隐私               | 首页/关于/页脚/工具描述加限定 + 首次开启一次性确认                 | 用户拍板                                                                   |
| 润色丢内联样式     | 修：补 turndown 规则保留 color / highlight / textAlign / underline | 旧项目缺陷，用户拍板要修                                                   |
| 校对应用失配       | 修：先剥标签按纯文本匹配，再映射回原串替换，跳过标签内部           | 旧项目缺陷，用户拍板要修                                                   |
| 补旧项目没有的能力 | 停止生成按钮、全部采纳按钮、`corsBlocked` 错误码                   | 用户拍板                                                                   |
| mark.js            | 不引入，自研文本节点标记器                                         | 唯一用途是包 `<mark>`，自研约 60 行可覆盖，省一个运行时依赖                |
| 高亮重建           | 预览变更后重标（旧项目重渲染即丢高亮）                             | 不修则改一个字高亮就没了，属功能不可用                                     |
| 旧配置导入         | 一次性搬同 origin 的 `ai-config-storage`                           | 与既有 `legacy-import.ts` 搬 `resume-storage` 同一模式；旧应用确曾同域运行 |

## 3. 代码落位

```
src/tools/resume/ai/                     # 纯逻辑层，零 DOM 依赖，全部可单测
  providers.ts        # 6 厂商预设、协议枚举、凭证与任务槽形状、baseUrl 校验、supportsPdf 推断
  transport.ts        # 4 协议请求构造 / 响应提取 / SSE 解码 / 重试 / 超时 / 错误码 / 拉模型列表
  prompts.ts          # 润色、校对、视觉导入、视觉自检 4 段 prompt 原文
  polish.ts           # HTML <-> Markdown 往返（含内联样式规则）、流式累加
  grammar.ts          # 结果区间映射、纯文本匹配回填、标记器与重标
  pdf-import.ts       # pdfjs 逐页转图、限制校验、结构化校验与回填映射
  store.ts            # zustand persist，key 'toolbox.resume-ai'，version 4 + migrate
  legacy-ai-import.ts # 四代数据折成一形状（旧扁平键 / models[] / 全局两槽 / 当前凭证表）

src/tools/resume/resume/components/ai/   # UI 层
  AIConfigDialog.tsx     # 服务商与模型配置、连接测试
  AIPolishDialog.tsx     # 润色弹窗
  GrammarCheckDrawer.tsx # 校对结果抽屉
src/test/tools/resume/ai/                # 对应 service 层单测
```

依赖新增：`pdfjs-dist`（PDF 逐页转图）与 `@lobehub/icons-static-svg`（6 张厂商品牌图标，
lucide 无品牌标识；只 `?url` 引 6 个文件，构建时内联）。`turndown` 与 `marked` 已在 `package.json`。

## 4. 数据与持久化

`store.ts` 只存「厂商凭证 + 拉到的模型名 + 每厂商各自的型号选择 + 使用中厂商」：

```ts
type AIConfigState = {
  credentials: Record<AIProvider, { apiKey: string; baseUrl: string }>
  modelLists: Partial<Record<AIProvider, string[]>> // 「获取模型列表」的结果，按厂商缓存
  picks: Record<AIProvider, { text: string | null; pdf: string | null }> // 每厂商各记一份，互不覆盖
  activeProvider: AIProvider // 润色 / 校对 / PDF 导入实际走哪家
  enabled: boolean // 总开关，默认 false
}
```

- persist key `toolbox.resume-ai`（对齐仓库既有的 `toolbox.resume` / `toolbox.preferences` 命名），
  `version: 4`，`partialize` 只存上述字段，`migrate` 逐字段兜底
- `enabled` 默认 `false`：不配置、不开启时 AI 相关 UI 一律不渲染
- 旧项目的两代迁移（扁平 `doubaoApiKey` 等 → `migrated-<provider>` → `migrated-pdf-<provider>`）
  在 `legacy-ai-import.ts` 里保留，仅在检测到同 origin 存在 `ai-config-storage` 时执行一次
- API key 明文存 localStorage，与旧项目一致；不做加密（前端无安全密钥可依赖，加密是自欺）

## 5. transport 契约

逐条照搬 `ai-provider.ts`，去除 Node-only 部分（`undici ProxyAgent`、`process.env`、`@google/generative-ai`）：

- 4 协议：`chat-completions` / `responses` / `gemini` / `anthropic`
- 鉴权头差异：Gemini `x-goog-api-key`；Anthropic `x-api-key` + `anthropic-version: 2023-06-01`；其余 `Authorization: Bearer`
- baseUrl 归一：去尾斜杠 + 剥掉尾部 `/chat/completions|/responses|/messages`；校验仅 http/https、禁 userinfo/query/hash
- Anthropic 硬编码 `max_tokens: 8192`，其余协议不设上限（与旧项目一致）
- SSE 解码必须跨任意字节边界、处理 CRLF、多行 `data:` 合并、末事件无换行、`[DONE]` 跳过
- 内容级失败判定：`finishReason` 截断 → `truncatedOutput`；`SAFETY`/`refusal` 等 → `refused`；空输出 → `emptyOutput`
- 重试：仅 upstream 5xx，2 次，250ms → 750ms，等待可被 signal 打断
- 超时：`AbortSignal.timeout(120_000)` 与用户 abort 合并
- 错误码：旧项目 20 个全保留，**新增 `corsBlocked`**——fetch 抛 TypeError 且无响应时判定，
  文案直接指向「该服务商可能不允许浏览器直连，请改填可跨域的中转地址」

## 6. 四块能力规格

### 6.1 服务商配置弹窗

T 字形三栏：顶部标题 + 说明 + 总开关卡片，左栏厂商列表（品牌图标 + 已配置/待完善配置），
右栏该厂商的设置项。窄屏（<sm）左栏退到上方、整块单列滚动。

- 左栏每项带官方品牌图标（`@lobehub/icons-static-svg` 的 6 个 SVG，`?url` 引入后内联进 chunk；
  OpenAI 与 Anthropic 是单色图，暗色主题靠 `dark:invert` 翻白）；顶部「N/6 已配置」胶囊
- 每厂商一份 API Key（该厂商全部模型共享），明文/掩码切换，「获取密钥」外链
- **Base URL 对全部 6 家开放编辑**（旧项目只允许 openai 改；纯前端下自备中转是唯一出路）
- 模型区块右上角两个动作：**「获取模型列表」**按当前 Key + Base URL GET `/models`
  （OpenAI 兼容与 Anthropic 读 `data[]`，Gemini 读 `models[]` 并剥掉 `models/` 前缀），
  结果按厂商缓存；**「检测连接」**取当前厂商的任务槽，文本走 system `Reply with exactly OK.`
  → 成功判 `/^OK[.!]?$/i`，视觉走本地 canvas 画随机 6 位数字 → 要求模型回 `{code}` → 比对
- 双任务槽垂直排布（标签在左、下拉在右，用 shadcn Select）：候选项 = 拉到的列表 ∪ 当前值，
  两槽共用同一份列表；列表拉不到时末项「手动输入模型名」切成输入框
- 检测结果内联展示 + `role="status"`；`corsBlocked` 与 401/403/429 分别给不同文案；
  凭证一改就重挂模型区，旧结论与在飞请求随之作废
- **不做内置模型目录**：旧项目那 18 条型号名无法核实，且各家列表随时变；一律以 `/models` 实拉为准
- `supportsPdf` 由模型名正则推断（端点不返回能力字段），**只决定连通性自检跑文本还是跑图片**；
  不做任何可用性拦截——名字里不带 vision 的真实视觉模型多得很，猜错会把用户填的型号吞掉
- 不做：新增/删除/排序/启停模型、批量导入导出（旧项目也没有）

### 6.2 AI 润色

挂点 5 处 `type="editor"` 字段。链路：字段 HTML → `turndown`（`headingStyle:'atx'`、`bulletListMarker:'-'`，
**外加自定义规则保留 color / highlight / textAlign / underline 的 inline style**）→ Markdown →
流式请求 → Markdown → `marked`（`{html:true, breaks:true, linkify:false}`）→ HTML → 回填。

交互：左右双栏对照、打字机流式、自动滚到底、自定义要求 textarea（生成中禁用）、
按钮三态（开始润色 / 生成中 / 重新生成）、**新增「停止生成」按钮**、生成中禁 Esc 与外点、
关闭即 abort 并清空、应用=整段替换 + toast、撤销走全局 undo。

prompt 原文照搬（含 6 条输出强约束与「用户额外要求」插值），中英界面下均不改写。

### 6.3 AI 语法检查

- dock 一键触发，取 `#resume-preview` 的 `innerText` 整份一次性检查（不分批、不截断，与旧项目一致）
- 返回 `{errors:[{context, text, suggestion, reason, type}]}`，剥围栏 JSON 后校验 `Array.isArray`
- 高亮四态：错别字红虚线 / 标点琥珀 / hover 底色 / active 2s 闪烁；只标首处
- 自研标记器：遍历文本节点拼接出「文本视图 + 节点偏移表」，跨元素匹配，用 `<mark>` 包裹
- **预览内容变更后自动重标**（先 unmark 再重打），修掉旧项目「改一个字高亮就丢」的问题
- 定位：给预览滚动容器补 `data-preview-scroll-container="true"`，点卡片平滑居中滚动
- 抽屉：结果非空自动弹出、顶栏红色「发现 N 个问题」徽标可重开、单条应用/忽略、**新增「全部采纳」**、
  全部清空、空结果占位
- 应用算法（修正版）：对每个 string 字段先剥 HTML 得到纯文本视图 → 在 `context` 内定位 `text` →
  映射回原 HTML 串替换，跳过标签内部；`context` 未命中则退化为全局替换且仅当 `text.length > 2`

### 6.4 PDF 视觉导入

- 列表页「导入 JSON」对话框加第二张卡片「导入 PDF」，`accept=".pdf"`
- `pdfjs-dist` 动态 import，逐页 canvas（scale 2、宽上限 1600、JPEG 0.82）
- 限制：10 页 / 文件 20MB / 请求体 16MB / 120s（客户端 130s）；加密 PDF 直接失败
- 视觉模型 → JSON → schema 校验 → 回填 `title` + `basic` 7 字段 + `education` / `experience` / `projects`
  （`details` 转 `<ul><li>`）+ `skillContent`；`photo` 与 `customFields` 置空；缺姓名给 `missingName` 警告
- 写入前只读预览确认（与旧项目一致，不做可编辑校正）

## 7. 文案与规范改动（需你签字）

**AGENTS.md §12** 第二条现为「禁止引入需要后端/密钥的服务；一切计算在浏览器本地完成。」
拟改为：

> - 禁止引入后端服务；一切计算在浏览器本地完成。
> - 例外：可选的 AI 能力允许用户自行填写服务商 base URL 与 API key，由前端直连该服务商。
>   约束：不得引入自建中转或代理；key 只存本地；功能默认关闭，开启前一次性告知数据流向；
>   文案必须明示「启用 AI 后内容将发送到你配置的服务商」。

**四处隐私文案**需加限定（zh + en 各一处）：

| 文件                           | 键                   | 现文案                                               | 拟改                                                                                                  |
| ------------------------------ | -------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `locales/zh/common.json`       | `footerNote`         | 全部工具在浏览器本地运行，数据不上传服务器           | 全部工具在浏览器本地运行；简历工坊的可选 AI 功能会把内容发往你配置的服务商                            |
| `locales/zh/home.json`         | `subtitle`           | ……全部在浏览器本地运行，数据不上传服务器。           | 末尾追加「（可选 AI 功能除外）」                                                                      |
| `locales/zh/about.json`        | `intro`              | 所有计算都在浏览器本地完成，不收集、不上传任何数据。 | 「不收集、不上传任何数据」→「不主动上传数据；简历工坊的 AI 为可选项，启用后内容直连你所配置的服务商」 |
| `locales/zh/tools-resume.json` | `resume.description` | ……数据全程留在浏览器                                 | ……可选 AI 润色与校对（直连你配置的服务商）                                                            |

## 8. 测试

按 AGENTS.md §10 只测纯逻辑，全 mock `fetch`，不出网：

- `providers.test.ts`：6 厂商预设、baseUrl 校验、`supportsPdf` 名字推断、任务槽解析与生效厂商
- `transport.test.ts`：4 协议请求构造差异、SSE 跨字节边界解码、finishReason 与拒答分类、
  5xx 重试次数与打断、`corsBlocked` 判定
- `polish.test.ts`：HTML↔Markdown 往返后内联样式不丢（本次修的重点）、自定义指令拼接
- `grammar.test.ts`：纯文本匹配映射回 HTML 的正确性、跳过标签内部、`text.length > 2` 门槛、全部采纳
- `pdf-import.test.ts`：页数/体积/请求体上限、schema 校验、`missingName`、回填映射

## 9. 验收清单

- 总开关关闭时：润色按钮、dock 校对键、PDF 导入卡片全部不渲染
- 首次开启弹一次性确认
- 6 厂商配置齐全后「N/6 已配置」计数正确；文本与视觉两类连接测试分别可跑通并给内联结果
- 未配置模型时点任一 AI 功能 → toast + 「去配置」在当前页打开弹窗
- 润色：流式可见、停止生成可中断、应用后颜色/高亮/对齐仍在、Ctrl+Z 可撤销
- 校对：高亮可见、改一个字后高亮仍在、单条应用与全部采纳都不破坏 HTML 结构
- PDF 导入：超页/超体积/加密三种失败路径都有明确文案
- 断点 1440 / 1280 / 1024 / 768 四档弹窗与抽屉可用
- `pnpm lint && typecheck && test` 全绿

## 10. 明确不做

- 不加后端、不加代理字段、不加服务端限流
- 不承诺 OpenAI / Gemini / Anthropic 官方端点可用
- 不做章节一键生成、翻译、JD 解析（旧项目本就没有）
- 不引入 `mark.js`、`@google/generative-ai`、`undici`
- 不迁移旧项目的死代码：`src/app/api/{polish,grammar}/route.ts`、`lib/server/gemini.ts`、
  `utils/index.ts` 的 `openAIRequest`、`config/ai.ts`
