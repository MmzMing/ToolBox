#!/usr/bin/env node
// 工具脚手架：生成四件套并提示后续两步手工动作
// 用法: pnpm create:tool -- <category> <tool-name>
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const CATEGORIES = [
  'crypto',
  'converter',
  'web',
  'images',
  'development',
  'network',
  'math',
  'measurement',
  'text',
  'data',
]

const [category, rawName] = process.argv.slice(2)

if (!category || !rawName) {
  console.error('用法: pnpm create:tool -- <category> <tool-name>')
  console.error(`可选分类: ${CATEGORIES.join(', ')}`)
  process.exit(1)
}

if (!CATEGORIES.includes(category)) {
  console.error(`未知分类 "${category}"，可选: ${CATEGORIES.join(', ')}`)
  process.exit(1)
}

const name = rawName
  .toLowerCase()
  .trim()
  .replaceAll(/[^a-z0-9-]+/g, '-')
  .replaceAll(/-+/g, '-')
  .replace(/^-|-$/g, '')

if (!/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error(`无效工具名 "${rawName}"，需为 kebab-case 且以字母开头`)
  process.exit(1)
}

const toPascalCase = (value) =>
  value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')

const componentName = toPascalCase(name)
const toolDir = path.resolve(import.meta.dirname, '../src/tools', category, name)

if (existsSync(toolDir)) {
  console.error(`目录已存在: ${toolDir}`)
  process.exit(1)
}

mkdirSync(toolDir, { recursive: true })

const files = {
  'index.ts': `import { Wrench } from 'lucide-react'
import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: '${name}',
  path: '/${name}',
  keywords: ['todo-keywords'],
  icon: Wrench, // TODO 换成贴切的 lucide 图标
  component: () => import('./${componentName}'),
  createdAt: '${new Date().toISOString().slice(0, 10)}',
})
`,
  [`${name}.service.ts`]: `/** TODO: ${name} 的纯逻辑层 —— 零 DOM/React 依赖，函数命名动词开头 */
`,
  [`${name}.service.test.ts`]: `import { describe, expect, it } from 'vitest'

// import { } from './${name}.service'

// TODO: 覆盖正常路径 + 空输入 + 非法输入（agent.md §10）
describe('TODO ${name} service', () => {
  it('is not implemented yet', () => {
    expect(true).toBe(true)
  })
})
`,
  [`${componentName}.tsx`]: `export default function ${componentName}() {
  // TODO: 实现 UI，复用 components/copyable/* 与 format-transformer
  return <div>TODO: ${componentName}</div>
}
`,
}

for (const [file, content] of Object.entries(files)) {
  writeFileSync(path.join(toolDir, file), content, 'utf8')
}

console.log(`✔ 已生成 ${category}/${name} 四件套`)
console.log(`接下来（两步手工动作）:`)
console.log(
  `  1. 在 src/tools/${category}/index.ts 注册: import { tool as ${name} } from './${name}' 并加入数组`,
)
console.log(
  `  2. 在 src/modules/i18n/locales/{zh,en}/tools-${category}.json 添加 "${name}": { "title", "description" }`,
)
