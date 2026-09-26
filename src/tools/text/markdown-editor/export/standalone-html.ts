import previewCss from '../preview.css?inline'
import { escapeHtml } from '@/utils/html'

/**
 * 导出物的补充样式。排版主体来自 preview.css（同一份源码，`var(--令牌, 十六进制)`
 * 在没有 :root 令牌的独立文件里自动落到字面量色值），这里只补三件事：
 * 页面留白、highlight.js 配色、打印规则。
 *
 * highlight.js 的色值必须是字面量，取自 index.css 亮色档的同一组 oklch 换算结果。
 */
const EXPORT_CSS = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0}
.md-preview{min-height:100vh;padding:32px 16px 64px}
@page{size:A4;margin:16mm}
.hljs{color:#0a0a0a}
.hljs-comment,.hljs-quote{color:#737373;font-style:italic}
.hljs-keyword,.hljs-selector-tag,.hljs-literal,.hljs-doctag{color:#7457d1}
.hljs-string,.hljs-regexp,.hljs-addition{color:#007a3a}
.hljs-number,.hljs-symbol,.hljs-bullet,.hljs-attr{color:#c26300}
.hljs-title,.hljs-section,.hljs-name,.hljs-type{color:#2171cc}
.hljs-deletion{color:#d73337}
@media print{
  body{print-color-adjust:exact;-webkit-print-color-adjust:exact}
  .md-preview{max-width:none;min-height:0;padding:0}
  .md-preview > *{max-width:none}
  a{color:inherit;text-decoration:none}
  pre,table,blockquote,.md-mermaid,.md-math-block{break-inside:avoid}
  h1,h2,h3,h4{break-after:avoid}
}
`

export type StandaloneHtmlInput = {
  title: string
  /** 预览区已渲染并净化过的 HTML（含 mermaid SVG 与 katex 标记） */
  bodyHtml: string
  /** katex.min.css 文本；文档无公式时传空串 */
  katexCss?: string
  /** 解析 CSS 内相对资源路径的基准地址 */
  baseUrl?: string
}

/**
 * 把样式表里的相对 `url(...)` 依 baseUrl 解析成绝对地址。
 *
 * KaTeX 的 `@font-face` 指向 woff2 文件，而独立 HTML 与打印 iframe 都不是站点文档，
 * 相对路径取不到字体。解析成绝对地址后公式字体照常加载，代价是离线打开时公式退化为
 * 系统衬线字体——版式仍正确，原始 TeX 也留在 `<annotation>` 里可复制、可读屏。
 */
export function resolveCssAssetUrls(css: string, baseUrl: string): string {
  return css.replace(/url\((['"]?)([^'")]+)\1\)/g, (whole, quote: string, raw: string) => {
    if (/^(data:|https?:|\/\/|#)/i.test(raw)) {
      return whole
    }
    try {
      return `url(${quote}${new URL(raw, baseUrl).href}${quote})`
    } catch {
      return whole
    }
  })
}

/** 组装自包含 HTML：正文来自预览 DOM，样式全部内联 */
export function buildStandaloneHtml({
  title,
  bodyHtml,
  katexCss = '',
  baseUrl = '',
}: StandaloneHtmlInput): string {
  const safeTitle = escapeHtml(title)
  const base = baseUrl || '/'
  const katex = katexCss ? resolveCssAssetUrls(katexCss, base) : ''
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
${katex ? `<style>${katex}</style>` : ''}
<style>${previewCss}</style>
<style>${EXPORT_CSS}</style>
</head>
<body>
<div class="md-preview">${bodyHtml}</div>
</body>
</html>
`
}

export { EXPORT_CSS }
