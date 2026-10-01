/**
 * 等一帧让样式与布局落地。
 * 后台标签页里 requestAnimationFrame 会被浏览器无限挂起，所以必须和定时器赛跑，
 * 否则切到别的标签页再点「生成图片」就永远停在"生成中"。
 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => resolve()
    requestAnimationFrame(() => requestAnimationFrame(done))
    setTimeout(done, 120)
  })
}

/**
 * 把已挂载的 DOM 节点光栅化成 PNG。
 *
 * 放在组件侧而不是 service.ts —— service 层要求零 DOM。
 * 用 html2canvas-pro 而不是 stock html2canvas：本项目的 Tailwind v4 令牌是 oklch，
 * 原版解析不了会直接画成黑底。
 */
export async function elementToPng(node: HTMLElement): Promise<Blob> {
  const { default: html2canvas } = await import('html2canvas-pro')

  // 字体加载完再截，否则中文会先用回退字形画一遍；同样要防它挂住
  await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 300))])
  await nextFrame()

  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: null,
    useCORS: true,
    logging: false,
    scrollX: 0,
    scrollY: 0,
    windowWidth: node.scrollWidth,
    windowHeight: node.scrollHeight,
  })

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('canvas encoding failed'))
      }
    }, 'image/png')
  })
}
