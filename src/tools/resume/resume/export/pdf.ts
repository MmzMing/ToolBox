import { A4_HEIGHT_MM, A4_HEIGHT_PX, A4_WIDTH_MM, PX_PER_MM } from '../constants'
import { measureLineBottoms } from '../page-break'
import { resumeFileName } from '../resume.service'
import { download } from './download'

/**
 * 长图光栅化导出（html2canvas-pro + jsPDF）。
 *
 * 用 -pro 分支而不是 stock html2canvas：本项目的 Tailwind v4 令牌是 oklch，
 * 且全局 `* { border-color: var(--border) }` 让纸张里每个节点的计算色都是 oklch，
 * stock 版本解析时会直接抛 `unsupported color function`。
 */

const PAPER_ID = 'resume-preview'
const CAPTURE_SCALE = 2
/** 底部留白，避免最后一行正好压在纸边界上被裁掉 */
const LONG_PAGE_BOTTOM_SAFE_AREA_PX = 40
const LONG_PAGE_CAPTURE_BUFFER_PX = 200
const LONG_PAGE_HEIGHT_BUFFER_MM = 5
/** 切刀允许从块底边往下漂的 CSS 像素，用来躲开边框与阴影的抗锯齿边缘 */
const BLANK_BAND_DRIFT_PX = 20

export type PaperCaptureOptions = {
  pagePadding: number
  fontFamily: string
}

type Capture = {
  container: HTMLDivElement
  cloned: HTMLElement
  contentWidthPx: number
  contentHeightPx: number
  /** 内容块下边缘（CSS 像素，相对纸张顶端）：分页切刀只能落在这些空白带上 */
  lineBottomsPx: number[]
}

function hidePageBreakLines(root: HTMLElement): void {
  for (const line of Array.from(root.querySelectorAll<HTMLElement>('.page-break-line'))) {
    line.style.setProperty('display', 'none', 'important')
  }
}

/** 预览用的 transform/min-height 会把纸张钉在视口尺度，离屏克隆要按内容自然撑开 */
function removePreviewConstraints(root: HTMLElement): void {
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

function toDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** 同源图片转 data URL，省掉 html2canvas 在离屏文档里重发请求的机会 */
async function inlineImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>('img')).filter(
    (img) => !!img.src && !img.src.startsWith('data:'),
  )

  await Promise.all(
    images.map(async (img) => {
      try {
        const response = await fetch(img.src, { mode: 'cors' })
        if (!response.ok) {
          return
        }
        const blob = await response.blob()
        // SVG 转 raster 会丢尺寸信息，留给 html2canvas 自己处理
        if (blob.type === 'image/svg+xml') {
          return
        }
        img.src = await toDataURL(blob)
      } catch {
        // 跨域头像在纯前端拿不到像素：跳过它，导出继续，而不是整次失败
        console.warn('[resume-export] image could not be inlined:', img.src)
      }
    }),
  )
}

/** html2canvas 不实现 object-fit: cover，先按可见框自行裁切再回填 */
async function bakeCoverImages(root: HTMLElement): Promise<void> {
  await Promise.all(
    Array.from(root.querySelectorAll<HTMLImageElement>('img')).map(async (img) => {
      if (getComputedStyle(img).objectFit !== 'cover') {
        return
      }

      const boxWidth = img.clientWidth
      const boxHeight = img.clientHeight
      if (!boxWidth || !boxHeight || !img.naturalWidth) {
        return
      }

      const canvas = document.createElement('canvas')
      canvas.width = boxWidth
      canvas.height = boxHeight
      const context = canvas.getContext('2d')
      if (!context) {
        return
      }

      const scale = Math.max(boxWidth / img.naturalWidth, boxHeight / img.naturalHeight)
      const drawWidth = img.naturalWidth * scale
      const drawHeight = img.naturalHeight * scale
      context.drawImage(
        img,
        (boxWidth - drawWidth) / 2,
        (boxHeight - drawHeight) / 2,
        drawWidth,
        drawHeight,
      )

      img.src = canvas.toDataURL('image/png')
      img.style.setProperty('object-fit', 'fill', 'important')
    }),
  )
}

function waitForImages(root: HTMLElement): Promise<void> {
  return Promise.all(
    Array.from(root.querySelectorAll<HTMLImageElement>('img')).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve()
            return
          }
          img.onload = () => resolve()
          img.onerror = () => resolve()
        }),
    ),
  ).then(() => undefined)
}

