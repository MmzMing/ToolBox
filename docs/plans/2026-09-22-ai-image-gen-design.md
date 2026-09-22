# AI 生图工具（对话模式）设计

日期：2026-09-22 · 状态：评审通过待实现 · 分类：images · 路由：`/ai-image-gen`

来源：用户需求（对话式生图页截图对齐）+ 同类产品调研（ChatGPT Images、Gemini/Nano Banana、
Midjourney web、Recraft、Krea、即梦、LiblibAI、Civitai Generator）+ 两家官方 API 文档（2026-09）。

画布模式本期不做，对话模式做完后再单独立项。

## 1. 决策记录

| 决策点         | 结论                                                                       | 理由                                                                                               |
| -------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 出图协议       | 双协议：OpenAI Images（含兼容中转 nobanana）+ Gemini 原生（nano-banana）   | 用户拍板「两者都要」；baseUrl 用户可配，兼容网关走 OpenAI 协议                                     |
| AI 连接层复用  | `src/tools/resume/ai/` 上移为 `src/modules/ai/`，扩展出图协议后全站共用    | 用户拍板。避免重复实现凭证/校验/重试/错误码；符合 AGENTS.md §2 modules 定位与 §7 禁止工具互 import |
| 对话语义       | 流式任务 + 单步参考（每张图可「以此为参考图再改」），不做真多轮会话        | 用户拍板。多轮上下文 token 消耗大、两家格式差异大，单步参考覆盖迭代改图                            |
| 图片留存       | IndexedDB 持久化（blob + 元数据，LRU 上限），刷新后瀑布流恢复              | 用户拍板。localStorage 5MB 存不下图                                                                |
| 提示词缓存     | 持久化提示词库：反推候选自动入库 + 生成历史自动入库 + 手动收藏，一键导入   | 用户需求                                                                                           |
| skill 包       | 内置预设 + 用户自定义（编辑/启停）+ 整包 JSON 导入导出                     | 用户拍板。skill = 反推时约束输出格式/风格的指令模板                                                |
| 反推交互       | 一次出 3~4 条候选（学 Midjourney `/describe`），点选入输入框/入库          | 调研结论：多候选点选显著优于单条覆盖                                                               |
| 瀑布流实现     | CSS Grid + `grid-auto-rows` + 按已知宽高比算 row-span                      | 保留时间序；CSS columns 会乱序；零依赖                                                             |
| zip 导出       | JSZip（已在依赖）打包 blob + PNG tEXt 元数据 + metadata.json               | 调研：主流产品普遍缺失批量导出，是本地工具站差异化点；两家均返回 base64 无跨域障碍                 |
| 官方端点可达性 | 不承诺：项目实测（2026-09-20 设计 §1）OpenAI/Gemini 官方端点在本机网络超时 | 「CORS 支持」≠「网络可达」；保留 baseUrl 可配 + 连接测试按钮当场给结论                             |
| 默认模型       | 不写死：模型目录为可配置数组 + 允许手输；OpenAI 默认 `gpt-image-2`         | `dall-e-3` 已 2026-05-12 退役；`gpt-image-1-mini/1.5` 计划 2026-12-01 下线                         |

## 2. 代码落位

```
src/modules/ai/                          # 横切 AI 连接层（自 resume/ai 上移 + 扩展）
  providers.ts        # 厂商预设/协议枚举/凭证/任务槽/baseUrl 校验；协议族加 images-openai、images-gemini；
                      #   picks 任务槽扩为 { text, pdf, image, vision }；图像模型目录数组
  transport.ts        # 既有 4 协议 + 新增 buildImageRequest / readImageOutput；multipart 支持；生图超时 180s
  store.ts            # zustand persist，key 改 'toolbox.ai'（从 'toolbox.resume-ai' 一次性迁移），version 5
  legacy-ai-import.ts # 旧形状折叠 + 旧 storage key 读取
  （prompts/polish/grammar/pdf-import/pdf-render 留在 resume，不上移）

src/tools/images/ai-image-gen/
  index.ts            # defineTool，name/path = 'ai-image-gen'，注册进 images/index.ts
  AiImageGen.tsx      # 页面壳：工具条 + gallery + composer（default export）
  ai-image-gen.service.ts  # 纯函数：参数默认值与校验、比例→size 映射、候选 JSON 解析、skill 模板渲染、
                      #   PNG tEXt  chunk 写入、zip 编排、文件名净化、LRU 淘汰纯逻辑
  store.ts            # 会话任务队列状态机 + 提示词库/skills 的内存缓存与 IDB 同步
  idb.ts              # IndexedDB 薄封装（~100 行，零依赖）：images / prompts 两 store
  skills.ts           # 内置 skill 定义 + 导入导出 schema 校验
  components/
    ResultMasonry.tsx     # Grid 瀑布流 + 游标分页 + 选择模式
    ImageCard.tsx         # 占位/成功/失败/取消四态 + hover 操作 + 用量脚注
    Composer.tsx          # 输入框 + 参考图 chip + 参数 chips + 发送；反推模式变体
    ParamBar.tsx          # 模型/比例/质量/张数/高级 Popover
    ReversePromptPanel.tsx# 上传区 + skill 选择 + 候选列表
    PromptLibraryDrawer.tsx
    SkillManagerDialog.tsx
    ImageLightbox.tsx
    AiGate.tsx            # 未开启 AI / 未配置时的引导态（复用 modules/ai 的 ConsentGate 文案与配置 Dialog）

src/test/modules/ai/transport-images.test.ts   # 出图协议请求构造/响应提取/错误映射
src/test/tools/images/ai-image-gen/ai-image-gen.service.test.ts
```

