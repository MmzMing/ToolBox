# cURL 指令生成工具（curl-generator）设计

日期：2026-09-26 · 分类：开发（development） · 参考：https://tools.top/curl-translator.html（仅参考，功能缺口见 §1）

## 1. 目标与竞品缺口

一个以 `HttpRequestModel` 为单一事实源的**双闭环**工具：表单拼命令，粘贴 curl 反填表单，
两种入口共用同一份模型与同一套生成器。

竞品扫描结论（tools.top / tinyash / curlconverter / Postman）中 tools.top 的四个真实短板，
即本工具的差异化落点：

| 短板                                    | 本工具做法                                            |
| --------------------------------------- | ----------------------------------------------------- |
| 只能导入原始 HTTP 报文，不能粘贴 curl   | 解析 curl，含 Chrome/Firefox DevTools 实际产物        |
| 只有 bash 一种方言                      | bash / Windows CMD / PowerShell，续行符与引号各自正确 |
| 连接/SSL/代理选项只写在文档里，无法勾选 | 已建模开关逐行可切，未识别参数原样透传                |
| 无任何语义校验                          | `validateModel()` 输出可定位的 warning 列表           |

导出层 `code-targets.ts` 与 curl 生成共用同一份模型：`prepareRequest()` 先把认证与请求体
摊平成「头列表 + 文本」，再由 5 个生成器（JavaScript fetch / Python requests / Java
HttpClient / PHP curl / Go net/http）各自格式化，转义规则按语言区分（JS 用单引号、
Go 优先反引号字面量、含反引号时退回转义双引号）。

刻意**不做**（YAGNI，避免变成半个 curlconverter）：AST 级无损往返、
HAR/OpenAPI 导入、230 个 curl 选项全建模、分词失败自动降级、任何代理转发。

实现路径：**纯自建、零新增依赖**。曾评估 `curlconverter@4.12.0`，其解析依赖
`tree-sitter` / `web-tree-sitter`（运行时加载 WASM 语法器）+ `jsesc` + `lossless-json` + `yamljs`，
对纯前端工具站体积与首屏代价过高，且返回结构丢弃原始 token，与「未知参数透传」冲突。
仅采用 curlconverter 仓库 `src/curl/opts.ts`（MIT）中约 25 个核心选项的**语义事实**，不复制代码。

## 2. 数据模型

```ts
type Dialect = 'bash' | 'cmd' | 'powershell'
type BodyKind = 'none' | 'json' | 'raw' | 'urlencoded' | 'form' | 'binary'
type AuthKind = 'none' | 'basic' | 'bearer' | 'apikey' | 'digest'

interface HttpRequestModel {
  dialect: Dialect
  lineStyle: 'multiline' | 'single'
  method: string // 显式；解析时按 §3 推断填入
  url: string // 不含 query 与 fragment
  query: QueryParam[] // 从 URL 抽出，可增删排序、可禁用
  fragment: string
  headers: HeaderItem[] // Cookie / Authorization 统一按 header 行处理
  body: Body // 判别联合，见 §2.1
  auth: Auth
  options: OptionItem[] // 关键：已知开关与未知参数同构存放
  extras: string[] // 无法归为 option 的裸 token（罕见兜底）
}
```

`options: OptionItem[]` 是整个设计的枢纽：`-L`/`-k`/`-m`/`--compressed` 这类已建模开关，
与 `-o`/`-w`/`--http2`/`--trace` 这类未识别参数，用同一结构存储，`recognized` 字段只决定它
出现在 UI 的「高级开关」区还是「其他参数（透传）」区。因此「未知参数原样透传」不需要特殊通道，
往返天然无损，重新生成时按原写法拼回。

### 2.1 Body 与 curl flag 家族映射