async function prepareCapture(options: PaperCaptureOptions): Promise<Capture> {
  const paper = document.getElementById(PAPER_ID)
  if (!paper) {
    throw new Error(`#${PAPER_ID} is not mounted`)
  }

  const cloned = paper.cloneNode(true) as HTMLElement
  hidePageBreakLines(cloned)
  removePreviewConstraints(cloned)
  await inlineImages(cloned)

  cloned.style.setProperty('padding', `${options.pagePadding}px`, 'important')
  cloned.style.setProperty('box-sizing', 'border-box', 'important')
  cloned.style.setProperty('background', 'white', 'important')
  cloned.style.setProperty('font-family', options.fontFamily, 'important')

  const spacer = document.createElement('div')
  spacer.setAttribute('aria-hidden', 'true')
  spacer.style.width = '100%'
  spacer.style.height = `${LONG_PAGE_BOTTOM_SAFE_AREA_PX}px`
  cloned.appendChild(spacer)

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-10000px'
  container.style.top = '0'
  container.style.width = `${A4_WIDTH_MM}mm`
  container.style.background = 'white'
  container.style.pointerEvents = 'none'
  container.style.zIndex = '-1'
  container.appendChild(cloned)
  document.body.appendChild(container)

  try {
    await waitForImages(cloned)
    await bakeCoverImages(cloned)
    await document.fonts.ready
    // 两次 rAF：等样式落地并完成一次布局，否则测到的是旧尺寸
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))
    })

    const rect = cloned.getBoundingClientRect()

    return {
      container,
      cloned,
      contentWidthPx: rect.width || cloned.scrollWidth || A4_WIDTH_MM * PX_PER_MM,
      contentHeightPx: Math.max(rect.height, cloned.scrollHeight, 1),
      lineBottomsPx: measureLineBottoms(cloned),
    }
  } catch (error) {
    container.remove()
    throw error
  }
}

async function renderCanvas(capture: Capture): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import('html2canvas-pro')

  return html2canvas(capture.cloned, {
    scale: CAPTURE_SCALE,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    scrollX: 0,
    scrollY: 0,
    windowWidth: Math.ceil(capture.contentWidthPx),
    windowHeight: Math.ceil(capture.contentHeightPx + LONG_PAGE_CAPTURE_BUFFER_PX),
  })
}

function baseName(title: string): string {
  return resumeFileName(title).replace(/\.json$/, '')
}

async function withCapture<T>(
  options: PaperCaptureOptions,
  run: (capture: Capture) => Promise<T>,
): Promise<T> {
  const capture = await prepareCapture(options)
  try {
    return await run(capture)
  } finally {
    capture.container.remove()
  }
}

/** 整页一张长图：宽锁 A4，高随内容 */
export async function exportPaperToLongPagePdf(
  title: string,
  options: PaperCaptureOptions,
): Promise<void> {
  await withCapture(options, async (capture) => {
    const canvas = await renderCanvas(capture)
    const { jsPDF } = await import('jspdf')
    const imageHeightMm = canvas.height * (A4_WIDTH_MM / canvas.width)

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [
        A4_WIDTH_MM,
        Math.max(imageHeightMm + LONG_PAGE_HEIGHT_BUFFER_MM, A4_HEIGHT_PX / PX_PER_MM),
      ],
    })
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, A4_WIDTH_MM, imageHeightMm)
    download(pdf.output('blob'), `${baseName(title)}.pdf`)

    canvas.width = 0
    canvas.height = 0
  })
}

export async function exportPaperToLongPageImage(
  title: string,
  options: PaperCaptureOptions,
): Promise<void> {
  await withCapture(options, async (capture) => {
    const canvas = await renderCanvas(capture)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result)
          return
        }
        reject(new Error('PNG conversion failed'))
      }, 'image/png')
    })
    download(blob, `${baseName(title)}.png`)

    canvas.width = 0
    canvas.height = 0
  })
}

/** 逐行探测画布上的"空白行"：切刀只落在无墨迹的行上，就不会把字劈成两半 */
function rowHasInk(context: CanvasRenderingContext2D, width: number, y: number): boolean {
  const { data } = context.getImageData(0, y, width, 1)
  // 每 3 像素取一个采样点：2 倍画布下字形竖笔最窄也有 2px，再稀就会漏判
  for (let x = 0; x < data.length; x += 12) {
    if (data[x + 3] === 0) {
      continue
    }
    if (data[x] < 251 || data[x + 1] < 251 || data[x + 2] < 251) {
      return true
    }
  }
  return false
}

