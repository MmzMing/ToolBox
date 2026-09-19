# ToolBox — 开发者在线工具箱

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

基于 **React 19 + Vite 8 + TypeScript + shadcn/ui + Tailwind CSS v4** 的开源开发者工具站，
复刻 [it-tools](https://github.com/CorentinTh/it-tools) 全部 86 个工具（持续整合中：同类工具合并为单页、删除低频工具），全部纯前端本地运行，数据不上传。

## 快速开始

```bash
pnpm install
pnpm dev        # 开发
pnpm test       # 单元测试（Vitest）
pnpm lint       # ESLint
pnpm build      # 构建产物 + 生成 sitemap.xml
```

## 文档

- [docs/INDEX.md](docs/INDEX.md) — 文档总索引
- [AGENTS.md](AGENTS.md) — 代码规范（AI 与人的共同守则）

## 技术栈

React 19 · Vite 8 · TypeScript 5 · Tailwind CSS v4 · shadcn/ui · react-router v8 ·
zustand · i18next（中英双语）· fuse.js（模糊搜索）· Vitest
