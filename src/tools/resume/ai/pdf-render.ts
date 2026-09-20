import * as pdfjs from 'pdfjs-dist'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'

import { AIRequestError } from './transport'
import { MAX_PDF_FILE_BYTES, MAX_PDF_IMPORT_PAGES } from './pdf-import'

// pdf.js 的 worker 必须显式接线；?worker 让 Vite 打成同源的 module worker，
// 不走 CDN，离线与 CSP 环境下也成立
pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker()

const RENDER_SCALE = 2
const MAX_PAGE_WIDTH = 1600
const JPEG_QUALITY = 0.82

export type RenderedPdfPage = {
  page: number
  /** image/jpeg 的 data URL，直接作为视觉模型的图片输入 */
  dataUrl: string
  /** 估算字节数，用于发送前卡 16MB 请求体上限 */
  bytes: number
}

const dataUrlBytes = (dataUrl: string) => {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Math.floor((base64.length * 3) / 4)
}

/**
 * PDF 逐页渲染成图片。
 *
 * pdf.js v6 里加密不再有 `isEncrypted` 标志：受保护的文件在 `loadingTask.promise` 阶段
 * 就抛 `PasswordException`，这里翻译成 `encryptedPdf`，而不是静默等一个我们给不出的密码。
 * 页数上限在渲染前判掉，别白烧一遍 CPU。
 */
export async function renderPdfToImages(file: File, signal: AbortSignal) {
  if (file.size > MAX_PDF_FILE_BYTES) {
    throw new AIRequestError('fileTooLarge', 413)
  }

  const buffer = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) })

  let pdfDocument: pdfjs.PDFDocumentProxy
  try {
    pdfDocument = await loadingTask.promise
  } catch (error) {
    await loadingTask.destroy().catch(() => {})
    if (error instanceof pdfjs.PasswordException) {
      throw new AIRequestError('encryptedPdf', 400)
    }
    throw new AIRequestError('pdfUnreadable', 400)
  }

  try {
    if (pdfDocument.numPages > MAX_PDF_IMPORT_PAGES) {
      throw new AIRequestError('tooManyPages', 413)
    }

    const pages: RenderedPdfPage[] = []

    for (let index = 1; index <= pdfDocument.numPages; index += 1) {
      if (signal.aborted) {
        throw new AIRequestError('aborted', 499)
      }
      const page = await pdfDocument.getPage(index)
      const natural = page.getViewport({ scale: 1 })
      const scale = natural.width > MAX_PAGE_WIDTH ? MAX_PAGE_WIDTH / natural.width : RENDER_SCALE
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.floor(viewport.width))
      canvas.height = Math.max(1, Math.floor(viewport.height))

      try {
        await page.render({ canvas, viewport }).promise
      } finally {
        page.cleanup()
      }

      const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
      pages.push({ page: index, dataUrl, bytes: dataUrlBytes(dataUrl) })
    }

    if (!pages.length) {
      throw new AIRequestError('emptyOutput', 502)
    }

    return pages
  } finally {
    await loadingTask.destroy().catch(() => {})
  }
}
