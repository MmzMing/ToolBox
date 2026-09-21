# GitHub 文件加速下载 设计

日期：2026-09-19 · 状态：已批准 · 分类：开发 · 路由：`/github-accelerator`

## 1. 目标

粘贴任意 GitHub 链接，识别其类型并归一化为可下载直链，再套用 gh-proxy 类前缀生成加速链接，
选定一个节点后给出单一下载入口。全程纯前端字符串处理，不发起任何网络请求，数据不出浏览器。

## 2. 非目标

- 不探测节点连通性（需跨域请求第三方）。
- 不调用 GitHub API 枚举 release 资源清单（需密钥、且违背无后端定位）。
- 不做仓库树批量下载、不做下载进度条（下载由浏览器接管）。

## 3. 方案取向

| 决策点   | 结论                                                        | 理由                                              |
| -------- | ----------------------------------------------------------- | ------------------------------------------------- |
| 加速节点 | 内置常用公共节点 + 允许自定义，自定义项持久化 localStorage  | 公共节点经常失效，改代码成本高                    |
| 节点清单 | 放 `src/config/github-accelerator.ts`                       | 沿用「外部链接集中管理、禁止硬编码」的约定        |
| 地址类型 | 全类型（blob / raw / release 资源 / 归档 / gist raw）       | 价值就在替用户处理这些形状各异的链接              |
| 结果呈现 | 单张结果卡：节点下拉 + 一个下载按钮，其余链接折进备用链接区 | 下载是主行动，不该在 N 行里挑；节点失效换下拉即可 |

## 4. 解析规则

输入先剥离 query 与 hash，再按 host 与路径段判定：仓库段结尾的 `.git`（`git clone` 链接写法，
如 `github.com/o/r.git/archive/HEAD.zip`）先剥掉再拼直链，否则 GitHub 一律 404；
文件名段自带的 `.git`（如 `remotes.git`）原样保留。

| 输入                                                   | 归一化直链                                                   | 类型          |
| ------------------------------------------------------ | ------------------------------------------------------------ | ------------- |
| `github.com/o/r/blob/<ref>/<path>`                     | `raw.githubusercontent.com/o/r/<ref>/<path>`                 | file          |
| `raw.githubusercontent.com/o/r/<ref>/<path>`           | 原样                                                         | file          |
| `gist.githubusercontent.com/u/i/raw/<file>`            | 原样                                                         | file          |
| `github.com/o/r/releases/download/<tag>/<asset>`       | 原样                                                         | releaseAsset  |
| `github.com/o/r/releases`、`/releases/latest`          | 不生成，提示需粘贴具体资源链接                               | —             |
| `github.com/o/r/releases/tag/<tag>`                    | `o/r/archive/<tag>.zip` 与 `.tar.gz`                         | sourceArchive |
| `github.com/o/r/tree/<ref>[/<path>]`                   | `o/r/archive/<ref>.zip` 与 `.tar.gz`（子目录时提示整仓归档） | sourceArchive |
| `github.com/o/r`（仓库首页）                           | `o/r/archive/HEAD.zip` 与 `.tar.gz`                          | sourceArchive |
| `github.com/o/r/archive/…`                             | 原样                                                         | sourceArchive |
| 非 GitHub 域名、`gist.github.com` 页面、无法识别的路径 | 不生成，返回对应提示键                                       | —             |

归档统一用短形式 `archive/<ref>.zip`：GitHub 会同时解析分支与标签，避免猜 `refs/heads/` 还是 `refs/tags/`。
`file` 类型额外产出一条 jsDelivr 备选 `cdn.jsdelivr.net/gh/o/r@<ref>/<path>`（gist 与 release 资源不适用）。

## 5. 模块划分

- `src/config/github-accelerator.ts`：`githubAcceleratorNodes`（label + prefix）。节点轮换只改这里。
- `github-accelerator.service.ts`（纯函数）：`parseGithubTarget`、`normalizeNodePrefix`、
  `buildAcceleratedUrl`、`archiveTargetsFor`。
- `GithubAccelerator.tsx`：输入卡片、每个解析结果一张卡（类型 + 文件名 + 节点下拉 + 下载按钮 +
  备用链接折叠区）、节点管理。
- `stores/preferences.store.ts`：新增 `customAcceleratorNodes: string[]`，persist `version` 3，
  `migrate` + `merge` 校验兜底（仅保留 https 前缀，去重）。2026-09-21 起另存 `acceleratorNode`
  （当前选中节点，`version` 4，缺字段回退 null 即取列表第一个）。
- i18n：`tools-development.json` 的 `github-accelerator.*`（zh/en 齐全）。

## 6. 错误处理

- 空输入、非法 URL、非 GitHub 域名、无法识别路径：识别区给出对应提示文案，不渲染结果列表。
- 自定义节点：仅接受可解析的 https 地址（无 scheme 时补 `https://`，保留子路径，归一化尾斜杠），
  非法或与现有节点重复时提示且不写入 store。
- 解析对每条链接独立进行，任何异常都归为提示，绝不让页面抛错（AGENTS.md §12）。

## 7. 测试

`src/test/tools/development/github-accelerator/`：解析规则表逐类覆盖，加空输入、非 GitHub 域名、
带 query/hash 的链接、`releases` 页面、子目录 tree；节点归一化覆盖缺 scheme、尾斜杠、http 拒绝、
非法串拒绝、子路径保留；`buildAcceleratedUrl` 覆盖前缀拼接。

## 8. 风险

- 公共节点生命周期短，失效由用户替换（自定义节点即为此设计）。
- 第三方节点会看到请求的 URL 与来源 IP，敏感或私有仓库文件不适用，UI 需明确提示。
- jsDelivr 对单文件体积与仓库大小有限制，只作为备选而非默认路径。

## 9. 变更记录

### 2026-09-21 结果呈现改为「解析 → 选节点 → 一个下载按钮」

首版把 N 个节点平铺成 N 行、每行一个「打开」，实测不符合预期：主行动是下载，却要用户先在
若干行里挑一条；且「打开」只是新标签跳转，节点回 `inline` 时文件显示在标签页里而非存盘。

- 结果卡改为：类型徽标 + 文件名、节点 `Select`（选中项持久化到 preferences `acceleratorNode`）、
  一条加速链接（可复制）、一个全宽下载按钮；原始直链、jsDelivr 备选与其余节点的链接统一收进
  「备用链接」`Collapsible`。
- 下载用直链点击 `<a href={加速链接} download={文件名} target="_blank" rel="noreferrer">`，
  不用 `fetch` 拉 blob：blob 虽能强制存盘与定名，但要把整个 release 读进内存，且依赖第三方节点
  返回 CORS 头——公共 gh-proxy 节点普遍不给。`download` 属性在跨域下会被浏览器忽略文件名，
  实际文件名以节点返回的 `Content-Disposition` 为准；`target="_blank"` 是为兜住回 `inline` 的
  响应（如单个图片/文本），避免工具页被导航走。
- i18n 删掉不再使用的 `open`，新增 `nodeLabel` / `download` / `moreLinks`。
- 同日补：`parseGithubTarget` 剥掉仓库段的 `.git` 后缀。粘贴 `github.com/o/r.git/archive/HEAD.zip`
  （从 `git clone` 地址改来的）时，旧实现把 `r.git` 原样拼进直链，节点回 404 表现为"下载 not found"。
  实测 `github.com/o/r/archive/HEAD.zip` 本身可用（HEAD 能解析默认分支，`main` 反而在
  `cli/cli` 这类默认分支叫 `trunk` 的仓库上 404），所以归档仍统一用 `HEAD`。
