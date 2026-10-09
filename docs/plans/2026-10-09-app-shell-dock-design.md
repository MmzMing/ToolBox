# app-shell 悬浮 dock 布局重构 · 设计记录

日期：2026-10-09
范围：`src/layouts/`、`src/composable/`、`src/stores/preferences.store.ts`、`src/index.css`、5 个沉浸工具

## 背景

改造前是「sticky 侧栏 256px + sticky 顶栏 56px + document 滚动」。三处问题：

1. 侧栏长期占走 256px 内容宽度，5 个沉浸式画布工具只能靠硬编码 `h-[calc(100svh-3.5rem)]` 补偿顶栏高度。
2. 实现与 `AGENTS.md §6` 冲突：规范早已要求 app-shell（根 `h-svh overflow-hidden`、`<main>` 为唯一滚动容器、顶栏侧栏不放 sticky），代码走的是 `min-h-svh` + sticky + document 滚动。移动端浏览器工具栏伸缩时 sticky 头部位移的历史 bug 因此仍然存在。
3. 顶栏按钮全部 `icon-sm`(28px) + `size-4` 图标，触控目标偏小；平板档（768–1279）在布局层没有任何差异化处理。

## 决策与取舍

| 议题         | 结论                                                             | 理由                                                                           |
| ------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 二级菜单形态 | 浮层面板盖住内容区                                               | 内容区零抖动；备选「dock 撑开让位」会让画布工具永久少 236px                    |
| 展开触发     | 仅点击，hover 只出 tooltip                                       | 行为可预测；备选「hover 意图延迟自动展开」鼠标路过时会自己动                   |
| 断点策略     | ≥768 左侧图标条，<768 底部 5 键 dock                             | 768px 以上放一列 56px 图标条空间充足；手机没有横向空间                         |
| 手机顶栏     | 完全不渲染，功能并入底部 dock                                    | 手机 dock 已有 5 键，顶部再浮一层会两头挤压内容                                |
| 滚动模型     | 改 app-shell                                                     | 与规范对齐，沉浸工具的高度链终于能打通                                         |
| 偏好字段     | 废弃 `sidebarCollapsed`，`expandedCategories` → `activeCategory` | dock 不占宽度，折叠态失去意义；`activeCategory` 只做刷新后的高亮，不自动弹面板 |
| 视觉         | 新增 `--dock-*` 语义令牌做毛玻璃                                 | `AGENTS.md §6` 禁止在组件里散写 `bg-card/90`                                   |

## 结构

```
BaseLayout（薄装配：TooltipProvider + AppShell + CommandPalette）
└ AppShell
  ├ TopCapsules（absolute z-20，手机不渲染）
  │   ├ BreadcrumbTrail      左上，无背景无描边
  │   └ 操作胶囊组           右上，每颗图标自己是一颗胶囊；平板把外链收进「更多」
  ├ DockRail（absolute z-40，左中）→ CategoryPanel（同层，右侧滑出）→ NavList mode=panel
  ├ MobileDock（absolute z-40，底部）→ Sheet side=bottom → NavList mode=sheet
  ├ BeianCaption（absolute z-30，底边玻璃胶囊；手机进 Sheet）
  └ main[data-app-shell-scroll]（唯一滚动容器）
```

纯逻辑集中在 `app-shell/dock-logic.ts`，只有 `import type`、零运行时依赖，因此可在 node 环境的 Vitest 下直接测（33 个用例）。

## 留白令牌

`--shell-inset-*`（普通页）与 `--shell-immersive-inset-*`（沉浸页）分开定义，组件里不写死数字。

沉浸页单独一档是实测逼出来的：它们原本按「视口 − 56px」设计内部高度，若沿用普通页的
`top 64 + bottom 32`，GIF 编辑器的工作台会少 40px 而顶出一条内部滚动条。改成
`top 3.5rem / bottom 0`（≥768）后与改造前逐像素一致。

## z-index 分配

`auto` 工具内容 · `20` 顶部胶囊 · `30` 备案 · `40` dock 与浮层、工具内 fixed 浮层上限 · `50` Radix portal。
`components/ui/*` 不手改，Sheet 底部抽屉的位移在消费方用内联 `--tw-enter-translate-y` 覆盖。

## 无障碍

- dock 是 `role="toolbar"`，roving tabindex：整条只占一个 Tab 站点，方向键在键位间移动，Home/End 跳两端。
- 分类键用 disclosure 模式（`aria-expanded`），不声明 `aria-haspopup`（面板里是链接不是菜单）。
- Esc 关闭时，只有焦点确实在面板内才把焦点还给触发键，避免抢走用户的正常 Tab 位置。
- 换页收起用「记住开面板时的 pathname」派生，而不是在 effect 里补 setState。

## 已知取舍

- 备案胶囊在滚动时会浮在内容之上（有玻璃底保证可读）。原设计里它在侧栏独占一列，不存在这个冲突；改成悬浮后无法两全。
- 沉浸页的 dock 处理在实现后改过一版：最初是"鼠标静止 300ms 整层变暗"，实际用起来像故障。
  现在改成第一次点内容区就把 dock 折成左下角一颗按钮、点击再展开（`isDockCollapsed`），
  顶部胶囊不跟着收。`use-shell-auto-hide` 与 `shouldHideShell` / `dockOpacity` 已随之删除。
- dock 选中背板最初用 motion 的 `layoutId` 做键位间滑动，实测点击分类会抖（旧背板先投影回原位
  再飞过来），已改为每颗键的静态灰底。
