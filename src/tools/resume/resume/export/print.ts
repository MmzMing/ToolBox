import { DEFAULT_FONT_FAMILY } from '../constants'

/**
 * 浏览器打印导出。
 *
 * 把纸张节点连同一份收集来的样式写进隐藏 iframe 再调 print()：
 * 直接在主文档上打印会带着三栏的 transform/scale，分页位置不可控。
 */

const PAPER_ID = 'resume-preview'
const A4_WIDTH_MM = 210

function collectCss(): string {
  const chunks: string[] = []

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        chunks.push(rule.cssText)
      }
    } catch {
      // 跨域样式表读不到规则，跳过即可，不影响同源部分
      console.warn('[resume-print] stylesheet not readable:', sheet.href)
    }
  }

  return chunks.join('\n')
}

function stripPreviewOnlyArtifacts(root: HTMLElement): void {
  for (const line of Array.from(root.querySelectorAll<HTMLElement>('.page-break-line'))) {
    line.remove()
  }
  // 校对高亮是直接改在预览 DOM 上的，导出时还原成纯文本
  for (const mark of Array.from(root.querySelectorAll<HTMLElement>('mark[data-grammar-mark]'))) {
    mark.replaceWith(...Array.from(mark.childNodes))
  }
  root.style.removeProperty('transform')
  root.style.removeProperty('width')
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[class*="min-h-"]'))) {
    el.style.removeProperty('min-height')
  }
}

export async function printPaper(title: string, fontFamily?: string): Promise<void> {
  const paper = document.getElementById(PAPER_ID)
  if (!paper) {
    throw new Error(`#${PAPER_ID} is not mounted`)
  }

  const clone = paper.cloneNode(true) as HTMLElement
  clone.removeAttribute('id')
  clone.style.setProperty('padding', getComputedStyle(paper).padding, 'important')
  clone.style.setProperty('background', '#ffffff', 'important')
  clone.style.setProperty('color', getComputedStyle(paper).color, 'important')
  clone.style.setProperty('font-family', fontFamily || DEFAULT_FONT_FAMILY, 'important')
  stripPreviewOnlyArtifacts(clone)

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.left = '-10000px'
  iframe.style.top = '0'
  iframe.style.width = `${A4_WIDTH_MM}mm`
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  try {
    const doc = iframe.contentWindow?.document
    if (!doc) {
      throw new Error('print frame unavailable')
    }

    doc.open()
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${encodeURIComponent(
      title,
    )}</title><style>${collectCss()}</style><style>
      @page { size: A4; margin: 0; }
      html, body, #print-content { background: #ffffff !important; margin: 0; }
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      #print-content { width: ${A4_WIDTH_MM}mm; }
      #print-content [style*="min-height"] { min-height: 0 !important; }
    </style></head><body><div id="print-content">${clone.outerHTML}</div></body></html>`)
    doc.close()

    await new Promise<void>((resolve) => {
      const images = Array.from(doc.images)
      let pending = images.length
      if (pending === 0) {
        resolve()
        return
      }
      const done = () => {
        pending -= 1
        if (pending <= 0) {
          resolve()
        }
      }
      for (const image of images) {
        image.onload = done
        image.onerror = done
      }
    })

    if (doc.fonts?.ready) {
      await doc.fonts.ready
    }

    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
  } finally {
    // 打印对话框是阻塞的，留一拍让浏览器把任务交给系统
    setTimeout(() => iframe.remove(), 1000)
  }
}
