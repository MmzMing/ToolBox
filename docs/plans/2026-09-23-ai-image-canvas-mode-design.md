# AI 生图画布模式设计（React Flow）

日期：2026-09-23 · 状态：评审中 · 分类：images · 路由：`/ai-image-gen`

上一期 `2026-09-22-ai-image-gen-design.md` 第 8 行明确「画布模式本期不做，之后再单独立项」，本设计即该后续项。

## 0. 一句话目标

把会话视图里的 `ResultMasonry` 换成 React Flow 无限画布，图不再按时间流排列，而是按**血缘**排列：
提示词节点是生成锚点，用户可以把任意图片节点连进它、就地出图，产出的图挂在下游。
底部 Composer 与右侧悬浮 dock 原样保留。

## 1. 决策记录

| 决策点              | 结论                                                                                                                                  | 理由                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 画布语义            | 血缘图谱，不只是素材板                                                                                                                | 用户拍板。要能回答「这张图是从哪张图 + 哪句提示词改出来的」                                                                                                                              |
| 画布作用域          | 每个工作区一张独立画布；图片、位置、提示词链与连线都按 workspaceId 隔离                                                               | 先定「全局单画布」，实现后用户改判要工作区制。代价：跨工作区引用参考图不再可能                                                                                                           |
| 布局形态            | 画布绝对定位铺满整个内容区；Composer 与顶部提示条都悬浮在画布之上                                                                     | 实现后用户看效果改判。原方案 Composer 占 flex 一列，画布被压成内嵌圆角框，没有画布感                                                                                                     |
| 连线语义            | 用户手画 `image → prompt`；`prompt → image` 系统派生只读                                                                              | 用户拍板。提示词节点 = 生成锚点，两个入口（画布 / Composer）共用同一套 job 机制                                                                                                          |
| 存量承载            | 300 张硬顶全量上图 + `onlyRenderVisibleElements` 只渲染视口内节点                                                                     | 取消 60 条/页游标与滚动哨兵；IDB 侧分批读不阻塞首屏                                                                                                                                      |
| 位置存储            | 全量持久化到 IDB；新图按血缘落上游右侧空位；dock 提供「自动重排」                                                                     | 用户拍板。摆好的构图刷新不能丢                                                                                                                                                           |
| 状态模型            | 派生式：`nodes/edges` 由 `history + canvasNodes` 实时算出，RF 只做视图与回写                                                          | 权威式要在删图 / LRU 淘汰 / 分页 / 重建四处手写图同步，漏一处即幽灵节点                                                                                                                  |
| 布局算法            | 手写分层，不引 dagre/ELK                                                                                                              | 血缘是浅层 DAG（image → prompt → image，最长 2~3 层）；纯函数约 60 行且可单测，符合 AGENTS.md §12 零依赖优先                                                                             |
| 落地页              | 工作区列表：卡片只显示名称 / 描述 / 生成次数 / 图片数 / 更新时间，不带任何缩略图；「新建工作区」开弹窗填名称+描述，创建成功才进入画布 | 用户拍板。工作区是一等实体，不是生成记录的聚合视图                                                                                                                                       |
| 清空语义            | dock 的「清空」只清当前工作区的图片、overlay 与在跑任务                                                                               | 有了工作区隔离就不能再一把清全库                                                                                                                                                         |
| 节点操作            | 照搬 `ImageCard` 的 hover 操作条                                                                                                      | 用户拍板。习惯零迁移                                                                                                                                                                     |
| 多选导出            | 用 RF 原生框选，删除现有 `selectionMode` 勾选模式                                                                                     | 两套选择体系并存没必要；框选结果写回现有 `selectedImageIds`，导出逻辑不改                                                                                                                |
| 移动端              | 只读适配：<768 禁连线、隐藏重排入口，保留平移缩放与双击 lightbox                                                                      | 手指画边不可靠                                                                                                                                                                           |
| 新增依赖            | `@xyflow/react@^12.11.6`（peer react>=17，React 19 兼容）                                                                             | AGENTS.md §12 要求说明理由：用户指定 React Flow；无限画布 + 连线 + 框选 + 缩放自研成本远高于引库。工具本身 lazy，样式与运行时都进 `/ai-image-gen` 的 chunk，不入主包                     |
| object URL 生命周期 | 新增 `object-url.ts`：按记录 id 缓存 `createObjectURL`，删除与 LRU 淘汰时回收                                                         | 画布按可视区反复挂载同一张图，每挂一次造一个 URL 既浪费又泄漏；且原 `useMemo` 造 URL + effect 清理回收的写法在 StrictMode 双挂载下必然 revoke 掉仍在用的地址（实测 `naturalWidth` 归 0） |

