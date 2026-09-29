// 路由与双语文案的唯一枚举入口。sitemap.xml、llms.txt、预渲染壳必须给出同一批 URL，
// 各自扫一遍源码就会漂移（历史上 sitemap 就少过 4 条）。
import { globSync, readFileSync } from 'node:fs'
import path from 'node:path'

const LOCALE_DIR = 'src/modules/i18n/locales'

const firstMatch = (source, pattern) => source.match(pattern)?.[1]

/**
 * 从源码里取字符串数组字面量的值（单引号为主，兼容双引号）。
 * 分隔符同时接受 `:` 与 `=`：工具定义是 `keywords: [...]`，
 * 而 categories.ts 的 categoryKeys 是常量赋值。
 */
function readStringArray(source, key) {
  const literal = source.match(new RegExp(`${key}\\s*[:=]\\s*\\[([\\s\\S]*?)\\]`))?.[1] ?? ''
  return [...literal.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1])
}

const bundleCache = new Map()

/** 读一个 i18n 命名空间（tools-crypto / categories / home …） */
export function readBundle(root, locale, namespace) {
  const cacheKey = `${locale}/${namespace}`
  if (!bundleCache.has(cacheKey)) {
    const file = path.join(root, LOCALE_DIR, locale, `${namespace}.json`)
    try {
      bundleCache.set(cacheKey, JSON.parse(readFileSync(file, 'utf8')))
    } catch {
      bundleCache.set(cacheKey, null)
    }
  }
  return bundleCache.get(cacheKey)
}

/** 站点域名（与 src/config/site.ts 同源；SITE_URL 只用于预览环境临时覆盖） */
export function readSiteUrl(root) {
  const source = readFileSync(path.join(root, 'src/config/site.ts'), 'utf8')
  const configured = firstMatch(source, /siteUrl:\s*'([^']+)'/)
  if (!configured) {
    throw new Error('Cannot read siteUrl from src/config/site.ts')
  }
  return (process.env.SITE_URL ?? configured).replace(/\/$/, '')
}

/** 品牌名：站点标题与 <title> 后缀都取此值 */
export function readSiteName(root) {
  const source = readFileSync(path.join(root, 'src/config/site.ts'), 'utf8')
  return firstMatch(source, /SITE_NAME = '([^']+)'/) ?? 'ToolBox'
}

/** 分类展示顺序（src/tools/categories.ts 的 categoryKeys 是唯一真相） */
export function readCategoryOrder(root) {
  const source = readFileSync(path.join(root, 'src/tools/categories.ts'), 'utf8')
  const order = readStringArray(source, 'categoryKeys')
  if (order.length === 0) {
    throw new Error('Cannot read categoryKeys from src/tools/categories.ts')
  }
  return order
}

/**
 * 扫描全部工具定义。只用正则取纯数据字段，不 import 业务模块——
 * 脚本环境跑不了 lazy() 与 lucide 图标，且构建期脚本不该依赖应用运行时。
 */
export function collectTools(root) {
  const tools = globSync('src/tools/*/*/index.ts', { cwd: root }).map((file) => {
    const source = readFileSync(path.join(root, file), 'utf8')
    const toolDir = path.dirname(file)
    return {
      category: path.basename(path.dirname(toolDir)),
      dir: path.basename(toolDir),
      name: firstMatch(source, /name:\s*'([^']+)'/),
      // 路由去掉前导斜杠后就是产物目录名（dist/<path>/index.html）
      path: firstMatch(source, /path:\s*'\/([^']+)'/),
      createdAt: firstMatch(source, /createdAt:\s*'(\d{4}-\d{2}-\d{2})'/),
      keywords: readStringArray(source, 'keywords'),
      // 布局形态决定静态壳的容器类名，要与 ToolLayout 渲染出来的一致，否则首屏替换时跳动
      immersive: /immersive:\s*true/.test(source),
      wide: /wide:\s*true/.test(source),
    }
  })
  const missing = tools.filter((tool) => !tool.name || !tool.path)
  if (missing.length > 0) {
    throw new Error(`缺少 name/path 的工具定义: ${missing.map((t) => t.dir).join(', ')}`)
  }
  return tools.sort((a, b) => a.path.localeCompare(b.path))
}

/** 工具的中英 title/description（以及可选的 seo 内容层）；缺键直接抛错，避免把 i18n 原始键名写进 HTML */
export function readToolCopy(root, tool) {
  const namespace = `tools-${tool.category}`
  const copy = {}
  for (const locale of ['zh', 'en']) {
    const entry = readBundle(root, locale, namespace)?.[tool.name]
    const title = entry?.title
    const description = entry?.description
    if (typeof title !== 'string' || typeof description !== 'string') {
      throw new Error(`${namespace}.${tool.name} 缺少 ${locale} 的 title/description`)
    }
    copy[locale] = { title, description, seo: entry.seo }
  }
  return copy
}
