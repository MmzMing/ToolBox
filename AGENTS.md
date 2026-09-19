# agent.md — ToolBox 代码规范

> 本文件是 ToolBox 项目的统一代码规范，人类开发者与 AI 代理（Agent）共同遵守。
> 任何与本文件冲突的写法都视为违规；本文件未覆盖的场景遵循"与周围代码保持一致"原则。

## 1. 项目概览

- 定位：纯前端开发者工具站（数据 100% 本地处理，不上传服务器）。
- 技术栈：React 19 + Vite 8 + TypeScript 5（strict）+ Tailwind CSS v4 + shadcn/ui（Radix）+
  react-router v8 + zustand + i18next（中英双语）+ Vitest。
- 包管理：pnpm；Node >= 20.19。

## 2. 目录结构与职责（禁止越界存放）

| 目录                 | 职责                                                           | 禁止                     |
| -------------------- | -------------------------------------------------------------- | ------------------------ |
| `src/components/`    | 跨页面/跨工具复用的通用组件（ PascalCase 文件夹或单文件）      | 放页面专属组件、业务逻辑 |
| `src/composable/`    | React Hooks（`useXxx.ts`），可复用的有状态逻辑                 | 放 UI 渲染、放纯函数     |
| `src/layouts/`       | 布局壳：BaseLayout（侧栏+顶栏+内容区）、ToolLayout（工具页头） | 放业务组件               |
| `src/modules/`       | 横切功能模块：`command-palette/`、`i18n/`、`seo/` 等，各自内聚 | 相互 import 造成循环依赖 |
| `src/pages/`         | 路由页面级组件（首页、404、关于页）                            | 放可复用组件             |
| `src/plugins/`       | 应用初始化装配：router、i18n 注册、Provider 组合               | 放业务逻辑               |
| `src/stores/`        | zustand 全局 store（`xxx.store.ts`）                           | 放组件局部状态           |
| `src/tools/`         | 工具实现，按分类分目录，每工具一个目录                         | 工具之间相互 import      |
| `src/utils/`         | 零依赖/仅依赖第三方的纯函数                                    | 有 React 状态、有副作用  |
| `src/lib/`           | shadcn 基础设施（`utils.ts` 的 `cn` 等）                       | 业务代码                 |
| `src/components/ui/` | shadcn CLI 生成的组件，**不手改**（除非升级）                  | 直接改生成代码           |
| `scripts/`           | Node 脚本（脚手架、sitemap 生成）                              | 引入浏览器 API           |
| `docs/`              | 中文文档（deployment/design/development + INDEX.md）           | 放代码                   |

## 3. 命名规范

- 文件/目录：组件 `PascalCase.tsx`（或 `input-copyable.tsx` 风格，与同目录现状一致即可）；
  hooks `use-xxx.ts`；store `xxx.store.ts`；工具目录 `kebab-case`（与路由路径同名）。
- 组件、类型、接口：`PascalCase`；变量/函数：`camelCase`；常量：`UPPER_SNAKE_CASE`。
- 类型命名不加 `I` 前缀；布尔值用 `is/has/should` 前缀。
- 工具目录名 = 工具 `name` = 路由 path（去斜杠）。

## 4. TypeScript 规范

- `strict` 全开，禁止 `any`（用 `unknown` + 收窄）；优先 `type`，不用 `interface` 继承链。
- 开启 `verbatimModuleSyntax`：仅类型的导入必须写 `import type`。
- 开启 `erasableSyntaxOnly`：**禁止 enum / namespace / 参数属性**，用 `as const` 对象与联合类型。
- 导出：组件与工具函数用 named export；页面/工具入口组件用 default export（配合 lazy）。
- 禁止 `!` 非空断言（`createElement` 处等极少数场景除外）；优先收窄。

## 5. 组件规范（React 19）

- 函数组件；props 用内联 type 或同文件 `type XxxProps`。
- 优先受控组件；事件处理器命名 `handleXxx`；回调 props 命名 `onXxx`。
- 派生数据用 `useMemo`，仅当计算确实昂贵；不要滥用 memo 化。
- 每个 hook 一个职责；组件内逻辑超过 ~80 行时抽到 `composable/` 或子组件。
- 列表渲染必须带稳定 `key`；禁止用数组下标（静态列表除外）。
- 禁止在渲染期产生副作用；副作用统一 `useEffect`（或事件处理器）。

## 6. UI / 样式规范

- **只允许** shadcn/ui 组件 + Tailwind 工具类 + `index.css` 中的 CSS 变量令牌。
- 禁止硬编码颜色/间距/圆角：一律使用语义令牌（`bg-background`、`text-muted-foreground`、`border` 等），
  亮暗主题自动生效。
- 复用既有通用组件：可复制输出用 `components/copyable/*`；文本转换类工具骨架用
  `components/format-transformer.tsx`；工具卡片用 `components/tool-card.tsx`。
- 图标只用 `lucide-react`，尺寸统一 `size={16}`（内联）或 `className="size-4"`。
- 间距体系遵循 4 的倍数（`p-2/3/4/6`…）；页面内容区容器 `mx-auto w-full max-w-6xl px-4`。
- 响应式断点（与 `composable/use-breakpoint.ts` 一致）：
  手机 `<720`、平板 `720–1279`、PC `>=1280`。布局在三种断点下都必须可用。
