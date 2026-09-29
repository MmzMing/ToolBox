import { MATH_BLOCK_CLASS, MERMAID_CLASS, MATH_CLASS, sanitizeSvg } from '@/utils/markdown'

/** 只在文档真的含图/含公式时才付这份下载成本 */
let mermaidLoader: Promise<MermaidModule> | null = null
let katexLoader: Promise<KatexModule> | null = null
let katexCss: Promise<string> | null = null
let mermaidSeq = 0

async function fetchMermaid() {
  return (await import('mermaid')).default
}

async function fetchKatex() {
  return (await import('katex')).default
}

type MermaidModule = Awaited<ReturnType<typeof fetchMermaid>>
type KatexModule = Awaited<ReturnType<typeof fetchKatex>>

function loadMermaid(): Promise<MermaidModule> {
  mermaidLoader ??= fetchMermaid()
  return mermaidLoader
}

function loadKatex(): Promise<KatexModule> {
  katexLoader ??= fetchKatex()
  return katexLoader
}

/**
 * katex CSS 用 `?inline` 取文本再自己注入 <style>，而不是 `import 'katex/dist/katex.min.css'`：
 * 导出 HTML 需要同一份 CSS 的字符串，走资产导入拿不到文本，走两次导入又会重复打包。
 */
export function loadKatexCss(): Promise<string> {
  katexCss ??= import('katex/dist/katex.min.css?inline').then((mod) => {
    const style = document.createElement('style')
    style.id = 'katex-css'
    style.textContent = mod.default
    document.head.appendChild(style)
    return mod.default
  })
  return katexCss
}

/** 预览里出现 mermaid 围栏时才需要它，供组件决定要不要触发懒加载 */
export function hasMath(root: HTMLElement): boolean {
  return root.querySelector(`.${MATH_CLASS}`) !== null
}

export function hasMermaid(root: HTMLElement): boolean {
  return root.querySelector(`.${MERMAID_CLASS}`) !== null
}

export const TABLE_SCROLL_CLASS = 'md-table-scroll'

/**
 * 宽表格外包一层横向滚动容器，让溢出在表格内部消化，而不是把整块预览推成横向滚动。
 * 幂等：重复调用不会套第二层。
 */
export function wrapWideTables(root: HTMLElement): void {
  for (const table of Array.from(root.querySelectorAll<HTMLTableElement>('table'))) {
    if (table.parentElement?.classList.contains(TABLE_SCROLL_CLASS)) {
      continue
    }
    const wrapper = document.createElement('div')
    wrapper.className = TABLE_SCROLL_CLASS
    table.replaceWith(wrapper)
    wrapper.appendChild(table)
  }
}

/** 未渲染时占位里保留着源码，渲染成功后整段换掉 */
export async function renderMathNodes(root: HTMLElement): Promise<void> {
  const [katex] = await Promise.all([loadKatex(), loadKatexCss()])
  for (const node of Array.from(root.querySelectorAll<HTMLElement>(`.${MATH_CLASS}`))) {
    const tex = node.textContent ?? ''
    const displayMode = node.classList.contains(MATH_BLOCK_CLASS)
    try {
      // html-sanitized: katex 输出自带转义，且默认 trust:false / security:'local'，
      // \href、\includegraphics 这类产 URL 的宏一律被拦
      node.innerHTML = katex.renderToString(tex, {
        displayMode,
        throwOnError: false,
        output: 'htmlAndMathml',
      })
    } catch {
      // katex 抛错说明公式本身有问题：保留可读的原始 TeX，不能把内容吃掉
      node.classList.add('md-math-error')
    }
  }
}

export async function renderMermaidNodes(root: HTMLElement, dark: boolean): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(`.${MERMAID_CLASS}`))
  if (nodes.length === 0) {
    return
  }
  const mermaid = await loadMermaid()
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: dark ? 'dark' : 'default',
    themeVariables: { darkMode: dark },
  })

  for (const node of nodes) {
    const source = node.querySelector('pre')?.textContent ?? node.textContent ?? ''
    try {
      mermaidSeq += 1
      const { svg } = await mermaid.render(`md-diagram-${mermaidSeq}`, source)
      // mermaid 自身会做净化，但产物要进 dangerouslySetInnerHTML/innerHTML，仍按 SVG 档再过一道
      node.innerHTML = sanitizeSvg(svg)
    } catch (error) {
      node.classList.add('md-mermaid-error')
      node.setAttribute('data-error', error instanceof Error ? error.message : String(error))
    }
  }
}
