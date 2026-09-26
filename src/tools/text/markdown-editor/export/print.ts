/**
 * PDF 导出：把与 HTML 导出同一份文档写进隐藏 iframe 再调 print()，用户在打印对话框里
 * 选「另存为 PDF」。
 *
 * 不走 jspdf + html2canvas：那条路是位图截图，文字不可选中、代码发虚、超过两页要手工切片。
 * 打印流是矢量输出，分页交给浏览器，导出 CSS 里的 @media print 规则负责避开截断。
 */
export async function printDocument(html: string): Promise<void> {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.setAttribute('title', 'print')
  iframe.style.position = 'fixed'
  iframe.style.left = '-10000px'
  iframe.style.top = '0'
  iframe.style.width = '210mm'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  try {
    const doc = iframe.contentWindow?.document
    if (!doc) {
      throw new Error('print frame unavailable')
    }

    doc.open()
    doc.write(html)
    doc.close()

    // 图片与 mermaid SVG 没就位就打印会留下空白块
    const images = Array.from(doc.images)
    await Promise.all(
      images.map(
        (image) =>
          new Promise<void>((resolve) => {
            if (image.complete) {
              resolve()
              return
            }
            image.onload = () => resolve()
            image.onerror = () => resolve()
          }),
      ),
    )
    await doc.fonts?.ready

    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
  } finally {
    // 打印对话框是阻塞的，留一拍让浏览器把任务交给系统
    setTimeout(() => iframe.remove(), 1000)
  }
}