- flex 容器内的滚动区（ScrollArea/overflow 容器）必须加 `min-h-0`（或 `min-w-0`），
  否则 flex 子元素默认 `min-size:auto` 会撑开父容器导致无法滚动与内容溢出。

## 7. 工具开发 SOP（最重要）

每个工具 = `src/tools/<分类>/<工具名>/` 下**三件套**，测试统一放 `src/test/`（镜像源码目录）：

```
src/tools/crypto/uuid-generator/
├── index.ts              # 定义并导出 tool（唯一入口）
├── UuidGenerator.tsx     # UI 组件（default export，供 lazy 加载）
└── uuid-generator.service.ts  # 纯逻辑：零 DOM/React 依赖，全部导出纯函数

src/test/tools/crypto/uuid-generator/
└── uuid-generator.service.test.ts  # Vitest 单测，覆盖 service 全部导出与边界
```

- `index.ts` 固定写法：

```ts
import { Hash } from 'lucide-react'
import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'hash-text', // = 目录名 = path 去斜杠
  path: '/hash-text',
  keywords: ['hash', 'md5', 'sha'], // 英文搜索关键词 + 中文别名
  icon: Hash,
  component: () => import('./HashText'), // lazy
  createdAt: '2026-09-19', // ISO 日期，两周内自动标记 isNew
})
```

- **title/description 不写在定义里**，走 i18n：命名空间 `tools-<分类key>`，
  键 `<工具名>.title` / `<工具名>.description`（详见 §9）。
- 分类归属只体现在所在目录与分类 `index.ts` 的注册，禁止在工具内重复声明 category。
- `service.ts` 纯函数命名动词开头（`generateUuid`、`parseJwt`）；输入输出均为可序列化数据；
  抛错用 `Error` 并写英文技术信息，UI 层负责翻译。
- 新建工具用脚手架：`pnpm create:tool -- <分类> <工具名>`，禁止手工复制遗漏文件。

## 8. 状态管理规范（zustand）

- store 文件：`stores/xxx.store.ts`，命名 `useXxxStore`；一个 store 一个领域。
- 需要持久化的状态用 `persist` 中间件，**必须**提供 `version` 与 `migrate`；
  读取后经 `normalize/validate` 函数校验兜底（防止 localStorage 被手工改坏）。
- 派生数据在组件里用 selector 订阅（`useToolsStore(s => s.favoriteTools)`），
  禁止订阅整个 store 导致全量重渲。
- 组件局部状态用 `useState`；跨组件但非全局的状态优先提升到最近公共父组件，不要进 store。

## 9. i18n 规范（i18next）

- 语言文件：`src/modules/i18n/locales/{zh,en}/*.json`，命名空间按文件名划分：
  `common`（通用 UI）、`categories`（分类名）、`home`、`about`、`notFound`、
  `tools-<分类key>`（每个分类一个文件）。
- 工具文案键：`<工具名>.title`、`<工具名>.description`（title 一句短语，description 一句话说明功能）。
- **所有用户可见文案禁止硬编码**，中文英文都必须有；关键词 `keywords` 同样双语。
- 语言切换：`useTranslation()` 取词；语言持久化与首访协商见 `modules/i18n/index.ts`，不要自建。

## 10. 测试规范（Vitest）

- 测试文件命名为 `<工具名>.service.test.ts`，放在 `src/test/` 下与源码镜像的目录；
  被测模块用 `@/tools/...` 别名导入。必须：覆盖正常路径 + 空输入 + 非法输入边界；
  断言用 `expect`，一个行为一个用例。
- 只测纯逻辑（service/utils/stores），UI 组件不强制测试。
- 测试文件与被测文件同目录；`describe` 描述模块，`it` 描述行为（英文）。

## 11. Git 与提交规范

- 分支：`main`（稳定）/ `feat/*`、`fix/*`、`chore/*`。
- 提交信息：Conventional Commits——
  `feat(tools): add hash-text tool`、`fix(i18n): missing zh keys for converter`、
  `chore: bump vite to 8.3`。scope 用模块名（tools/stores/layout/i18n/docs…）。
- 提交前必须通过：`pnpm lint && pnpm typecheck && pnpm test`。

## 12. 依赖与安全

- 新增第三方依赖需说明理由，优先零依赖实现；禁止引入与现有依赖重叠的库。
- 禁止引入需要后端/密钥的服务；一切计算在浏览器本地完成。
- 工具涉及用户输入的解析（XML/YAML/JWT…）必须做异常捕获，不能让页面崩溃。

## 13. AI 代理附加守则

- 动手前先读本文与 `docs/design/详细设计文档.md` 中相关章节；先模仿样板工具
  （`src/tools/crypto/hash-text/`）的结构与风格。
- 只创建自己分类目录下的文件与对应 i18n 文件；**不要修改** `src/tools/index.ts`、
  他人分类的文件、`components/ui/` 生成代码。
- 完成定义：四件套齐全 + i18n 中英文齐全 + `pnpm test`、`pnpm lint`、`pnpm typecheck` 全绿。
