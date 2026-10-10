# 手机 dock 菜单改原地变形卡片 · 设计记录

日期：2026-10-10
范围：`src/layouts/app-shell/MobileDock.tsx`、`src/layouts/nav-list.tsx`、`src/layouts/app-shell/CategoryPanel.tsx`、`src/layouts/app-shell/dock-logic.ts`、`common.json`（zh/en）

## 背景

改造前「菜单」键开的是 `Sheet side="bottom"`：78svh 整宽、从视口底边上滑，内容是九个分类
连同全部 60+ 工具一次性平铺。两处问题：

1. 抽屉与 dock 是两个互不相干的物体，点下去像换了一层 UI，而不是同一条 dock 被展开。
2. 平铺长列表在手机上要盲滚才能定位工具，且抽屉自带模态遮罩，与桌面档「图标条 + 分类浮层」
   的两级心智不一致。

参考 shadcn 的 Notch 组件（触发条与选项面板在同一个 `layout` 外壳里互为进出场），把形态改成
横向 dock 原地变形为响应式卡片。

## 决策与取舍

| 议题      | 结论                                               | 理由                                                                                   |
| --------- | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 形变机制  | motion `layout` 投影 + `AnimatePresence popLayout` | 尺寸由内容决定，条 ⇄ 卡片双向都不测像素；备选「显式测 rect 动画 width/height」代码翻倍 |
| 模态      | 不用 Radix Dialog/Sheet                            | portal 会把卡片搬到 body，跨 portal 的 layout 投影位置算错，形变就没了                 |
| 卡片内容  | 两级：分类图标网格 → 该分类工具列表                | 卡片高度有限（网格档 293px），与桌面档同一套心智；平铺长列表已删                       |
| 齿轮扇形  | 保留不动                                           | 本次只改「菜单」键的形态；两种形态各有所长，改动面也最小                               |
| 留白/圆角 | 走 `--dock-*` 令牌与 `rounded-4xl`                 | `AGENTS.md §6` 禁止散写颜色/圆角                                                       |

## 形变机制要点

- 外壳常驻 `layout`，条与卡片各是它的一个 `motion.div` 子树，都带 `layout` 做反畸变；
  进场内容延迟 0.14s 淡入，把形变最扭曲的一截交给外壳缩放独自扛。
- **`overflow-hidden` 只在卡片态挂**：常驻会把齿轮散开的扇形键削掉——那五个键本来就浮在
  条上方 132px 的溢出区里。这是保留扇形必须付的代价。
- 宽度 `w-[calc(100vw-1.5rem)] max-w-md`；工具列表 `max-h-[50svh]` 内部滚动，遵守 flex 里
  滚动区加 `min-h-0` 的约定。
- 卡片不是模态，关闭途径三条：头部收起键、Esc、点卡片外（沿用扇形那套 outside-pointerdown，
  保留 `[role=menu]` 豁免，否则选语言会被判成外点）。换页靠记 pathname 派生收起。

## 顺带修掉的既有 bug

`nav-list.tsx` 用不带命名空间的 `useTranslation()`，`dock.tools` 一直解析不到（i18next 落到不存在的
`translation` 命名空间），桌面浮层与手机卡片的 `aria-label` 实际是键名。改为 `useTranslation('common')`。

`NavList` 原先的 `ps-5` 层级留白移到 `CategoryPanel` 的滚动容器上，手机卡片因此能按自己的
内边距铺满整宽，桌面浮层逐像素不变。

## 验证

`pnpm lint && pnpm typecheck && pnpm test`（126 文件 / 2664 用例）全绿；`resolveShellLayout('mobile').panel`
由 `'sheet'` 改名 `'card'`，单测同步。

浏览器内在 390px 宽的容器里实测：条 224×52 → 网格卡片 362×293（9 格）→ 工具卡片 362×434
（图片 10 条，列表 `overflow-y: auto`，上限 378px）；返回、收起、Esc、外点、点工具跳页后自动
收起、齿轮扇形不被裁切——逐项验过。

## 遗留

- 形变的观感（畸变程度、spring 时长、0.14s 淡入延迟是否合适）只量了几何，没做逐帧目视，
  需要真机或开发者工具节流再校一次。
- 卡片里的语言/主题仍是「卡片之上再开 Radix 下拉」的两层浮层，与 Notch 的「选项直接铺在面板里」
  不同；要统一就得把扇形也收进卡片（本次明确不做）。