/**
 * 定这一刀切在哪：吸附到理想线上方的最后一条行盒空白；候选行本身压着分隔线或阴影时
 * 有限地上移让开，探不到空白就退回候选行。没有候选时按像素逐行找空白。
 * 无论怎么走都不越过理想线，保证每片都装得进一页。
 */
function chooseCut(
  context: CanvasRenderingContext2D,
  width: number,
  earliest: number,
  ideal: number,
  safePoints: number[],
): number {
  let cut = -1
  for (let index = safePoints.length - 1; index >= 0; index -= 1) {
    const point = Math.round(safePoints[index])
    if (point <= ideal && point >= earliest) {
      cut = point
      break
    }
  }

  const ceiling = cut < 0 ? ideal : cut
  // 有行盒边界托底时只需让开几个像素；全靠像素探测时可以退到最小页高
  const floor =
    cut < 0 ? earliest : Math.max(earliest, ceiling - BLANK_BAND_DRIFT_PX * CAPTURE_SCALE)

  let probe = ceiling
  while (probe > floor && rowHasInk(context, width, probe)) {
    probe -= 1
  }

  return probe === floor && rowHasInk(context, width, probe) ? ceiling : probe
}

/**
 * 分页 A4 PDF：把整张长图按页高切片，每片重新一页并补回上下页边距。
 *
 * 旧版这一路是服务端 Puppeteer 打 @page 实现的，本项目无后端，改为本地切片。
 * 浏览器分页引擎只在行边界断页，切片必须复刻这个性质：切刀先按几何页高定位，
 * 再吸附到内容块下边缘的空白带上，否则一行字会被劈成两半。
 * 参考线与切刀用同一套几何与同一批安全点（见 PreviewPanel），屏上看到的就是切刀位置。
 */
export async function exportPaperToPagedPdf(
  title: string,
  options: PaperCaptureOptions,
): Promise<void> {
  await withCapture(options, async (capture) => {
    const canvas = await renderCanvas(capture)

    try {
      const { jsPDF } = await import('jspdf')
      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error('canvas context unavailable')
      }

      const pageHeightPx = canvas.width * (A4_HEIGHT_MM / A4_WIDTH_MM)
      const paddingPx = options.pagePadding * CAPTURE_SCALE
      const contentHeightPx = pageHeightPx - paddingPx * 2

      if (contentHeightPx <= 0) {
        throw new Error('page padding leaves no content area')
      }

      const contentBottom = Math.max(canvas.height - paddingPx, contentHeightPx)
      const safePoints = capture.lineBottomsPx.map((y) => y * CAPTURE_SCALE)

      // cuts 是每页起点，末位恒为 contentBottom：少推一次就会把后面所有内容整段丢掉
      const cuts: number[] = [paddingPx]
      while (cuts[cuts.length - 1] < contentBottom - 1) {
        const previous = cuts[cuts.length - 1]
        const ideal = previous + contentHeightPx
        cuts.push(
          ideal >= contentBottom
            ? contentBottom
            : chooseCut(
                context,
                canvas.width,
                previous + contentHeightPx * 0.66,
                ideal,
                safePoints,
              ),
        )
      }

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [A4_WIDTH_MM, A4_HEIGHT_MM],
      })

      for (let page = 0; page < cuts.length - 1; page += 1) {
        const sourceY = cuts[page]
        const sourceHeight = cuts[page + 1] - sourceY
        if (sourceHeight <= 0) {
          continue
        }

        const slice = document.createElement('canvas')
        slice.width = canvas.width
        slice.height = Math.round(pageHeightPx)
        const sliceContext = slice.getContext('2d')
        if (!sliceContext) {
          throw new Error('canvas context unavailable')
        }

        sliceContext.fillStyle = '#ffffff'
        sliceContext.fillRect(0, 0, slice.width, slice.height)
        sliceContext.drawImage(
          canvas,
          0,
          Math.round(sourceY),
          canvas.width,
          Math.round(sourceHeight),
          0,
          // 每页都从顶边距起画，页脚留白
          Math.round(paddingPx),
          canvas.width,
          Math.round(sourceHeight),
        )

        if (page > 0) {
          pdf.addPage([A4_WIDTH_MM, A4_HEIGHT_MM], 'portrait')
        }
        pdf.addImage(slice.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM)
        slice.width = 0
        slice.height = 0
      }

      download(pdf.output('blob'), `${baseName(title)}.pdf`)
    } finally {
      canvas.width = 0
      canvas.height = 0
    }
  })
}