## 2. 数据模型

### 2.1 统一不变式

**一次生成 = 一个 prompt 节点，节点 id = `'p:' + jobId`。**

画布上新建空文本节点时本地 mint 一个 ulid 作为 `nodeId`；点「生图」时把它剥前缀得到的 ulid 作为
`jobId` 传给 `submitGeneration`（新增可选入参，缺省时仍自行生成）。于是文本节点原地升级为该 job 的
prompt 节点——用户预先画好的入边、摆好的位置零重映射。Composer 提交走同一条路（用它的 jobId 建
prompt 记录），两个入口在图上完全同构。

### 2.2 边

| 边                | 来源                                    | 可编辑性                                                                  |
| ----------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| `image → prompt`  | prompt 记录的 `refs`                    | 用户手画；上限 4 条（对齐 Composer 参考图上限），`isValidConnection` 拦截 |
| `prompt → prompt` | prompt 记录的 `chain`                   | 用户手画；生成时按拓扑序把上游文本拼进最终提示词，空行分隔                |
| `prompt → image`  | 所有 `meta.jobId === 该节点 jobId` 的图 | 系统派生、只读；要断开就删图                                              |

链式拼合由 `composePromptText` 完成：取目标的传递闭包做上游，按「层深 → 创建时间 → 节点 id」定序，
最后拼上节点自身文本。`submitGeneration` 落 overlay 时用 `nodeText` 写回**原文**而不是拼合结果，
否则二次生成会把拼好的长文本再拼一遍。环由 `wouldCreateCycle` 在 `onConnect` 前拦截。

### 2.3 IndexedDB `toolbox-ai-image` v1 → v3

`onupgradeneeded` 只新增 store，`images` / `prompts` 结构不动，**零数据迁移**。

```ts
// store: canvasNodes, keyPath 'nodeId'
type CanvasNodeRecord = {
  nodeId: string // imageId，或 'p:' + jobId
  workspaceId: string // 画布按工作区隔离
  x: number | null // null = 未手动摆过 → 自动分层布局给位
  y: number | null
  text: string | null // 非 null 即代表这是一个 prompt 节点
  refs: string[] // 入边图片 id
  chain: string[] // 入边：上游 prompt 节点 id
  createdAt: number | null
}

// store: workspaces, keyPath 'id'，索引 updatedAt（列表倒序）
type WorkspaceRecord = {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
}
```

`ImageMeta` 同步加 `workspaceId`。工作区概念之前入库的记录没有这个字段，一律视为归属固定的
`LEGACY_WORKSPACE_ID`；`loadWorkspaces` 发现存在这类遗留数据时自动补建一个默认工作区，避免升级后
旧图在列表里凭空消失。

同一 `nodeId` 至多一条记录、只有一处位置来源，不存在双写。老数据没有 prompt 记录，派生时用该 job 最早
那条 `ImageRecord.meta.prompt` 合成一个，位置留 `null` 交给自动布局。

`idb.ts` 增量导出：`putCanvasNode` / `deleteCanvasNode` / `listCanvasNodes` / `clearCanvasNodes` 与
`putWorkspace` / `listWorkspaces` / `deleteWorkspace`，均沿用现有 `wrap(request)` 的错误包装。

