# 简历编辑器 dock 化改造设计

日期：2026-09-20 · 状态：已批准 · 分类：简历 · 路由：`/resume/:id`

上游：`2026-09-19-resume-builder-design.md` §3「编辑器外壳」按旧项目做成三栏工作台，本文档把桌面端改为两栏 + dock 浮层。旧文档中「设置 / 表单 / A4 预览」三栏的描述就此作废，其余章节仍然有效。

## 1. 目标

- 桌面端（`>=768px`）编辑器由三栏改为两栏：编辑栏 + 预览栏，左侧设置栏整条移除。
- 左栏的 5 组设置改为右侧 dock 的 5 个键位，点击弹出锚定在 dock 左侧的 Popover 浮层。
- dock 新增一段用 `DockDivider` 隔开的「布局排版」分组，与既有的视图、输出、栏位分组并列。
- 预览区拿到更大宽度，调整字号、行高、间距时预览实时可见。

## 2. 非目标

| 项                         | 边界                                                         |
| -------------------------- | ------------------------------------------------------------ |
| 移动端（`<768px`）工作台   | 一行不动。底部三 tab 与「样式」tab 继续用 `SidePanel`        |
| 新增设置项                 | 本次只搬运既有的 5 组，不扩项、不改默认值                    |
| 预览缩放档位               | 不改 `PreviewPanel` 的 `md:scale-90`。栏宽变大后是否提档另议 |
| 模板、导出、自动一页纸逻辑 | 不动                                                         |

## 3. 决策记录

| 决策点         | 结论                                            | 理由                                                             |
| -------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| 左栏去留       | 彻底移除，不做「保留但默认收起」                | 保留一栏就等于保留挤压预览的根因                                 |
| 章节布局去向   | 进 dock 浮层                                    | 用户拍板。代价：拖拽排序发生在浮层内，手感弱于整列，需实测       |
| 浮层形态       | Popover 锚定 dock 按钮，`side="left"`           | Sheet 会整块盖住预览，调排版看不到效果——这是排版设置的核心诉求   |
| dock 分组方式  | 加分隔线的独立分组，不做二级 dock、不做模式切换 | 每项一键直达，层级最浅                                           |
| 移动端控件复用 | 不复用，`SidePanel` 原样留给移动端              | 用户拍板。代价：5 组控件桌面与移动各一份实现，加设置项要改两处   |
| 浮层并发       | 同一时刻只开一个，`PreviewDock` 持 `openKey`    | 两个浮层叠在预览上会互相遮挡，且无法判断哪个是当前编辑目标       |
| 章节项点击语义 | 点条目切章节并关浮层；拖拽/隐藏/删除不关        | 切章节的目的是回中栏编辑；排序与显隐是连续操作，逐次关浮层会打断 |

## 4. dock 键位

自上而下四段，共 13 键（原 10 键 −「收起设置栏」+ 新增 5 键）。

| 段       | 键         | 图标                | 行为                                            |
| -------- | ---------- | ------------------- | ----------------------------------------------- |
| 布局排版 | 章节布局   | `LayoutList`        | 浮层：拖拽排序 / 显隐 / 删除 + 底部「添加章节」 |
|          | 主题色     | `Palette`           | 浮层：12 预设圆点 + 自定义取色器                |
|          | 排版       | `Type`              | 浮层：字体、行高、正文 / 章节 / 小标题字号      |
|          | 间距       | `Rows3`             | 浮层：页边距、章节间距、段间距                  |
|          | 显示模式   | `SlidersHorizontal` | 浮层：联系方式用图标 / 副标题居中 / 弹性表头    |
| 视图     | 切换模板   | （`TemplateSheet`） | 不变                                            |
|          | 自动一页纸 | `FileText`          | 不变                                            |
|          | 分页参考线 | `Eye` / `EyeOff`    | 不变                                            |
| 输出     | 导出       | （`ExportDialog`）  | 不变                                            |
|          | 复制简历   | `Copy`              | 不变                                            |
| 栏位     | 收起编辑栏 | `Pencil`            | 不变                                            |
|          | 收起预览   | `Eye`               | 不变                                            |
|          | 返回首页   | `Home`              | 不变                                            |

「收起设置栏」键与 `side` 面板一并删除。`FaqDialog` 仍在 dock 下方。

13 键 × 28px + 间距约 500px 高，768px 高的笔记本会顶出视口，dock 容器加
`max-h-[calc(100svh-7rem)]` 与纵向滚动兜底。

## 5. 组件与落位

```
src/tools/resume/resume/components/
├── PreviewDock.tsx                 # 扩成 4 段 13 键，持 openKey 受控各浮层
├── SidePanel.tsx                   # 保留，仅 MobileWorkbench 引用，文件头标注归属
└── dock-panels/
    ├── SectionsPanel.tsx           # 复用 layout/LayoutSetting
    ├── ThemePanel.tsx
    ├── TypographyPanel.tsx
    ├── SpacingPanel.tsx
    └── ModePanel.tsx
```

浮层统一 `side="left" align="end" sideOffset={10} className="w-80"`。

`layout/LayoutSetting.tsx` 与 `layout/LayoutItem.tsx` 增加可选 `onSectionSelect`
回调：dock 浮层传入以在选中后关闭浮层，`SidePanel` 不传，移动端行为不变。

## 6. 常量与状态

| 位置                                         | 改动                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| `constants.ts` `LAYOUT_CONFIG`               | 删 `sidePanel`；`editPanel 38/28`、`previewPanel 62/40`（预览取最大）    |
| `constants.ts` `SIDEBAR_AUTO_COLLAPSE_BELOW` | 删除，连同编辑器页里那段自动折叠 effect                                  |
| `PreviewDock.tsx` `PanelKey`                 | `'side' \| 'edit' \| 'preview'` → `'edit' \| 'preview'`                  |
| `resume-editor-page.tsx`                     | 移除 `SidePanel` 的 `ResizablePanel` 与对应 handle，`collapsed` 少一个键 |

设置项写入路径不变：全部走 `useResumeStore.updateGlobalSettings` 与
`updateMenuSections` / `reorderSections` / `toggleSectionVisibility`。主题色沿用
100ms 防抖，避免取色器每动一像素入一条撤销记录。

## 7. i18n

新增 `resume.dock.{sections,theme,typography,spacing,mode}` 五个键，中英文齐全。
浮层内部文案复用既有 `resume.sidePanel.<group>.*`，不新造。
删除随左栏一起失效的 `resume.dock.{collapseSide,expandSide}`。

## 8. 验收

- `pnpm lint && pnpm typecheck && pnpm test` 全绿。本次无新增纯逻辑，不加单测。
- 断点矩阵：1440 / 1280 / 1024 / 768 四档 × (开浮层 / 拖拽排序 / 拖滑块 / 收起两栏 / 导出 PDF)。
- dock 不溢出视口；13 键在 768 高视口下可滚动触达。
- 浮层互斥：开第二个浮层时第一个自动关闭。
- 章节浮层内 `Reorder` 拖拽可用。Radix Popover 的指针捕获与 motion 拖拽若冲突，
  退路是浮层内改用上下方向键微调顺序 + 保留拖拽双通道。
- 导出回归：预览栏仍然「只折叠不卸载」，`#resume-preview` 常驻可被 html2canvas 抓到。
- 移动端逐项目视：底部三 tab、样式 tab 内容、章节切换条均与改动前一致。