| BodyKind     | 生成产物                                  | 语义要点                                 |
| ------------ | ----------------------------------------- | ---------------------------------------- |
| `json`       | `--data-raw '{"a":1}'`                    | 不自动补 Content-Type，改为 warning 提示 |
| `raw`        | `--data-raw`（可切 `-d`）                 | `-d` 会吞换行与 `@`，故默认 `--data-raw` |
| `urlencoded` | 多 `-d 'a=1'` 或每字段 `--data-urlencode` | 两者编码责任不同，UI 明示                |
| `form`       | 多 `-F 'k=v'` / `-F 'f=@/path'`           | multipart，文件走 `@`，可注 `;type=`     |
| `binary`     | `--data-binary @/path`                    | 保留换行与字节原样                       |

### 2.2 Auth

`none` / `basic`（可选落 `-u user:pass` 或 `Authorization: Basic …` 头）/ `bearer`
（`--oauth2-bearer` 或 `Authorization: Bearer …` 头）/ `apikey`（`in: 'header' | 'query'`）
/ `digest`（`--digest -u`）。

## 3. 双向引擎

### 3.1 解析 `parseCurl(text) → { model, warnings }`

1. **分词**（`src/utils/shell-tokenize.ts`）：支持 `'…'`、`"…"`（含 `\"` `\\`）、
   `$'…'` ANSI-C 引用（Chrome 复制产物）、`\` 续行、`#` 注释；多命令按 `;`、`&&`、`||`
   与 curl 8.12 的 `--next` 切分后只取首条。遇到 heredoc、`$"…"`、命令替换等不支持语法 →
   报出行列定位的 error，**不自动降级**。
2. **归一**：短选项簇拆解（`-sSL`、`-XPOST`、`-dvalue`）、`--flag=value` 等号形式、
   长选项前缀唯一匹配（`--dat` → `--data`，歧义报错）。
3. **落库**：已知 flag 写入对应字段；未知 flag 连同原写法进 `options`（`recognized: false`）。
4. **语义裁决**（顺序即优先级）：
   - method：显式 `-X` ＞ `-I`→HEAD ＞ `-G`→GET ＞ 有 body→POST ＞ GET。
     `-X GET` 且带 body 时给 warning（curl 仍会带上 body）。
   - body：data 家族**类型互斥、后到覆盖类型**，同类型累加（多 `-d` 以 `&` 拼）；
     `-F` 与 `-d` 冲突按 curl 行为取后者并 warning；`-G` 把 body 字段搬进 query。
   - URL：缺 scheme 时补 `https://` 并 warning；query 解码进列表、生成时重编码，
     `+` 与 `%2B` 语义差异单独 warning；fragment 保留。
   - Cookie：DevTools 复制出的是 `-H 'cookie: …'`，按普通 header 处理；`-b`/`-c` 归透传项。

### 3.2 生成 `buildCurl(model) → string`

方言差异集中在 `dialect-escape.ts` 的一张表：

