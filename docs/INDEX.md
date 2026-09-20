# ToolBox 文档索引

> 本目录是 ToolBox 项目的全部文档归档。代码规范见根目录 [AGENTS.md](../AGENTS.md)。

## 目录结构

```
docs/
├── INDEX.md            # 本文件：文档总索引
├── design/             # 设计文档
│   ├── 技术栈文档.md    # 选型、版本、依赖清单、质量门禁
│   ├── 详细设计文档.md  # 架构、注册表机制、布局、状态、搜索、i18n、SEO
│   └── 功能介绍文档.md  # 站点功能 + 50 个工具清单
├── development/        # 开发过程文档
│   └── 开发计划.md      # 阶段拆分、批次安排、进度看板
├── plans/              # 单次功能的设计稿（按日期命名，实现前先评审）
│   ├── 2026-09-19-github-accelerator-design.md
│   ├── 2026-09-19-resume-builder-design.md
│   └── 2026-09-20-resume-dock-workbench-design.md
└── deployment/         # 部署文档
    └── 部署方案.md      # Vercel/Netlify/Cloudflare Pages/Docker+Nginx
```

## 阅读路径

- **新人上手**：根目录 [AGENTS.md](../AGENTS.md) → `design/技术栈文档.md` → `design/详细设计文档.md`
- **新增一个工具**：`AGENTS.md` §7（工具开发 SOP）→ `design/详细设计文档.md` §2 → 样板 `src/tools/crypto/hash-text/`
- **部署上线**：`deployment/部署方案.md`（含发布检查清单）
- **查工具**：`design/功能介绍文档.md`（全 50 个工具一览）

## 参考项目

- [it-tools](https://github.com/CorentinTh/it-tools)（MIT）：工具集合与功能的参考来源
- Pic Smaller：部署加固（Dockerfile）与 i18n 工程实践参考
