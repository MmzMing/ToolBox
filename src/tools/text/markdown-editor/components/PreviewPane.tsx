import { useEffect, type RefObject } from 'react'

import { sanitizeMarkdownHtml, type MarkdownRenderResult } from '@/utils/markdown'

import '../preview.css'
import {
  hasMath,
  hasMermaid,
  renderMathNodes,
  renderMermaidNodes,
  wrapWideTables,
} from './preview-renderers'

/** 图表与公式的二次渲染等手停 */
const ENHANCE_DEBOUNCE_MS = 350

interface PreviewPaneProps {
  rendered: MarkdownRenderResult
  renderMermaid: boolean
  renderMath: boolean
  dark: boolean
  paneRef: RefObject<HTMLDivElement | null>
  onScroll: () => void
}

/**
 * 渲染顺序是「marked → DOMPurify → katex/mermaid」。
 *
 * 净化必须在公式与图表之前：katex 的 MathML 与 mermaid 的 SVG 都不在 HTML 档白名单里，
 * 放后面各自按自己的档净化（SVG 过 svg 档，katex 产物是本地生成的可信字符串）。
 * innerHTML 手工写入而非 dangerouslySetInnerHTML，是为了让二次渲染的产物不被 React 覆写。
 *
 * 文本部分跟随每次按键，图表与公式则等输入停手再渲染：mermaid 一次 layout 是几十毫秒级，
 * 边打字边重排会明显卡顿，也会让图片在光标移动时反复闪。
 */
export function PreviewPane({
  rendered,
  renderMermaid,
  renderMath,
  dark,
  paneRef,
  onScroll,
}: PreviewPaneProps) {
  useEffect(() => {
    const el = paneRef.current
    if (el === null) {
      return
    }
    el.innerHTML = sanitizeMarkdownHtml(rendered.html)
    wrapWideTables(el)

    const enhance = async () => {
      if (renderMath && hasMath(el)) {
        await renderMathNodes(el)
      }
      if (renderMermaid && hasMermaid(el)) {
        await renderMermaidNodes(el, dark)
      }
    }

    const timer = setTimeout(() => {
      void enhance().catch((error) => {
        // 单个图/公式渲染失败只影响那一块，占位里的源码仍在；但错误必须留在控制台可查
        console.warn('[markdown-preview] enhance failed', error)
      })
    }, ENHANCE_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [rendered, renderMermaid, renderMath, dark, paneRef])

  return (
    <div
      ref={paneRef}
      onScroll={onScroll}
      className="md-preview bg-background relative h-full min-h-0 max-w-none overflow-auto"
    />
  )
}