|          | bash                     | cmd                                | powershell                                                 |
| -------- | ------------------------ | ---------------------------------- | ---------------------------------------------------------- |
| 引号     | `'x'`，内部 `'` → `'\''` | `"x"`，内部 `"` → `\"`，`%` → `%%` | `'x'`，内部 `'` → `''`                                     |
| 续行     | ` \` + 换行              | ` ^` + 换行                        | 反引号 + 换行                                              |
| 可执行名 | `curl`                   | `curl`                             | `curl.exe`（避开 `Invoke-WebRequest` 别名，可切回 `curl`） |

输出顺序固定为 `curl → URL → -X → headers → auth → body → options → 透传项`，
保证同一 model 永远产出同一字符串（幂等，可写性质测试）。

### 3.3 校验

`validateModel(model) → { level: 'error' | 'warn', message, field }[]`，右栏常驻警告区，
逐条可点击定位到左侧字段。覆盖：空/非法 URL、method 与 body 矛盾、Content-Type 与
body 类型不符、重复 header、`-F` 与 `-d` 冲突、文件路径缺 `@`、透传项含疑似密钥。

## 4. 界面与交互

不使用 `immersive`；工具定义里打开 `wide: true`，让 `ToolLayout` 把内容区放宽到
`max-w-screen-2xl`（1536px）——默认的 `max-w-6xl` 只有 1152px，扣掉左栏后命令区不足 500px，
长命令必然横向溢出。滚动仍由页面级 `<main>` 承担（AGENTS.md §6 app-shell 约束）。

```
lg ≥1024： grid grid-cols-[minmax(0,1fr)_minmax(0,38rem)] items-start
< lg：     同一 grid 退化为单列，左表单、右输出依次向下
```

- **左列**是一张卡：顶部 Method + URL + 发送 一行（Apifox 的签名式布局），下面用横向 Tab
  分区——参数 / 请求头 / 请求体 / 认证 / 高级设置，每个 Tab 独占整幅宽度，因此表格里
  的说明列有足够空间。请求体的 `BodyKind` 用 ToggleGroup 而非下拉，旁边放 JSON 美化。
- 行编辑统一用自建 `key-value-list.tsx`：固定四列栅格（启用 / 名称 / 值 / 操作），
  表头一行与所有行列对齐；排序用 ↑↓ 按钮，**不用 dnd-kit**（仓库内 dnd 仅用于首页与
  Filmstrip，且 ↑↓ 让输出顺序可测）。高级设置一行三列（选项 / 说明 / 控件），**控件列必须
  用 `auto` 由内容定宽**——若给选项与控件各一条固定轨，在 lg 断点（左栏仅 ~464px）会把
  说明列压到只剩几像素，中文标签会竖成一字一行。
- **右列**两张卡。**输出卡**把 cURL 命令与 5 种语言代码收进同一个面板，用一排 Tab 切换
  （`cURL 命令 | JavaScript | Python | Java | PHP | Go`）：选中 cURL 时才追加方言与单行/多行
  切换和「按固定顺序重排」，其余目标只给代码。空态不渲染代码区（不留一片带行号的空白），
  改为一行居中提示；有内容时**不预留高度**——`TextareaCopyable` 的 `rows` 只当最小值用，
  容器跟着内容长。按行数估算高度永远差横向滚动条那约 15px 的厚度，要么在文字下方留一条
  死白（滚动条还会飘在死白上沿），要么挤出纵向滚动。顺带修掉该组件的行高常数：正文是
  `text-sm leading-relaxed`，实际行高 1.421875rem，原先按 1.6rem/行 计算，每行多算 0.18rem。
  卡底固定是校验列表。
  **调试开关（`-i` / `-v` / `-k` / `--compressed`）只在左栏「高级设置」出现一次**——曾在输出卡
  顶部再放一排勾选，同一状态两个入口，既挤易错又难对齐，已去掉。
  **历史卡**用 ScrollArea 限高（max-h-56），条目 = 方法徽标 + 地址 + 相对时间 + 单条删除。
  代码区复用 `TextareaCopyable`，高亮语言：bash / dos / powershell，缺失时退回纯文本。
- **顶栏**只留三个动作：示例、导入 cURL、分享（发送跟在 URL 输入框右侧）。导入走 Dialog：
  粘贴后自动嗅探——以 `curl` 开头走 curl 解析，首行形如 `POST /path HTTP/1.1` 走原始
  HTTP 报文解析（`Host:` 头提升进 URL），识别结果显示在按钮旁。

## 5. 发送请求与 CORS 兜底

逻辑放工具目录内 `use-curl-sender.ts`，**不进 service.ts**（service 必须零副作用）。

诚实性约束：浏览器 fetch 存在**禁止设置的请求头**（`Host`、`Content-Length`、`Cookie`、
`Accept-Encoding`、`User-Agent`、`Sec-*`，`Referer` 受限）。发送前剔除并在结果区明确列出
「以下 N 个头被浏览器忽略，实际线上请求与 curl 不一致」。

失败分类：`TypeError: Failed to fetch` 无法从 JS 侧区分原因，逐条列出可能性（目标未返回
`Access-Control-Allow-Origin`、预检 OPTIONS 被拒、网络不可达、https 页面请求 http 接口被
混合内容策略拦截），并附「终端执行 curl 不受 CORS 限制，请直接复制命令」。非 2xx 属正常
响应，照常展示。取消用 `AbortController` + 停止按钮。

结果面板：状态码与文本、耗时（`performance.now`）、响应头（注明跨域时浏览器只暴露安全头）、
响应体（文本超 1MB 截断；二进制只给 size/type + 下载按钮）。**永不自动发送**，按钮旁固定
一句数据流向提示（AGENTS.md §12）。

## 6. 周边能力

- **示例库** `presets.ts`：纯数据 5 条（REST JSON 创建、带鉴权下载、multipart 上传、
  GraphQL、表单登录），文案走 i18n key。
- **历史** `src/stores/curl-request-history.store.ts` → `useCurlHistoryStore`，`persist` +
  `version: 1` + `migrate`，读取后经 `normalize` 校验兜底（AGENTS.md §8）；上限 20 条，
  按生成结果字符串去重，条目显示 method + host + 相对时间，支持回填 / 单条删 / 清空。
  表单当前状态**不进 store**，留在组件 `useReducer`。
- **分享** 新建 `src/utils/share-codec.ts`（现有 `utils/base64.ts` 只有 dataUrl 助手，
  不硬凑复用）：`encodeShare(model)` → `#req=<base64url>`，解码失败静默忽略并 warning。
  长度 >1800 字符提示可能被截断。含 `Authorization` / `Cookie` / `-u` 时**必须先弹二次确认**，
  明示链接会带密钥。

