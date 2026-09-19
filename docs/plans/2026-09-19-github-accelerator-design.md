# GitHub 文件加速下载 设计

日期：2026-09-19 · 状态：已批准 · 分类：开发 · 路由：`/github-accelerator`

## 1. 目标

粘贴任意 GitHub 链接，识别其类型并归一化为可下载直链，再套用 gh-proxy 类前缀生成一组加速链接，
逐条提供复制与打开。全程纯前端字符串处理，不发起任何网络请求，数据不出浏览器。

## 2. 非目标

- 不探测节点连通性（需跨域请求第三方）。
- 不调用 GitHub API 枚举 release 资源清单（需密钥、且违背无后端定位）。
- 不做仓库树批量下载、不做下载进度条（下载由浏览器接管）。

## 3. 方案取向

| 决策点   | 结论                                                       | 理由                                       |
| -------- | ---------------------------------------------------------- | ------------------------------------------ |
| 加速节点 | 内置常用公共节点 + 允许自定义，自定义项持久化 localStorage | 公共节点经常失效，改代码成本高             |
| 节点清单 | 放 `src/config/github-accelerator.ts`                      | 沿用「外部链接集中管理、禁止硬编码」的约定 |
| 地址类型 | 全类型（blob / raw / release 资源 / 归档 / gist raw）      | 价值就在替用户处理这些形状各异的链接       |
| 结果呈现 | 逐节点一行，含完整链接 + 复制 + 打开                       | 节点失效时能立刻换下一条，不必展开折叠区   |

## 4. 解析规则

输入先剥离 query 与 hash，再按 host 与路径段判定：

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
- `GithubAccelerator.tsx`：输入卡片、识别结果标注、按目标分组的节点链接列表、节点管理。
- `stores/preferences.store.ts`：新增 `customAcceleratorNodes: string[]`，persist `version` 3，
  `migrate` + `merge` 校验兜底（仅保留 https 前缀，去重）。
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