不新增 `ImageMeta.refImageIds` —— 参考关系归 prompt 记录持有，避免同一事实在两个 store 各存一份。

### 2.4 顺带修掉的两个既有缺陷

- 参考图 data URL 现在只活在模块级 `jobInputs` map（`orchestrator.ts:40`），刷新后 `retryJob` 静默丢参考图。
  改为从 `promptNode.refs` → `getImage` → `bytesToDataUrl` 现取，重试能带图重跑。
- `WorkspaceView` 的 `onOpen` 接收 `jobId` 却整个丢弃（`AiImageGen.tsx:229`），点任何会话卡片进的都是同一屏。

## 3. 代码落位

纯逻辑一律进既有的 `ai-image-gen.service.ts`（AGENTS.md §7/§10：一工具一 service 一测试文件），
UI 与 RF 装配进新目录 `canvas/`。

```
src/tools/images/ai-image-gen/
  AiImageGen.tsx           # 改：ResultMasonry → <ImageCanvas>；selectionMode 相关状态删除；
                           #      传给画布的回调全部 useCallback 稳定（见 §7 的测量丢失坑）
  ai-image-gen.service.ts  # 增：纯函数
    #   buildCanvasGraph(images, canvasNodes)  → { nodes, edges, jobNodes }（含分层与落位）
    #   findFreeSlot(box, occupiedBoxes)       → 无位置节点的向下避让落点
    #   wouldCreateCycle(edges, source, target)→ 连线前的环检测
    #   normalizeCanvasNode(raw)               → 手改 IDB 的脏数据兜底
    #   aspectRatioOf(aspect)                  → 比例串→宽高比（从组件内联上移）
  object-url.ts            # 新：按记录 id 复用的 createObjectURL 缓存 + release 两个出口
  idb.ts                   # 改：DB_VERSION 2 + canvasNodes store 与四个读写函数
  store.ts                 # 改：overlays / viewport 入状态，删 selectionMode 与 hasMoreHistory；
                           #      persist version 4 → 5（新增 viewport，migrate + merge 兜底）
  orchestrator.ts          # 改：submitGeneration(prompt, params, references, { jobId?, refImageIds? })；
                           #      提交时落 prompt 记录；loadCanvas；resolveReferences 从 IDB 现取；
                           #      clearCanvasLayout / moveCanvasNode / linkReference / renamePromptNode；
                           #      loadHistory 改为循环读尽（不再有游标语义）
  canvas/
    ImageCanvas.tsx        # 图派生 + 事件回写 + fitView 定位（缩放条已移入 dock）
    nodes/ImageNode.tsx    # 包一层现有 ImageCard，宽度固定 240
    nodes/PromptNode.tsx   # 就地编辑文本 + 参数 chip + 入边 handle + 「生图」按钮 + 状态角标
  components/
    ResultMasonry.tsx      # 删
    ImageCard.tsx          # 改：去掉 selectionMode/selected/onToggleSelect；操作按钮加 nodrag
    SessionDock.tsx        # 改：画布任务操作 + 缩放读数，需渲染在 ReactFlowProvider 内，见 §5.4
```

`nodeTypes` / `edgeTypes` 必须提到模块作用域常量，写在组件内会让 RF 每次渲染重挂节点、blob URL 反复
创建与 revoke。

## 4. 自动布局

层号：`layer(image) = 0`（无入边者）；`layer(prompt) = 1 + max(layer(its refs))`；
`layer(output image) = layer(prompt) + 1`。同层按 `createdAt` 升序纵向堆叠，列间距 = 该层最宽节点 +
96px，行间距 24px。

已有位置的节点固定不动，自动布局只给 `x === null` 的节点找位：从它所属层的列 x 起，向下扫描第一个与
现有包围盒不相交（预留 24px gutter）的 y。新完成的图天然落在其 prompt 右侧一列，`count` 为 2~4 时纵向排。

「自动重排」= 批量把 `canvasNodes` 的 x/y 写回 null 后整图重算，前置 `AlertDialog` 确认（不可撤销）。

