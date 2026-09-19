import { marked } from 'marked'

/** Markdown → HTML（GFM，breaks 关闭）；同步模式返回 string */
export function markdownToHtml(input: string): string {
  if (input.trim() === '') {
    return ''
  }

  return marked.parse(input, { async: false, gfm: true, breaks: false }) as string
}