## 7. 文件改动

```
src/tools/development/curl-generator/
  index.ts  CurlGenerator.tsx  curl-generator.service.ts   # service 只做门面与校验
  parse-curl.ts  build-curl.ts                              # 双向引擎各自成文件，避免单文件膨胀
  curl-flags.ts  request-model.ts  dialect-escape.ts  code-targets.ts  presets.ts  use-curl-sender.ts
  components/{key-value-list,request-editor,output-card,history-card,import-dialog,send-result}.tsx
src/utils/{shell-tokenize,share-codec}.ts
src/stores/curl-history.store.ts
src/test/tools/development/curl-generator/{curl-generator.service,code-targets,request-model,dialect-escape}.test.ts
src/test/utils/{shell-tokenize,share-codec}.test.ts
src/test/stores/curl-history.store.test.ts
src/tools/development/index.ts                              # 注册（分类 index 是合法改动点）
src/modules/i18n/locales/{zh,en}/tools-development.json     # curl-generator 段，双语齐全
```

实现期相对本设计的三处收敛（都不影响对外行为）：

- 解析与生成拆成 `parse-curl.ts` / `build-curl.ts`，`curl-generator.service.ts` 只做门面、
  `validateModel` 与报文导入，避免一个文件同时装两套语义。
- PowerShell 方言固定输出 `curl.exe`，不做「切回 `curl`」开关（别名坑比开关更常见）。
- 历史条目额外存了 `command` 字段：既是去重键，也是菜单里的预览文本；按命令原文去重，
  而不是按模型 JSON（同一命令被编辑后会重复入库）。

三件套用 `pnpm create:tool -- development curl-generator` 生成，禁止手工复制。
`shell-tokenize.ts` 放 utils 而非工具目录：它与 `docker-run-to-docker-compose-converter`
的分词器同属 shell 分词域。**本次不迁移** docker-run 那份（能力子集不同，迁移会扩大 diff
且需连带改它的测试），列为后续 follow-up。

## 8. 验收

- `pnpm lint && pnpm typecheck && pnpm test` 全绿，含 `check-tool-seo-keys.mjs` 与
  `check-i18n-duplicate-keys.mjs` 两个门禁（要求 目录名 = name = path 去斜杠，zh/en
  `title`/`description` 非空）。
- service 测试覆盖：正常 / 空输入 / 非法输入边界；method 推断表；body 类型覆盖优先级；
  透传项一字不差；三种方言转义表；以及两条**性质测试**——
  `build → parse → build` 字符串恒等，`parse → build → parse` 模型深相等。
- 手工：三断点（<768 / 768–1279 / ≥1280）布局可用无横向溢出；Chrome 与 Firefox
  DevTools「Copy as cURL」真实产物各粘一条，能解析 → 回填 → 改参数 → 再导出。
- 发送：对一个开放 CORS 的接口实测成功；对一个封闭接口能给出上述分类提示而非白屏。
