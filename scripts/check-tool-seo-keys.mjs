#!/usr/bin/env node
// 校验每个工具满足 SEO 不变量：目录名 = name = path 去斜杠，且中英 title/description 齐全。
// 缺键时 t() 会把原始键名（如 'bcrypt.title'）渲染进 <title> 与搜索摘要，静默污染收录。
import { globSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const localesDir = path.join(root, 'src/modules/i18n/locales')

const bundleCache = new Map()
function loadBundle(locale, category) {
  const key = `${locale}/${category}`
  if (!bundleCache.has(key)) {
    const file = path.join(localesDir, locale, `tools-${category}.json`)
    try {
      bundleCache.set(key, JSON.parse(readFileSync(file, 'utf8')))
    } catch {
      bundleCache.set(key, null)
    }
  }
  return bundleCache.get(key)
}

const problems = []

for (const file of globSync('src/tools/*/*/index.ts', { cwd: root })) {
  const source = readFileSync(path.join(root, file), 'utf8')
  const toolDir = path.dirname(file)
  const dir = path.basename(toolDir)
  const category = path.basename(path.dirname(toolDir))
  const name = source.match(/name:\s*'([^']+)'/)?.[1]
  const routePath = source.match(/path:\s*'\/([^']+)'/)?.[1]

  if (!name) problems.push(`${category}/${dir}: 缺少 name`)
  if (!routePath) problems.push(`${category}/${dir}: 缺少 path`)
  if (name && name !== dir) problems.push(`${category}/${dir}: name '${name}' ≠ 目录名`)
  if (routePath && routePath !== dir)
    problems.push(`${category}/${dir}: path '/${routePath}' ≠ 目录名`)
  if (!name || !routePath) continue

  for (const locale of ['zh', 'en']) {
    const entries = loadBundle(locale, category)
    if (!entries) {
      problems.push(`${category}/${dir}: 语言包 tools-${category}.json (${locale}) 不存在`)
      continue
    }
    const entry = entries[name]
    if (!entry) problems.push(`${category}/${dir}: ${locale} 缺 '${name}' 条目`)
    else {
      for (const field of ['title', 'description']) {
        const value = entry[field]
        if (typeof value !== 'string' || value.trim() === '') {
          problems.push(`${category}/${dir}: ${locale} 的 ${name}.${field} 缺失或为空`)
        }
      }
    }
  }
}

if (problems.length > 0) {
  console.log(problems.map((p) => `✘ ${p}`).join('\n'))
  process.exit(1)
}
console.log('OK: 工具路由与双语 SEO 文案齐全')
