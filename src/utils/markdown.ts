import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/common'
import { Marked, type TokenizerAndRendererExtension, type Tokens } from 'marked'

import { escapeHtml } from './html'

/** 预览里由 MarkdownEditor 二次渲染的占位类名（mermaid 图与数学公式） */
export const MERMAID_CLASS = 'md-mermaid'
export const MATH_CLASS = 'md-math'
export const MATH_BLOCK_CLASS = 'md-math-block'
/** 块级公式与图表外层卡片（带标题栏，样式见工具的 preview.css） */
export const CARD_CLASS = 'md-card'
export const CARD_HEAD_CLASS = 'md-card-head'
export const CARD_TITLE_CLASS = 'md-card-title'
export const CARD_BODY_CLASS = 'md-card-body'

/** ` ```mermaid ` 围栏的 lang 标记 */
export const MERMAID_LANG = 'mermaid'
/** ` ```math ` 围栏等价于 `$$…$$` */
export const MATH_LANG = 'math'

export interface MarkdownHeading {
  readonly id: string
  readonly text: string
  readonly depth: number
  /** 该标题在源码中的行号（1 起），同步滚动与大纲跳转靠它定位 */
  readonly line: number
}

export interface MarkdownRenderResult {
  readonly html: string
  readonly headings: readonly MarkdownHeading[]
  /** 出现 ```mermaid 围栏：预览侧据此决定是否懒加载 mermaid */
  readonly needsMermaid: boolean
  /** 出现 $…$ / $$…$$ / ```math：预览侧据此决定是否懒加载 katex */
  readonly needsMath: boolean
}

interface MathToken {
  readonly type: string
  readonly raw: string
  readonly text: string
}

const countNewlines = (value: string): number => {
  let total = 0
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) === 10) {
      total += 1
    }
  }
  return total
}

/** 行内标记去噪：`## **加粗** 标题` 的锚点 id 应该是「加粗-标题」而不是带星号 */
export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/~~/g, '')
    .replace(/[*_]/g, '')
}

/** GitHub 风格锚点：小写、丢标点、空白转 `-`，保留 CJK 与字母数字 */
export function slugifyHeading(text: string): string {
  const slug = stripInlineMarkdown(text)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s+/g, '-')
    .slice(0, 64)
  return slug || 'section'
}

/** 同一份文档里重名标题追加 -1/-2 后缀，保证 id 唯一 */
export function createSlugCounter(): (text: string) => string {
  const seen = new Map<string, number>()
  return (text: string): string => {
    const base = slugifyHeading(text)
    const used = seen.get(base)
    if (used === undefined) {
      seen.set(base, 0)
      return base
    }
    seen.set(base, used + 1)
    return `${base}-${used + 1}`
  }
}

const BLOCK_MATH_RE = /^\$\$([\s\S]+?)\$\$(?:\n|$)/
// 定界符内侧必须非空白，且不含裸 $：否则中文正文里的「价格 $5 和 $10」会被吞成公式
const INLINE_MATH_RE = /^\$([^\s$](?:[^$]*[^\s$])?)\$/

/**
 * 公式占位：TeX 源码直接写在节点文本里当降级显示，渲染侧再读 textContent 取回。
 *
 * 刻意不用 `data-md-tex` 属性传值——DOMPurify 会因为属性值里的 `>` 整个丢弃该属性，
 * 而 `a > b` 这类公式太常见了，文本节点没有这个问题。
 */
function mathPlaceholder(tex: string, block: boolean, label: string): string {
  const span = `<span class="${MATH_CLASS}${block ? ` ${MATH_BLOCK_CLASS}` : ''}">${escapeHtml(tex)}</span>`
  // 块级公式套带标题栏的卡片；标题文字由调用方从 i18n 传入，导出物里也是真文本
  return block ? card(label, span) : span
}

/** 带标题栏的卡片壳 */
function card(title: string, body: string): string {
  return `<div class="${CARD_CLASS}"><div class="${CARD_HEAD_CLASS}"><span class="${CARD_TITLE_CLASS}">${escapeHtml(title)}</span></div><div class="${CARD_BODY_CLASS}">${body}</div></div>`
}

/** 公式扩展在渲染时回写标记，预览侧据此决定要不要拉 katex */
function buildMathExtensions(markUsed: () => void, label: string): TokenizerAndRendererExtension[] {
  const render = (token: Tokens.Generic, block: boolean) => {
    markUsed()
    return mathPlaceholder((token as unknown as MathToken).text, block, label)
  }
  return [
    {
      name: 'blockMath',
      level: 'block',
      start: (src) => (src.startsWith('$$') ? 0 : undefined),
      tokenizer: (src) => {
        const match = BLOCK_MATH_RE.exec(src)
        if (!match) {
          return undefined
        }
        return { type: 'blockMath', raw: match[0], text: match[1].trim() }
      },
      renderer: (token) => render(token, true),
    },
    {
      name: 'inlineMath',
      level: 'inline',
      start: (src) => {
        const index = src.indexOf('$')
        return index < 0 ? undefined : index
      },
      tokenizer: (src) => {
        const match = INLINE_MATH_RE.exec(src)
        if (!match) {
          return undefined
        }
        return { type: 'inlineMath', raw: match[0], text: match[1] }
      },
      renderer: (token) => render(token, false),
    },
  ]
}

