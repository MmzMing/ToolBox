import type { GrammarError } from '../../../ai/grammar'

const MARK_ATTR = 'data-grammar-mark'

/** 收集容器下的文本节点，并拼出可供 indexOf 的纯文本视图 */
function textView(root: Element) {
  const nodes: Text[] = []
  let text = ''
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(`[${MARK_ATTR}]`)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  })
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    const node = current as Text
    if (!node.data) {
      continue
    }
    nodes.push(node)
    text += node.data
  }
  return { nodes, text }
}

/** 清掉所有高亮，把文本节点合回去 */
export function clearGrammarMarks(root: Element) {
  root.querySelectorAll(`mark[${MARK_ATTR}]`).forEach((mark) => {
    const parent = mark.parentNode
    if (!parent) {
      return
    }
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark)
    }
    parent.removeChild(mark)
  })
  root.normalize()
}

/**
 * 给预览容器打校对高亮，每条错误只标第一处命中。
 *
 * 直接改 React 管理的 DOM 是有代价的：预览重渲染后标记会丢，所以调用方必须在数据变更后
 * 重新跑一遍（见 useGrammarCheck 的 MutationObserver）。整个过程包在 try 里，
 * 万一和 React 的协调冲突，最坏结果是"这次没标上"，不能让它把页面搞崩。
 */
export function applyGrammarMarks(
  root: Element,
  errors: GrammarError[],
  activeIndex: number | null,
) {
  clearGrammarMarks(root)
  if (!errors.length) {
    return
  }
  try {
    for (const [index, error] of errors.entries()) {
      const { text, nodes } = textView(root)
      const at = text.indexOf(error.text)
      if (at === -1) {
        continue
      }
      let offset = 0
      for (const node of nodes) {
        const end = offset + node.data.length
        if (at >= offset && at < end) {
          const mark = document.createElement('mark')
          mark.setAttribute(MARK_ATTR, 'true')
          mark.className = `grammar-error grammar-error-${error.type}${
            index === activeIndex ? ' grammar-error-active' : ''
          }`
          const range = document.createRange()
          range.setStart(node, at - offset)
          range.setEnd(node, Math.min(node.data.length, at - offset + error.text.length))
          range.surroundContents(mark)
          break
        }
        offset = end
      }
    }
  } catch (error) {
    console.warn('[resume-grammar] marking failed', error)
  }
}

/** 定位到第 index 条高亮并滚动居中 */
export function scrollToGrammarMark(root: Element, index: number) {
  const marks = root.querySelectorAll(`mark[${MARK_ATTR}]`)
  const target = marks[index]
  if (!target) {
    return
  }
  const scroller = root.closest('[data-preview-scroll-container="true"]') ?? root.parentElement
  if (!scroller) {
    return
  }
  const targetTop = target.getBoundingClientRect().top
  const scrollerTop = scroller.getBoundingClientRect().top
  scroller.scrollTo({
    top: scroller.scrollTop + targetTop - scrollerTop - scroller.clientHeight / 2,
    behavior: 'smooth',
  })
}