i18n：`tools-images.json` 增 `ai-image-gen.*` 中英全量键（含错误码文案表、consent 文案、skill 内置项名称）。

resume 侧改动仅限 import 路径重指（组件 + 测试文件位置 `src/test/tools/resume/ai/` → `src/test/modules/ai/`），行为不变。

## 3. 协议与参数映射

公共参数面：模型、张数(1–4)、比例、质量、高级项。

| UI 参数 | OpenAI images-openai                                                                                                 | Gemini images-gemini                                                  |
| ------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 模型    | 目录默认 `gpt-image-2`，可手输                                                                                       | `gemini-2.5-flash-image` / `gemini-3-pro-image-preview`，可手输       |
| 比例    | `size`：1:1→1024x1024、3:2→1536x1024、2:3→1024x1536、auto                                                            | `imageConfig.aspectRatio`：21:9/16:9/3:2/4:3/5:4/1:1/4:5/3:4/2:3/9:16 |
| 质量    | `quality`：auto/low/medium/high                                                                                      | `imageConfig.imageSize`：1K/2K/4K（仅 Pro 模型显示该控件）            |
| 张数    | `n`（1–10，UI 限 4）                                                                                                 | 并发 N 个请求（`candidateCount` 固定 1），全局并发上限 2 job          |
| 高级    | `background`(auto/transparent/opaque)、`output_format`(png/jpeg/webp)+`output_compression`、`input_fidelity`(编辑时) | `seed`（整数可选）；OpenAI 不支持 seed → 控件灰置并明示               |

- 生图请求：OpenAI `POST {base}/images/generations`（JSON）；有参考图时 `POST {base}/images/edits`
  （multipart：`image[]` 多图、`prompt`、`model`、`n`、`size`、`quality`、`background`、`output_format`）。
  Gemini `POST {base}/v1beta/models/{model}:generateContent`，`generationConfig.responseModalities:['TEXT','IMAGE']`、
  `imageConfig`、`seed`；参考图以 `contents[].parts[].inlineData` 传入。鉴权头沿用 `Authorization: Bearer` /
  `x-goog-api-key`（与既有 transport 一致）。
- 响应提取：OpenAI `data[].b64_json`（gpt-image 系固定 b64）+ `data[].revised_prompt` + `usage`；
  Gemini `candidates[].content.parts[].inlineData.{mimeType,data}` + `usageMetadata`。
  响应无图 → `noImageInResponse`。
- 反推请求：OpenAI chat-completions 视觉（`image_url` data URL、`detail:'high'`、`max_completion_tokens:2048`）；
  Gemini `generateContent` 且 `responseModalities:['TEXT']` + inlineData。system = 所选 skill 的 `systemTemplate`，
  要求输出 3~4 条候选的 JSON 数组；解析复用 `parseJsonPayload`（围栏/裸数组/对象剥壳）。
- 错误码：复用 `AIErrorCode` 体系（401/403/429/413/5xx/CORS/超时/审核拒绝分类），新增
  `noImageInResponse`、`imageRefused`（Gemini safety blockReason / OpenAI moderation 拒绝）。
  生图超时 180s（文本仍 120s）；5xx 退避重试沿用。

## 4. 页面布局与交互流

页面根 `h-full flex flex-col min-h-0`（BaseLayout 内容区内）。对 AGENTS.md §6 的有意偏离：
§6「唯一滚动容器是 main」针对文档流页面；本页为聊天式工具，页面根 `overflow-hidden`，
gallery 是页内唯一滚动容器（`min-h-0`），main 在本路由不滚动、不 sticky。

- 顶部工具条：`[筛选 全部/生成/反推] [选择模式] [导出 zip] [清空] | [提示词库] [Skill 管理] [AI 设置]`。
  AI 设置复用 modules/ai 配置 Dialog（key/baseUrl/模型列表/连接测试）。
- gallery：Grid 瀑布流，首屏 60 条游标分页（IntersectionObserver）。
- 卡片状态机 `queued → generating → done | failed | cancelled`：发送即按张数插占位卡（shimmer + 队列位次）；
  OpenAI 单请求整批回填，Gemini 并发逐张回填、逐张可取消。失败卡保留原参数、卡上「重试」。
  hover 操作：下载 / 以此为参考图 / remix（参数+prompt 回填）/ 详情 Dialog（prompt、revised_prompt 展开、
  模型、参数、tokens、耗时）/ 删除；点击开 lightbox。卡脚：`模型 · 耗时 · tokens`。
