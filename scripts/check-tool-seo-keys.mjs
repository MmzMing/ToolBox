#!/usr/bin/env node
// 校验每个工具满足 SEO 不变量：目录名 = name = path 去斜杠，且中英 title/description 齐全。
// 缺键时 t() 会把原始键名（如 'bcrypt.title'）渲染进 <title> 与搜索摘要，静默污染收录。
// 可选的 `<name>.seo` 内容层也在这里把关：结构写错或 related 拼错不会报错，只会静默不渲染，
// 而预渲染壳同样跳过——所以必须显式校验。
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

/** 相关工具引用的是全站工具名（= 目录名），先收集全集再校验引用 */
const allToolNames = new Set(
  globSync('src/tools/*/*/index.ts', { cwd: root }).map((file) =>
    path.basename(path.dirname(file)),
  ),
)

const isText = (value) => typeof value === 'string' && value.trim() !== ''

function checkSeo(prefix, seo, problems) {
  if (!isText(seo.intro)) problems.push(`${prefix}: intro 缺失或为空`)
  if (!Array.isArray(seo.steps) || seo.steps.length === 0) {
    problems.push(`${prefix}: steps 缺失或为空数组`)
  } else if (!seo.steps.every(isText)) {
    problems.push(`${prefix}: steps 含空项`)
  }
  if (!Array.isArray(seo.faq) || seo.faq.length === 0) {
    problems.push(`${prefix}: faq 缺失或为空数组`)
  } else if (!seo.faq.every((item) => isText(item?.q) && isText(item?.a))) {
    problems.push(`${prefix}: faq 每项都要有 q 与 a`)
  }
  for (const related of seo.related ?? []) {
    if (!allToolNames.has(related)) {
      problems.push(`${prefix}: related '${related}' 不是任何工具的名字`)
    }
  }
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

  const seoLocales = []
  for (const locale of ['zh', 'en']) {
    const entries = loadBundle(locale, category)
    if (!entries) {
      problems.push(`${category}/${dir}: 语言包 tools-${category}.json (${locale}) 不存在`)
      continue
    }
    const entry = entries[name]
    if (!entry) {
      problems.push(`${category}/${dir}: ${locale} 缺 '${name}' 条目`)
      continue
    }
    for (const field of ['title', 'description']) {
      const value = entry[field]
      if (typeof value !== 'string' || value.trim() === '') {
        problems.push(`${category}/${dir}: ${locale} 的 ${name}.${field} 缺失或为空`)
      }
    }
    if (entry.seo) {
      seoLocales.push(locale)
      checkSeo(`${category}/${dir}: ${locale} seo`, entry.seo, problems)
    }
  }
  // 只写一种语言的内容层会在另一种界面下凭空消失，同时静态壳与页面也会不一致
  if (seoLocales.length === 1) {
    problems.push(`${category}/${dir}: seo 内容层只存在于 ${seoLocales[0]}，缺另一种语言`)
  }
}

if (problems.length > 0) {
  console.log(problems.map((p) => `✘ ${p}`).join('\n'))
  process.exit(1)
}
console.log('OK: 工具路由与双语 SEO 文案齐全')
