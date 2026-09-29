#!/usr/bin/env node
// 生成 llms.txt 与 llms-full.txt 到 public/（prebuild 执行，理由同 generate-sitemap：
// Vite 在 build 开始时就整体拷贝 public/，构建后再写赶不上当次产物）。
//
// llms.txt 是 AI 引擎的站点索引入口（GEO 侧的 robots.txt）：不执行 JS 的抓取器
// 在这里一次拿到全站工具清单与规范 URL；正文细节放 llms-full.txt。
import { writeFileSync } from 'node:fs'
import path from 'node:path'

import {
  collectTools,
  readBundle,
  readCategoryOrder,
  readSiteName,
  readSiteUrl,
  readToolCopy,
} from './lib/site-routes.mjs'

const root = path.resolve(import.meta.dirname, '..')
const siteUrl = readSiteUrl(root)
const siteName = readSiteName(root)

/** 单行化并转义方括号：文案里出现 [ ] 会破坏 llms.txt 的链接语法 */
const oneLine = (value) =>
  value.replace(/\s+/g, ' ').trim().replaceAll('[', '(').replaceAll(']', ')')

const tools = collectTools(root).map((tool) => ({ ...tool, copy: readToolCopy(root, tool) }))
const categoryOrder = readCategoryOrder(root)
const categoryNames = {
  zh: readBundle(root, 'zh', 'categories') ?? {},
  en: readBundle(root, 'en', 'categories') ?? {},
}

/** 分类顺序跟站侧栏一致；未登记的分类排在末尾而不是被静默丢掉 */
const orderedCategories = [
  ...categoryOrder,
  ...new Set(tools.map((tool) => tool.category).filter((key) => !categoryOrder.includes(key))),
]

const sections = orderedCategories.map((category) => {
  const ofCategory = tools.filter((tool) => tool.category === category)
  if (ofCategory.length === 0) return ''
  const heading =
    `${categoryNames.zh[category] ?? category} ${categoryNames.en[category] ?? ''}`.trim()
  const lines = ofCategory.map(
    (tool) =>
      `- [${oneLine(tool.copy.zh.title)}](${siteUrl}/${tool.path}): ${oneLine(tool.copy.zh.description)}`,
  )
  return `## ${heading}\n\n${lines.join('\n')}`
})

const facts = [
  `- 计算位置：全部在用户浏览器本地完成，本站服务器不接收、不存储用户输入。`,
  `- 费用：完全免费、开源（MIT），无账号、无付费墙、无使用次数限制。`,
  `- 语言：中文（zh-CN）与英文双语界面，在页面内切换，共用同一 URL。`,
  `- 工具总数：${tools.length} 个。`,
  `- 页面 head 内含 schema.org WebApplication 与 BreadcrumbList 结构化数据，可直接抽取。`,
].join('\n')

const llms = `# ${siteName}

> 免费开源的在线工具箱：${tools.length} 个开发者与日常实用工具，全部在浏览器本地运行，不收集、不上传任何用户数据。

## Key Facts / 关键事实

${facts}

## Links / 站内入口

- [全部工具](${siteUrl}/): 按分类浏览所有工具
- [关于本站](${siteUrl}/about): 项目定位、隐私说明与技术栈
- [工具清单详版](${siteUrl}/llms-full.txt): 每个工具的中英文名称、说明、搜索关键词与上架日期

${sections.join('\n\n')}
`

const detailSections = orderedCategories.map((category) => {
  const ofCategory = tools.filter((tool) => tool.category === category)
  if (ofCategory.length === 0) return ''
  const heading = `${categoryNames.zh[category] ?? category} / ${categoryNames.en[category] ?? category}`
  const blocks = ofCategory.map((tool) =>
    [
      `### ${oneLine(tool.copy.zh.title)}${
        tool.copy.en.title === tool.copy.zh.title ? '' : ` / ${oneLine(tool.copy.en.title)}`
      }`,
      `URL: ${siteUrl}/${tool.path}`,
      `说明: ${oneLine(tool.copy.zh.description)}`,
      `Description: ${oneLine(tool.copy.en.description)}`,
      `关键词: ${tool.keywords.join(', ')}`,
      `上架: ${tool.createdAt ?? '未知'}`,
    ].join('\n'),
  )
  return `## ${heading}\n\n${blocks.join('\n\n')}`
})

const llmsFull = `# ${siteName} - 工具全量清单 / Full Tool Index

站点: ${siteUrl}/
开源仓库: https://github.com/MmzMing/ToolBox
工具总数: ${tools.length}

以下每个条目对应一个可直接访问的页面，页面内即可完整使用该工具，无需注册或安装。

${detailSections.join('\n\n')}
`

writeFileSync(path.join(root, 'public/llms.txt'), llms, 'utf8')
writeFileSync(path.join(root, 'public/llms-full.txt'), llmsFull, 'utf8')
console.log(`✔ llms.txt / llms-full.txt: ${tools.length} 个工具，${sections.length} 个分类`)