## 5. 交互

### 5.0 布局

画布容器 `absolute inset-0` 铺满 BaseLayout 的内容区（不再有边框圆角内嵌框）。Composer 与顶部
「未开启 AI / 未配置」提示条都是 `absolute` + `z-10` 悬浮在画布之上，Composer 居中收窄到 `max-w-3xl`。
代价：贴在画布底部的节点会被 Composer 挡住一部分，靠平移与全览避开——这是选悬浮布局的已知取舍。

**`ToolLayout` 的 `fill` 分支必须一起去掉 `mx-auto max-w-6xl px-4 py-4`**：只改本组件不够，外层居中容器
会把画布夹在 1152px 里，而 dock 是 `fixed` 按视口贴边，结果是画布左右各空一条黑边、dock 悬在空白上。
留白改为下放到各视图自管——`WorkspaceView` 自己加 `px-4 py-4`，画布视图不加。`immersive` 目前只有
本工具在用，这条分支的改动不波及其他工具。

### 5.1 画布手势

`selectionOnDrag` 左键框选 + `panOnDrag={[1, 2]}`（中键/右键平移）；滚轮缩放，触控板平移。
节点固定宽 240，图片高度按 `meta.params.aspect` 算（`aspectRatioOf`）。

### 5.2 节点

- 图片节点：复用 `ImageCard`，hover 操作条（下载 / 以此为参考 / remix / 详情 / 删除 / 重试 / 取消）原样保留，
  只有这几个小操作钮挂 `nodrag`（主图区不挂，见下条）；**单击**开 lightbox（沿用列表期习惯，不改双击）。
- 提示词节点：标题行「提示词」+ 参考图计数 + 「←N 条上游」徽标；正文用**非受控** `Textarea`
  （`defaultValue` + 失焦提交），受控写法需要把外部 text 同步进本地 state，会被
  `react-hooks/set-state-in-effect` 拒绝且会级联重渲染；左侧 target handle 收参考图与上游提示词连线，
  右侧 source handle 也可拖出（链式连线起点）；底部参数 chip 弹现有 `ParamBar`（改的是全局参数，与
  Composer 同源），旁边「生图」按钮跟随 job 态：queued / generating（点击=取消）/ failed（点击=重试）。
- **拖拽热区**：整张卡片都要能拖，`nodrag` 只挂在 hover 出现的小操作钮与提示词文本框上。主图区一旦挂上
  `nodrag`，用户就只能抓边缘拖动。点击与拖拽共存靠 d3-drag：只有真的移动过才会在 `yesdrag(view, true)`
  里一次性吞掉 click；`nodeClickDistance={4}` 留出容差，避免手抖几像素就打不开 lightbox。
  `img` 另需 `draggable={false}`，否则浏览器原生图片拖拽会抢走手势。
- 节点删除只走节点内按钮（RF 键盘删除按 `deletable: false` 关掉），因为删节点必须连带清 IDB 与 overlay。
  边分三种：`reference`（虚线，可删）、`chain`（点线，可删）、`output`（实线只读，由 jobId 派生）；
  `onEdgesDelete` 按边 id 前缀分流到 `linkChain` 或 `linkReference`，否则会错摘到 refs 上。
- 空状态：画布无任何节点时居中引导文案 + 「新建提示词」按钮。

### 5.3 框选与导出

`onSelectionChange` 把选中的图片节点 id 写进现有 `selectedImageIds`，`handleExport` 与 store 均不改。
删除 `selectionMode` / `toggleSelectionMode` / `toggleSelected` / `clearSelection` 中不再需要的部分
（保留 `selectedImageIds` 与 `clearSelection`）。

### 5.4 dock

`fixed top-1/2 right-3`，一整列：返回工作区 · 新建提示词 · 导出（选中/全部）· 自动重排（二次确认）·
全清（二次确认）· 分隔线 · 缩小 · 百分比 · 放大 · 全览。

