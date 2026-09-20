/**
 * 分页切刀的落点测量。
 *
 * A4 边界是固定像素，直接按它切会把一行字劈成两半。旧版靠服务端 Puppeteer 打 @page，
 * 由浏览器分页引擎在行盒之间断页；纯前端要复刻这个性质，就得先问 DOM
 * "哪些位置是行与行之间的空白"，再把切刀吸附到那些空白上。
 */

/** 承载文本行的元素：它们的行盒底边就是可以安全断页的位置 */
export const PAGE_BREAK_SAFE_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, tr, blockquote'

/**
 * 返回纸张内每一行文本行盒的下边缘，外加各内容块的下边缘。
 *
 * 行盒来自 `Range.getClientRects()`，与浏览器断页时能落的位置一致，所以切刀既不会
 * 劈开一行字，也不会像只按块吸附那样在页脚留下大段空白。
 *
 * 结果以 CSS 自然像素表示、相对 `root` 顶端，因此带 `transform: scale()` 的预览和
 * 未缩放的离屏克隆得到的是同一套坐标。
 */
export function measureLineBottoms(root: HTMLElement): number[] {
  const rootRect = root.getBoundingClientRect()
  const rendered = root.offsetWidth ? rootRect.width / root.offsetWidth : 0
  if (!rendered) {
    return []
  }

  const range = document.createRange()
  const bottoms: number[] = []

  const push = (top: number, bottom: number) => {
    if (bottom - top < 1) {
      // 零高度的空行盒没有内容，对断页没有意义
      return
    }
    bottoms.push((bottom - rootRect.top) / rendered)
  }

  for (const node of Array.from(root.querySelectorAll<HTMLElement>(PAGE_BREAK_SAFE_SELECTOR))) {
    range.selectNodeContents(node)
    for (const rect of Array.from(range.getClientRects())) {
      push(rect.top, rect.bottom)
    }

    const own = node.getBoundingClientRect()
    push(own.top, own.bottom)
  }

  return bottoms.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
}
