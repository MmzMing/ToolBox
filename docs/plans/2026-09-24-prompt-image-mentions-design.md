# 提示词 @ 参考图提及 · 设计

日期：2026-09-24 ｜ 范围：AI 生图画布的提示词节点

## 要解决的问题

一个提示词节点可以连入最多 4 张参考图，发给模型时它们是一个**有序数组**。多图编辑的提示词必须能指名道姓——"把 @图一 的服装穿到 @图二 身上"——而模型只能靠图片在数组里的位置来理解"图一"。因此编号不是文案，而是**语义锚点**：文本里的第 N 张，必须严格等于请求里的第 N 张图。

由此推出两条硬约束：

1. 编号来自参考图的顺序，顺序一变，文本就得跟着变，否则模型指错图。
2. 编号绑定到图片本身，而不是绑定到"第几个字"。

## 方案选择

**采纳：文本保持 `@图一`，节点另存一份按出现顺序的绑定表。**

`CanvasNodeRecord.mentions: string[]`，语义是"文本里第 k 个 `@图N` 标记绑定 `mentions[k]` 这张图"。用户在 textarea 里看到的永远是干净的中文标记，看不到 id；顺序变化时由纯函数按绑定表重写标记。

被否决的两个方向：

- 纯文本 + 错位时提醒：实现最轻，但编号会静默说谎，正是本功能要消灭的东西。
- 文本里存 `@[[图一:01HX]]` + 镜像渲染层：真相只有一份、永不脱钩，但要为透明 textarea 做字号/换行/滚动的逐帧对齐，放大弹窗里还得再实现一遍。在这种小节点框里性价比太低。

## 数据模型

- `CanvasNodeRecord.mentions: string[]`：按出现顺序的图片 id。IDB 无 schema，旧记录读出来即 `[]`，不升版本。
- `MAX_MENTIONS = 32`：同一张图可以反复 @，但手改坏的记录不能把 IDB 撑爆。
- `referenceLabelAt(index, lang)`：词表上限就是 `MAX_CANVAS_REFS`，中文 `图一…图四`，英文 `Image 1…4`，越界回落阿拉伯数字。**插入、解析、重算、面板显示都走这一个函数。**
- `ALL_REFERENCE_LABELS`：解析时中英文两种写法都认，中途切换界面语言不会让既有标记失效；下一次重算会把它们改写成当前语言。
- `usableReferenceIds(refs, resolve, jobId)`：节点真正可用的参考图——图片还在、且不是该节点自己的产出。**画布编号与出图请求共用这一个实现**，两处不可能漂移。
- `CanvasNode.refs` 改为暴露这份已校验顺序（原先是原始 refs），`mentions` 一并带上。

## 纯函数（对齐规则的全部复杂度都在这里）

- `parseReferenceMentions(text)`：按出现顺序扫出所有 `@图N`，返回 `{label,start,end}`。
- `zipReferenceMentions(text, mentions)`：逐位配对。绑定多于标记（用户手删了 token）→ 丢弃多余绑定；标记多于绑定（用户自己打的字）→ 不属本机制，原样保留。
- `remapReferenceMentions({text, mentions, refs, lang})`：活着的绑定按新下标重写标记；**图片已断开的标记连同文字一起摘掉**——留着 `@图二` 而它指向别的图，比删掉更糟。返回新文本与新绑定表。
- `insertReferenceMention({text, mentions, refs, imageId, start, end, lang})`：把 `[start,end)` 的 `@` 片段换成 `@图N `；绑定表按出现顺序记录，所以是 splice 到第 k 位而不是 push 到末尾。

## 交互

**点击模型**：单击只选中节点（选中态整圈描主色，用 `ring-2` 不占布局，不会把节点撑大 1px），此时文本框 `readOnly` 且不挂 `nodrag`，拖拽可以从文本区上直接起手；双击或 Enter / F2 进入编辑态，textarea 才可写并挂回 `nodrag nowheel`；失焦提交并退回选中态，Esc 在编辑态退出编辑（@ 面板开着时先关面板）。占位文案改为「双击编辑提示词……」，避免单击后打字没反应。