function highlightCode(code: string, lang: string): string {
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    }
    return hljs.highlightAuto(code).value
  } catch {
    return escapeHtml(code)
  }
}

/** 卡片标题等用户可见文案由调用方注入，util 不碰 i18n */
export type MarkdownRenderOptions = {
  breaks?: boolean
  labels?: {
    readonly math: string
    readonly diagram: string
  }
}

const DEFAULT_LABELS = { math: 'LaTeX', diagram: 'Mermaid' } as const

/**
 * Markdown 源码 → HTML 字符串 + 大纲 + 懒加载标记。
 *
 * 顶层 token 的 `raw` 拼起来等于原源码，所以累加换行数就能推出每个块的起始行；
 * marked v18 的 token 不带位置信息，这是唯一不需要二次解析的取行号办法。
 * 产物**未净化**，进 DOM 前必须过 `sanitizeMarkdownHtml`。
 */
export function renderMarkdown(
  source: string,
  options: MarkdownRenderOptions = {},
): MarkdownRenderResult {
  const { breaks = false, labels = DEFAULT_LABELS } = options
  const headings: MarkdownHeading[] = []
  const nextSlug = createSlugCounter()
  const state = { needsMermaid: false, needsMath: false }

  const marked = new Marked({ gfm: true, breaks, pedantic: false })
  marked.use({
    extensions: buildMathExtensions(() => {
      state.needsMath = true
    }, labels.math),
    renderer: {
      heading(token) {
        const inner = this.parser.parseInline(token.tokens)
        const id = nextSlug(token.text ?? '')
        const line = (token as unknown as { startLine?: number }).startLine ?? 1
        headings.push({ id, text: stripInlineMarkdown(token.text ?? ''), depth: token.depth, line })
        return `<h${token.depth} id="${id}" data-line="${line}">${inner}</h${token.depth}>`
      },
      code(token) {
        const lang = (token.lang ?? '').trim().toLowerCase()
        if (lang === MERMAID_LANG) {
          state.needsMermaid = true
          // 源码留在 <pre> 里：既是图表渲染的输入，也是 mermaid 关闭/失败时的可读降级
          return card(
            labels.diagram,
            `<div class="${MERMAID_CLASS}"><pre><code>${escapeHtml(token.text)}</code></pre></div>`,
          )
        }
        if (lang === MATH_LANG) {
          state.needsMath = true
          return mathPlaceholder(token.text.trim(), true, labels.math)
        }
        return `<pre${lang ? ` data-language="${escapeHtml(lang)}"` : ''}><code class="hljs${lang ? ` language-${escapeHtml(lang)}` : ''}">${highlightCode(token.text, lang)}</code></pre>`
      },
      link(token) {
        const inner = this.parser.parseInline(token.tokens)
        const href = token.href ?? ''
        // 协议闸门在净化环节，这里只补外链属性
        const external = /^https?:\/\//i.test(href)
        const title = token.title ? ` title="${escapeHtml(token.title)}"` : ''
        const target = external ? ' target="_blank" rel="noopener noreferrer"' : ''
        return `<a href="${escapeHtml(href)}"${target}${title}>${inner}</a>`
      },
    },
  })

  const tokens = marked.lexer(source)
  let line = 1
  for (const token of tokens) {
    ;(token as unknown as { startLine?: number }).startLine = line
    line += countNewlines(token.raw)
  }

  const html = marked.parser(tokens)
  return { html, headings, needsMermaid: state.needsMermaid, needsMath: state.needsMath }
}

/**
 * Markdown 产物的净化配置：只放 HTML 档标签集（表格、图片、input 都在内），
 * 不放 MathML/SVG —— katex 与 mermaid 的 DOM 是渲染后注入的，不经过这里。
 *
 * 刻意不调 `DOMPurify.addHook`：hook 是全局的，在本工具注册会连带影响
 * 简历工具的 `sanitizeRichTextHtml`。链接的 target/rel 改在 renderer 里补。
 */
const MARKDOWN_SANITIZE_CONFIG = {
  USE_PROFILES: { html: true },
  ALLOW_DATA_ATTR: true,
  ADD_ATTR: ['target', 'align', 'checked', 'disabled', 'start', 'colspan', 'rowspan'],
}

/**
 * 未净化 HTML → 可安全进 innerHTML 的 HTML。
 *
 * 无 DOM 的环境（Node 脚本、SSR 兜底）里 DOMPurify 跑不起来，此时选择整段转义而不是
 * 放行：宁可显示成字面标签，也不能让兜底路径变成 fail-open。
 */
export function sanitizeMarkdownHtml(html: string): string {
  if (!DOMPurify.isSupported) {
    return escapeHtml(html)
  }
  return DOMPurify.sanitize(html, MARKDOWN_SANITIZE_CONFIG)
}

/** mermaid 产出的 SVG 单独过一道 svg 档净化，不与 HTML 档白名单混用 */
export function sanitizeSvg(svg: string): string {
  if (!DOMPurify.isSupported) {
    return escapeHtml(svg)
  }
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_ATTR: ['style', 'class', 'preserveAspectRatio', 'viewBox'],
  })
}

export type { Tokens }
