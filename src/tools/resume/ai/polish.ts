import TurndownService from 'turndown'
import { Marked } from 'marked'

import { normalizeLinkHref, sanitizeRichTextHtml } from '../resume/rich-text'
import { polishSystemPrompt } from './prompts'
import { requestAIStream, requestAIText } from './transport'
import type { AIConnection } from './providers'

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const styleValue = (node: HTMLElement, property: string) => {
  const style = node.getAttribute('style')
  if (!style) {
    return null
  }
  const match = new RegExp(`${property}\\s*:\\s*([^;]+)`, 'i').exec(style)
  return match?.[1]?.trim() || null
}

const ALIGNED_BLOCK_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const

const turndownService = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' })

// Tiptap 的 Color / Highlight / Underline / TextAlign 都落在 inline style 上，
// turndown 默认规则会把带 style 的 span 与 mark 直接丢掉，转一圈样式就没了。
turndownService.addRule('resumeColor', {
  filter: (node) => node.nodeName === 'SPAN' && Boolean(styleValue(node, 'color')),
  replacement: (content, node) =>
    `<span style="color: ${styleValue(node as HTMLElement, 'color')}">${content}</span>`,
})

turndownService.addRule('resumeHighlight', {
  filter: (node) => node.nodeName === 'MARK',
  replacement: (content, node) => {
    const element = node as HTMLElement
    const color = element.getAttribute('data-color') || styleValue(element, 'background-color')
    return color
      ? `<mark data-color="${color}" style="background-color: ${color}">${content}</mark>`
      : `<mark>${content}</mark>`
  },
})

turndownService.addRule('resumeUnderline', {
  filter: ['u'],
  replacement: (content) => `<u>${content}</u>`,
})

// 带对齐的段落与标题整块以 HTML 原样保留：把已转好的 Markdown 塞进 HTML 块里，
// marked 会当它是原样 HTML 而不再解析，粗体列表就会变成字面量。
turndownService.addRule('resumeAlignedBlock', {
  filter: (node) =>
    (ALIGNED_BLOCK_TAGS as readonly string[]).includes(node.nodeName.toLowerCase()) &&
    Boolean(styleValue(node, 'text-align')),
  replacement: (_content, node) => {
    const element = node as HTMLElement
    return `\n\n<${element.tagName.toLowerCase()} style="text-align: ${styleValue(
      element,
      'text-align',
    )}">${element.innerHTML}</${element.tagName.toLowerCase()}>\n\n`
  },
})

/** 富文本 → Markdown：颜色、高亮、下划线、对齐都保留 */
export function htmlToMarkdown(html: string): string {
  if (!html.trim()) {
    return ''
  }
  return turndownService.turndown(html).trim()
}

/**
 * Markdown → 富文本：样式子集（颜色/高亮/对齐）要还原，所以不能整段转义；
 * 但模型输出不可信，白名单之外的标签与 javascript: 链接必须在此就地剔除，
 * 否则会带着脏 HTML 进 store（预览渲染的是 store 里的原值，不经过 Tiptap）。
 */
const editorMarked = new Marked({ breaks: true, gfm: true })

export function markdownToEditorHtml(markdown: string): string {
  return sanitizeRichTextHtml(editorMarked.parse(markdown, { async: false }))
}

/**
 * Markdown → 用于弹窗预览的 HTML。
 *
 * 预览面板只是给人看，不需要还原样式，所以把模型输出的原始 HTML 全部转义、
 * 链接协议收紧到白名单：模型若吐 `<img onerror=...>` 或 `javascript:` 链接也不会被执行。
 */
const previewMarked = new Marked({ breaks: true, gfm: true })

previewMarked.use({
  renderer: {
    html: ({ text }) => escapeHtml(text),
    link: ({ href, title, text }) => {
      const safeHref = normalizeLinkHref(href ?? undefined)
      const label = previewMarked.parseInline(text, { async: false }) as string
      if (!safeHref) {
        return label
      }
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer"${
        title ? ` title="${escapeHtml(title)}"` : ''
      }>${label}</a>`
    },
  },
})

export function markdownToPreviewHtml(markdown: string): string {
  return previewMarked.parse(markdown, { async: false })
}

export type PolishRequest = {
  connection: AIConnection
  markdown: string
  customInstructions?: string
  signal: AbortSignal
}

/** 流式润色：每次产出一段增量 Markdown */
export function runPolishStream({
  connection,
  markdown,
  customInstructions,
  signal,
}: PolishRequest): AsyncGenerator<string> {
  return requestAIStream(
    connection,
    { system: polishSystemPrompt(customInstructions), text: markdown, stream: true },
    signal,
  )
}

/** 非流式润色，供测试与降级路径使用 */
export function runPolish({ connection, markdown, customInstructions, signal }: PolishRequest) {
  return requestAIText(
    connection,
    { system: polishSystemPrompt(customInstructions), text: markdown },
    signal,
  )
}