缩放读数放得下是因为 dock 本身是竖排按钮列，百分比做成一行 10px 文本即可。代价是 `SessionDock` 必须
渲染在 `ReactFlowProvider` 内才能用 `useReactFlow()` / `useViewport()`——Provider 不产生 DOM 包裹，
dock 的 `fixed` 定位不受影响。缩放上下限与步长抽成 `CANVAS_MIN_ZOOM / CANVAS_MAX_ZOOM / CANVAS_ZOOM_STEP`
由画布与 dock 共用，避免两处字面量漂移。

右下角 React Flow 署名用 `proOptions={{ hideAttribution: true }}` 关掉了。**代价要记清楚**：
`@xyflow/react` 是 MIT 许可，源码里该开关只是一个普通布尔判断（`index.js` 的
`if (proOptions?.hideAttribution)`），MIT 只要求分发时保留 LICENSE 文件、不要求保留 UI 署名链接；
但库在关闭时会在 console 打一条警告，明确要求只有订阅 React Flow Pro 才该这么做。
即「合法但违背作者商业意愿」。要恢复只需删掉这一行 prop。

### 5.5 工作区列表与新建

落地页是工作区列表，不再是从生成记录聚合出来的会话卡片。卡片数据来自纯函数
`summarizeWorkspaces(workspaces, imageOwners, jobs)`，只算名称、描述、生成次数、图片数与更新时间，
**不加载任何缩略图**——省掉为每个工作区解码一张大图的成本。

`imageOwners` 是 orchestrator 在 `loadHistory` 时额外发布的全量图片归属索引：`history` 本身已按活动
工作区过滤，直接拿它统计会让其它工作区的卡片全显示 0。

流程：点「新建工作区」→ `WorkspaceCreateDialog` 填名称（可空，回落「未命名工作区」）与可选描述 →
`createWorkspace` 落 IDB、设为活动工作区、重载该区数据 → 才进入画布。点已有卡片 →
`setActiveWorkspace(id)` + 重载 → 进画布。表单重置放在关闭回调里做，不放 effect（会被
`react-hooks/set-state-in-effect` 拒绝）。列表不再放「还没有工作区…」的空态提示——新建卡片常驻网格
首位，那句话纯属冗余。

删除：卡片右上角 hover 出删除钮，走 `AlertDialog` 二次确认（文案带工作区名与图片数）。
`removeWorkspace(id)` 连带删掉该区的图片（`deleteImagesOfWorkspace`）、overlay
（`deleteCanvasNodesOfWorkspace`）与工作区记录，释放在其中的 object URL，取消该区在跑任务；删的正是
活动工作区时由 `dropWorkspace` 复位。**卡片根节点因此必须是 `div` 而非 `button`**——button 里再嵌
button 与 Radix 弹层是非法 HTML，改成外层 div 定位、内层 button 铺满当打开热区。两个按工作区删除的
游标函数刻意不建 `workspaceId` 索引：≤300 条全扫即可，省一次 DB 版本升级。

### 5.6 断点

- `≥1280`：全功能。
- `768–1279`：节点宽 220，dock 不变。
- `<768`：`nodesConnectable={false}`、handle 隐藏、「新建提示词 / 自动重排」隐藏，节点宽 200，
  保留平移缩放与双击 lightbox。Composer 照旧。

视口 `{x, y, zoom}` 与 `activeWorkspaceId` 存 zustand persist（`toolbox.ai-image-gen`，当前 version 6，
带 `migrate` + `merge` 逐字段兜底，符合 AGENTS.md §8）。

### 5.7 外部图片导入

两条入口，最终都走同一个 `importImages(files, position?)`：

- **拖放到画布**：容器 `onDragOver` 拦默认行为并点亮一圈虚线高亮，`onDrop` 用
  `screenToFlowPosition` 把松手点换算成画布坐标，图就落在那里。
- **dock 上传钮**：隐藏 `input[type=file][multiple]`，落点取画布可视区中心。