**胶囊工具条**：节点被选中、或正在编辑 / @ 面板打开 / 放大弹窗打开时，在卡片上方居中浮出（`w-max`，比节点宽是预期行为）。左端是信息：识图 badge，或 ✨ + 链级数 + `n / 4 张参考图`；右端是图标+文字的动作：`放大编辑`、`复制文本`、`下载为 txt`、参数 pill（`1:1 · ×1`）、`删除提示词`、任务态按钮（生图 / 取消 / 重试）。节点底部那层栏整体取消，正文只剩文本框；错误信息仍以一行红字留在文本框下方。

工具条里的按钮必须吃掉 `mousedown`：否则按钮先让 textarea 失焦 → 失焦即提交 → 提交导致节点重挂 → 点击打在已被替换的 DOM 上，按钮失灵。参数 pill 例外，它是 Radix 的 Popover Trigger，吃掉 mousedown 会打不开。

**@ 面板**：光标前出现独立的 `@`（行首或空白之后、且与光标之间没有空白）时从输入框下方划入，列出本节点已连入的参考图：缩略图 + `@图N` + 文件名。继续打字按编号与文件名过滤；↑↓ 移动、Enter/Tab 插入、Esc 关闭；悬停某项时在面板右侧浮出该图大图。一张都没连时给一句引导文案。识图节点不参与 @（它的原图本来就不进出图参考）。

**放大弹窗**：`h-[min(80vh,44rem)] w-[min(92vw,60rem)]` 的大编辑面，内嵌同一个 `MentionField`，所以 @ 能力在弹窗里同样可用；「完成」或关闭即提交回节点。

**下载**：`buildTextFileName(text, createdAt)` → `时间戳-首行摘要.txt`，`text/plain;charset=utf-8` 的 Blob 走 a[download]。

**连线反馈**：点线即断开，不再二次确认；连不上（形状不对、成环、超过 4 张、识图原图）也静默不接单，只让那条线接不上去，不弹 toast。

**textarea 改为受控草稿**：本地 `useState` 存文本与绑定表，blur/关窗才提交；外部写回（识图结果、参考图重排）靠 `key={text|mentions}` 重挂吸收。逐键回写 `data.text` 会把每次输入变成一次 IDB 写入，不可接受。

## 提交与边界

- 提交给 API 的提示词**原样**带 `@图N`，不做替换：所见即所得，编号在顺序变化时已被重算过，所以永远等于请求里图片的下标。
- 重算时机：`linkReference`（连入/断开）与 `renamePromptNode`（文本提交）都在 orchestrator 里过一次 `remapReferenceMentions`，是唯一写入口。
- 顺序一致性：`resolveReferences` 与画布共用 `usableReferenceIds`，所以"面板里的第 N 张"与"请求里的第 N 张"必然同源。
- **链式拼合的已知边界**：上游节点的 `@图N` 指上游自己的参考图，下游请求的图片是下游的参考图，两套编号不可互相翻译。本版不做跨链映射，拼合时上游文本原样带入。
- 语言切换：旧语言的标记仍能解析，下一次重算自动改写为当前语言。

## 测试

`ai-image-gen.service.test.ts` 覆盖：`referenceLabelAt` 两语言与越界回落；`parseReferenceMentions` 的阅读顺序与混合语言、非标记 `@` 不匹配；`zipReferenceMentions` 丢绑定；`remapReferenceMentions` 的重排、断开摘除、跨语言改写、手打标记不受影响；`insertReferenceMention` 的中间插入保序与未连入拒绝；`normalizeCanvasNode` 的 mentions 清洗与上限；`buildCanvasGraph` 把绑定表带到节点上、以及 refs 只含可用图。
