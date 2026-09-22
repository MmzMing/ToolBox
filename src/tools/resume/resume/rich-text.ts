import DOMPurify from 'dompurify'

const HTML_TAG_REGEX = /<\/?[a-z][\s\S]*>/i
const EMPTY_PARAGRAPH_REGEX = /<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi
const HTML_BREAK_REGEX = /<br\s*\/?>/gi
const HTML_ANY_TAG_REGEX = /<\/?[^>]+>/g
const INVISIBLE_WHITESPACE_REGEX = /[\s\u200B-\u200D\uFEFF]/g
const TRAILING_LIST_PARAGRAPH_REGEX = /(<\/(?:ul|ol)>)\s*<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*$/i
const RICH_TEXT_ANCHOR_REGEX = /<a\b([^>]*)>/gi
const CLASS_ATTRIBUTE_REGEX = /\bclass\s*=\s*("([^"]*)"|'([^']*)')/i
const CLASS_ATTRIBUTE_GLOBAL_REGEX = /\bclass\s*=\s*("([^"]*)"|'([^']*)')/gi
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DOMAIN_REGEX =
  /^(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?:[/?#][^\s]*)?$/i
const SAFE_LINK_PROTOCOL_REGEX = /^(https?:|mailto:|tel:)/i
const ANY_PROTOCOL_REGEX = /^[a-z][a-z\d+\-.]*:/i
const LEGACY_RICH_TEXT_CLASSES = new Set(['custom-list', 'custom-list-ordered'])

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const decorateRichTextAnchors = (content: string) =>
  content.replace(RICH_TEXT_ANCHOR_REGEX, (match, attrs: string) => {
    if (CLASS_ATTRIBUTE_REGEX.test(attrs)) {
      return match.replace(
        CLASS_ATTRIBUTE_REGEX,
        (_classMatch, quotedValue, doubleQuoted, singleQuoted) => {
          const currentValue = doubleQuoted ?? singleQuoted ?? quotedValue ?? ''
          const classes = currentValue.split(/\s+/).filter(Boolean)

          if (!classes.includes('rich-text-link')) {
            classes.push('rich-text-link')
          }

          return `class="${classes.join(' ')}"`
        },
      )
    }

    return `<a class="rich-text-link"${attrs}>`
  })

export const stripLegacyRichTextClasses = (content?: string) => {
  if (!content) return ''

  return content.replace(
    CLASS_ATTRIBUTE_GLOBAL_REGEX,
    (_match, quotedValue, doubleQuoted, singleQuoted) => {
      const currentValue = doubleQuoted ?? singleQuoted ?? quotedValue ?? ''
      const classes = currentValue
        .split(/\s+/)
        .filter(Boolean)
        .filter((className: string) => !LEGACY_RICH_TEXT_CLASSES.has(className))

      return classes.length ? `class="${classes.join(' ')}"` : ''
    },
  )
}

export const stripTrailingListParagraph = (content?: string) => {
  if (!content) return ''

  let normalized = content

  while (TRAILING_LIST_PARAGRAPH_REGEX.test(normalized)) {
    normalized = normalized.replace(TRAILING_LIST_PARAGRAPH_REGEX, '$1')
  }

  return normalized
}

export const normalizeLinkHref = (href?: string) => {
  if (!href) return null

  const value = href.trim()
  if (!value) return null

  if (SAFE_LINK_PROTOCOL_REGEX.test(value)) {
    return value
  }

  if (value.startsWith('//')) {
    return `https:${value}`
  }

  if (EMAIL_REGEX.test(value)) {
    return `mailto:${value}`
  }

  if (DOMAIN_REGEX.test(value)) {
    return `https://${value}`
  }

  if (ANY_PROTOCOL_REGEX.test(value)) {
    return null
  }

  return null
}

/**
 * 富文本正文允许的标签与属性，与 RichEditor 里挂载的 Tiptap 扩展一一对应：
 * StarterKit(段落/标题/列表/引用/粗斜删/代码/换行) + TextAlign + Color/Highlight + Link。
 * 白名单之外的标签（img、script、iframe、svg…）整体丢弃，不做"只删 script"式的黑名单。
 */
const RICH_TEXT_ALLOWED_TAGS = [
  'p',
  'br',
  'hr',
  'div',
  'span',
  'h1',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'blockquote',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'del',
  'mark',
  'code',
  'pre',
  'a',
]

const RICH_TEXT_ALLOWED_ATTR = ['href', 'target', 'rel', 'style', 'class', 'data-color']

const RICH_TEXT_SANITIZE_CONFIG = {
  ALLOWED_TAGS: RICH_TEXT_ALLOWED_TAGS,
  ALLOWED_ATTR: RICH_TEXT_ALLOWED_ATTR,
}

DOMPurify.addHook('afterSanitizeAttributes', (currentNode: Element) => {
  if (currentNode.nodeName !== 'A') {
    return
  }

  const safeHref = normalizeLinkHref(currentNode.getAttribute('href') ?? undefined)
  if (!safeHref) {
    currentNode.removeAttribute('href')
    // 链接样式类要一起摘掉：留着下划线会让人以为还能点
    currentNode.classList.remove('rich-text-link')
    return
  }

  currentNode.setAttribute('href', safeHref)
  if (!/^(mailto:|tel:)/i.test(safeHref)) {
    currentNode.setAttribute('rel', 'noopener noreferrer')
  }
})

/**
 * 富文本渲染前的最后一道消毒：简历正文来自四个不可信入口（导入 JSON、同步目录落盘、
 * 旧项目 localStorage 迁移、AI 返回内容），未消毒直接进 dangerouslySetInnerHTML 即存储型 XSS。
 *
 * 无 DOM 的环境（Node 脚本）里 DOMPurify 跑不起来，此时选择整段转义而不是放行：
 * 宁可显示成字面标签，也不能让兜底路径变成 fail-open。
 */
export const sanitizeRichTextHtml = (content: string) => {
  if (!DOMPurify.isSupported) {
    return escapeHtml(content)
  }

  return DOMPurify.sanitize(content, RICH_TEXT_SANITIZE_CONFIG)
}

/**
 * 规范化富文本内容，解决以下问题：
 * 1. 纯文本中的换行无法在 HTML 中展示；
 * 2. TipTap 产生的空 <p> 标签没有高度；
 * 3. 非本编辑器产出的 HTML 可能带脚本，统一消毒后才交给 dangerouslySetInnerHTML。
 */
export const normalizeRichTextContent = (content?: string) => {
  if (!content) return ''

  let normalized = content

  if (!HTML_TAG_REGEX.test(content)) {
    normalized = escapeHtml(content).replace(/\r\n|\r|\n/g, '<br />')
  }

  normalized = decorateRichTextAnchors(
    stripTrailingListParagraph(stripLegacyRichTextClasses(normalized)),
  ).replace(EMPTY_PARAGRAPH_REGEX, '<p><br /></p>')

  return sanitizeRichTextHtml(normalized)
}

export const hasMeaningfulRichTextContent = (content?: string) => {
  if (!content) return false

  if (!HTML_TAG_REGEX.test(content)) {
    return content.replace(INVISIBLE_WHITESPACE_REGEX, '').length > 0
  }

  const plainText = content
    .replace(EMPTY_PARAGRAPH_REGEX, '')
    .replace(HTML_BREAK_REGEX, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(HTML_ANY_TAG_REGEX, '')
    .replace(INVISIBLE_WHITESPACE_REGEX, '')

  return plainText.length > 0
}