导入图入库时带 `meta.imported = true`、`jobId` 用自身 id、`prompt` 存文件名、并解码出固有宽高。
`buildCanvasGraph` 见到 `imported` 就把它排除在 job 聚合之外——**它不该长出一个 prompt 节点**，
而是作为纯根节点存在（层号 0，可被连进提示词当参考图）。节点高度优先用解码出的真实宽高，
取不到再回落到生成参数的 aspect。

校验沿用参考图同一套口径（`REFERENCE_MIMES` + `MAX_REFERENCE_BYTES`），这样任何落在画布上的图
都具备被连进提示词的资格；被拒的数量单独 toast。多张文件按节点宽度横向错开，避免叠在同一坐标。

窗口级也挂了 `dragover` / `drop` 拦截：没对准画布就松手时，浏览器会直接打开图片把整个页面换掉。

## 6. 样式与主题

`import '@xyflow/react/dist/style.css'` 放在 `ImageCanvas.tsx` 内，随 lazy chunk 加载。
AGENTS.md §6 禁止硬编码颜色：RF 的 CSS 变量在 `index.css` 统一映射到既有令牌，亮暗主题自动生效。

```css
/* 变量名以 @xyflow/react 12.11.6 实测为准 */
.react-flow {
  --xy-background-color: var(--background);
  --xy-background-pattern-dots-color-default: var(--border);
  --xy-edge-stroke-default: var(--border);
  --xy-edge-stroke-selected-default: var(--primary);
  --xy-connectionline-stroke-default: var(--primary);
  --xy-handle-background-color-default: var(--background);
  --xy-handle-border-color-default: var(--muted-foreground);
  --xy-selection-background-color-default: color-mix(in oklch, var(--primary) 12%, transparent);
  --xy-node-boxshadow-selected-default: 0 0 0 2px
    color-mix(in oklch, var(--primary) 45%, transparent);
}
```

点阵网格用 `Background` 组件的 `gap/size`，颜色走上面的令牌，不引入新色值。
右下角 React Flow 署名保留（`proOptions.hideAttribution` 是付费项，不隐藏）。

## 7. 错误处理

| 场景                                 | 处理                                                                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| IDB 不可用（隐私模式）               | 沿用 `isIdbAvailable()` 守卫；画布退化为仅内存，位置与 prompt 文本刷新即丢，顶部一条提示条说明，不弹错                                                                                     |
| v2 升级失败 / `canvasNodes` 打开异常 | `openDb` 的 reject 已被 `wrap` 捕获；列表读取失败时视为空 overlay，图照常渲染但全部走自动布局，toast 一次                                                                                  |
| 悬空 refs（LRU 淘汰了被连线的图）    | `buildCanvasGraph` 派生时过滤不存在的 imageId，边自然消失；**不做读时写回**，避免渲染路径产生 IDB 写入                                                                                     |
| 删除图片节点                         | `deleteImage` + `removeFromHistory` + 新增 `deleteCanvasNode(imageId)`                                                                                                                     |
| 删除 prompt 节点                     | 复用 `deleteJobImages(jobId)`（删该 job 全部产出 + job）+ `deleteCanvasNode('p:'+jobId)`                                                                                                   |
| 生成中刷新                           | jobs 不落 IDB（现状不变），占位节点跟着消失；prompt 记录仍在 → 图上留一个可点「生图」重跑的孤儿 prompt 节点，比现在只丢卡片更可恢复                                                        |
| 连线成环                             | `onConnect` 前 `wouldCreateCycle` 拦截，拒绝并 toast                                                                                                                                       |
| 连线超 4 条                          | `isValidConnection` 返回 false，`onConnectEnd` 给一次 toast                                                                                                                                |
| `canvasNodes` 脏数据（手改 IDB）     | `normalizeCanvasNode` 夹紧坐标为有限数或 null、`refs` 过滤为非空字符串数组并截 4 条、`text` 截断 4000 字符                                                                                 |
| **派生节点丢失测量**                 | 重建节点数组时必须把上一批的 `measured` 与 `selected` 带过来：RF 靠 `internals.handleBounds` 算连线端点，而 handleBounds 由 `measured` 触发。实测漏掉时节点正常显示、边数为 0 且无任何报错 |
| **回调身份抖动**                     | 传给 `ImageCanvas` 的回调全部 `useCallback` 稳定。内联箭头会让派生 effect 每次渲染都重跑，与上一条叠加即复现「边不渲染」                                                                   |
| 出图依赖真实 key                     | 无法代测，交付时明确声明                                                                                                                                                                   |