- Composer（对照用户截图）：多行自增输入框；左下参考图上传 chip（可删）与提示词库插入；
  底行参数 chips：模式(生图/反推) | 厂商+模型 | 比例 | 质量 | 张数 | 高级；右下发送。
  AI 未开启时整块替换为 AiGate（consent 告知 + 去设置）。
- 反推模式：Composer 变上传区 + skill 选择器 + 「开始反推」；候选 3~4 条列于 Composer 上方面板，
  每条可 填入输入框 / 复制 / 存入库；候选自动全量入提示词库。
- 提示词库 Drawer：条目 = 文本 + 来源(reverse/gen/manual) + 时间 + 可选参数快照；搜索、点击插入、删除。
- zip 导出：选择模式勾选或「导出当前筛选」；包内 = 原图 + PNG 写 tEXt（prompt/model/size/seed/时间）+
  `metadata.json`；JSZip 进度 toast。
- 断点：<768 两列、参数 chips 收 Popover、卡片操作进菜单；768–1279 三列；≥1280 四~五列。

## 5. 数据与持久化

IndexedDB `toolbox-ai-image` v1：

- `images`：keyPath `id`(ulid)，索引 `createdAt`；记录
  `{ id, jobId, blob, mimeType, width?, height?, meta: { prompt, revisedPrompt?, provider, model, params, usage?, durationMs, createdAt } }`。
  上限 300 条或累计约 500MB，超限按 createdAt LRU 淘汰（纯逻辑可单测）。
- `prompts`：keyPath `id`，唯一索引 `text`（去重）；`{ id, text, source, skillId?, params?, createdAt }`，上限 200。

localStorage（zustand persist `toolbox.ai`，version 5 + migrate）：

- 既有 credentials/modelLists/picks/activeProvider/enabled/consentSeen；picks 扩 `{text,pdf,image,vision}`；
  storage name 由 `toolbox.resume-ai` 改名，migrate 时读旧 key 折入（与 legacy-ai-import 同模式）。
- skills 存工具自己的 store（`toolbox.ai-image-gen`，version 1）：
  `{ skills: Skill[], } `，`Skill = { id, name, description, builtin, enabled, systemTemplate, outputFormat: 'prose'|'mj'|'sd'|'json' }`；
  导入导出 JSON = `{ schema: 1, skills: Skill[] }`，导入逐条 schema 校验、id 冲突重新生成。
- 提示词库与 skills 的内存缓存由工具 store 持有，挂载时从 IDB/localStorage hydrate。

## 6. 安全与文案（AGENTS.md §12 对齐）

- 功能默认关闭（`enabled:false`）；首次开启一次性告知：「启用 AI 后，你的提示词与上传图片将发送到你配置
  的服务商；API key 仅存储在本浏览器 localStorage，本站不设中转。」（consentSeen 持久化，复用既有模式）。
- key UI 密码态显示、可切换明纹；任何日志/错误信息不含 key（沿用 transport 现状：只记 provider/model/status）。
- baseUrl 校验复用 `isValidBaseUrl`（仅 https；http 仅回环）；「测试连接」走 `listProviderModels` 预检
  CORS 与鉴权。官方端点网络不可达时文案引导「可填兼容网关地址」，不引导关安全策略。
- 参考图限制：png/jpeg/webp、≤20MB（OpenAI 上限 25MB 留余量）；读取为 data URL 仅本地内存/IDB。
- 导出物（tEXt/metadata.json）只含用户自身数据，纯本地生成。
- 首页/关于页 AI 限定文案沿用既有四处，不新增承诺。

## 7. 测试与完成定义

- `src/test/modules/ai/transport-images.test.ts`：generations/edits(multipart 字段)/gemini body
  （responseModalities、imageConfig、seed）构造；readImageOutput（b64_json、inlineData、revised_prompt、
  usage、无图报错）；状态码→错误码映射。
- `src/test/tools/images/ai-image-gen/ai-image-gen.service.test.ts`：比例→size 映射、参数边界
  （n/compression/seed 范围）、候选 JSON 解析（围栏/缺字段/非数组）、skill 模板渲染、文件名净化、
  tEXt chunk 长度与关键字、LRU 淘汰、skill 导入 schema 校验。
- 门禁：`pnpm lint && pnpm typecheck && pnpm test`（含 i18n 重复键检查）全绿；中英键齐全。
- 浏览器自测：dev server 截图验证布局三断点、AiGate、Skill 管理导入导出、提示词库、反推面板、
  失败路径文案。**真实出图依赖用户 key，无法代测，交付时明确声明。**

## 8. 实施批次

1. modules/ai 上移 + 协议扩展 + persist 迁移；resume import 重指；既有测试全绿。
2. 工具骨架：index.ts 注册、service、idb、store；i18n 骨架键。
3. UI：gallery + 卡片 + composer + 参数条；队列与取消/重试。
4. 反推 + skill 管理 + 提示词库。
5. zip 导出 + tEXt；lightbox；断点打磨。
6. 单测补齐 + 三门禁 + 浏览器自测。

## 9. 非目标（本期不做）

画布模式；真多轮会话上下文；OpenAI `stream + partial_images` 渐进出图；mask 局部重绘；
seed 的 OpenAI 侧支持（协议不存在）；模型价格/账单估算；分享链接。