## 8. 测试

扩展 `src/test/tools/images/ai-image-gen/ai-image-gen.service.test.ts`（AGENTS.md §10：一个工具一个测试文件）：

- `buildCanvasGraph`：每个 job 合成唯一 prompt 节点并派生产出边；overlay `refs` 变参考边；悬空 refs 与同 job
  自引用被丢弃（后者会成环）；pinned 坐标原样保留、其余节点互不重叠；只有 prompt 记录没有产出图时节点保留；
  只有位置记录且图片已消失时忽略；`jobNodes` 索引；空输入返回空图。
- `findFreeSlot`：无占用直接落起点、同列向下避让一格（步长 = 高 + 24）、跨列占用不误判。
- `wouldCreateCycle`：无关节点放行、直接回边拒绝、跨三层闭路拒绝、自环拒绝。
- `normalizeCanvasNode`：合法记录四舍五入坐标；`NaN`/字符串/`Infinity` 坐标回落 null；非字符串与超长 `text`；
  `refs` 去重并夹紧到 4；`nodeId` 缺失或非字符串整条作废。
- `aspectRatioOf`：`3:2`→1.5、`auto`/`2:0`/`wide`→1。

边界覆盖遵循 §10：正常路径 + 空输入 + 非法输入。

门禁：`pnpm lint && pnpm typecheck && pnpm test`（含 i18n 重复键检查）全绿。
i18n：`tools-images.json` 增 `ai-image-gen.canvas.*` 与 `ai-image-gen.promptNode.*`，中英齐全；
同时删掉选择模式遗留键 `toolbar.select` / `toolbar.exitSelect`。

浏览器实测（dev server + IndexedDB 造 4 图 3 job 含跨 job 血缘）已通过：全幅画布与悬浮 Composer 布局、
7 节点 7 边在开启 `onlyRenderVisibleElements` 后仍全部渲染、图片 blob 正常解码、点卡片 fitView 定位、
新建提示词节点落库、自动重排把 5 条 overlay 坐标清空、`fitView`/缩放不产生假坐标写入、
单击选中 → dock 文案切「导出所选」、无 key 时点节点「生图」出 toast 并自动开设置弹窗。

**未覆盖**：真实出图链路（需用户 key）、鼠标框选多节点、手动拖出连线与断线、三断点截图。

## 9. 实施批次

1. 依赖与骨架：`pnpm add @xyflow/react`；`index.css` 令牌映射；`ImageCanvas` 空壳跑通替换 `ResultMasonry`。
2. 持久化：`idb.ts` v2 + `canvasNodes` CRUD + `normalizeCanvasNode`；store version 5 存 viewport。
3. 派生与布局：`buildCanvasGraph` / `layoutLayers` / `findFreeSlot` 纯函数 + 单测先行。
4. 节点与交互：`ImageNode`（复用 `ImageCard`）、`PromptNode`、手画边与 `isValidConnection`、框选导出。
5. 生成链路：`submitGeneration` 可选 jobId、prompt 记录落库、retry 从 refs 现取、`jobInputs` 退役。
6. dock 与 WorkspaceView 定位；断点打磨；i18n 补全；三门禁 + 浏览器自测。

## 10. 非目标

mask 局部重绘；多画布/页签；节点分组与折叠；任意方向连线（非 image→prompt）；协同编辑；
画布导出为图片/PDF；undo/redo；移动端连线。
