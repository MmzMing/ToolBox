/**
 * 从 JIZURA 源码导出对账夹具（src/test/tools/video/music-to-video/__fixtures__/*.json）。
 *
 * 用法：
 *   node scripts/gen-jizura-fixtures.mjs [JIZURA/src 路径]
 * 默认读 D:/my-tools/tools-music/JIZURA/src（与 geometry-trace.test.ts 用的是同一份参考）。
 *
 * 为什么要有这个脚本：现有三份夹具是"运行期导出"的，但历史上导出时漏加载了
 * 11p_horror*.js，于是缺件也照样全绿（registry-parity 的期望清单只有 140 个 layout）。
 * 补齐部件后请重跑本脚本；它导出的是**完整注册表**，缺件会让对账测试立刻变红 —— 这正是它存在的意义。
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const REF = process.argv[2] ?? 'D:/my-tools/tools-music/JIZURA/src'
const OUT = path.resolve(import.meta.dirname, '../src/test/tools/video/music-to-video/__fixtures__')

const noopCtx = new Proxy(
  {},
  {
    get(_t, k) {
      if (k === 'canvas') return { width: 1, height: 1, style: {} }
      if (k === 'measureText')
        return () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })
      if (k === 'createImageData' || k === 'getImageData')
        return (w = 1, h = 1) => ({
          data: new Uint8ClampedArray(Math.max(1, w | 0) * Math.max(1, h | 0) * 4),
          width: w,
          height: h,
        })
      if (k === 'createPattern' || k === 'createLinearGradient' || k === 'createRadialGradient')
        return () => ({ addColorStop: () => undefined, setTransform: () => undefined })
      return () => undefined
    },
    set() {
      return true
    },
  },
)

const elementStub = () => ({
  style: {},
  appendChild: () => undefined,
  setAttribute: () => undefined,
  textContent: '',
  innerHTML: '',
  dataset: {},
  classList: { add: () => undefined, remove: () => undefined, contains: () => false },
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  querySelector: () => null,
  querySelectorAll: () => [],
  getContext: () => noopCtx,
  width: 1,
  height: 1,
})

/** 在沙箱里跑旧引擎（去掉 UI 与导出两件依赖 DOM 的），拿到全局 J */
function loadReference() {
  const files = fs
    .readdirSync(REF)
    .filter((f) => f.endsWith('.js') && !f.startsWith('12_ui') && !f.startsWith('11_export'))
    .sort()
  const sandbox = {
    console: { ...console, log: () => undefined, warn: () => undefined, error: () => undefined },
    Intl,
    performance: { now: () => 0 },
    document: {
      createElement: (tag) =>
        tag === 'canvas'
          ? { width: 1, height: 1, style: {}, getContext: () => noopCtx }
          : elementStub(),
      head: { appendChild: () => undefined },
      body: elementStub(),
      fonts: { add: () => undefined, load: () => Promise.resolve(), check: () => true },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
    },
    location: { href: 'file:///index.html', search: '', hash: '' },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    navigator: { language: 'ja', userAgent: 'node', clipboard: {} },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined },
    Blob: class {},
    File: class {},
    FileReader: class {},
    fetch: () => Promise.reject(new Error('no network')),
    OffscreenCanvas: class {
      constructor(w, h) {
        this.width = w
        this.height = h
      }
      getContext = () => noopCtx
    },
    Image: class {},
    AudioContext: class {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => undefined,
    requestIdleCallback: () => 0,
    TextEncoder,
    TextDecoder,
  }
  sandbox.window = sandbox
  sandbox.self = sandbox
  const context = vm.createContext(sandbox)
  for (const f of files) {
    try {
      vm.runInContext(fs.readFileSync(path.join(REF, f), 'utf8'), context, { filename: f })
    } catch {
      /* 个别文件依赖 DOM，跑不起来也不影响注册表 */
    }
  }
  return sandbox.J
}

/**
 * 夹具里不记的字段只有函数与运行时对象：name / ae / extra / wa / pack / set 都要留着，
 * 因为对账测试各自只挑自己要的（见各 test 文件的 SKIP 表）。
 */
const SKIP = new Set(['special'])
const GLOBALS = new Set(['window', 'self', 'globalThis', 'document'])

function scalars(def) {
  const out = {}
  for (const [k, v] of Object.entries(def)) {
    if (SKIP.has(k) || typeof v === 'function' || GLOBALS.has(k)) continue
    if (v === undefined) continue
    out[k] = v
  }
  return out
}

/**
 * 取旧项目的 AE_MAP。它在 11_export.js 里，那份文件依赖下载/压缩等浏览器 API，
 * 直接跑会抛错，所以只把它那一个字面量文本抠出来求值。
 */
function aeMapOf() {
  const src = fs.readFileSync(path.join(REF, '11_export.js'), 'utf8')
  const at = src.indexOf('J.AE_MAP = {')
  if (at < 0) throw new Error('11_export.js 里找不到 J.AE_MAP')
  const from = src.indexOf('{', at)
  let depth = 0
  let i = from
  for (; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) break
    }
  }
  // 纯字面量，直接求值即可（不牵扯 11_export.js 里的浏览器 API）
  return new Function(`return ${src.slice(from, i + 1)}`)()
}

const J = loadReference()
if (!J) {
  console.error(`读不到 JIZURA 注册表，请检查路径：${REF}`)
  process.exit(1)
}

const GROUPS = ['layout', 'enter', 'hold', 'exit', 'decor', 'treat', 'bg', 'cam', 'fx', 'trans']
const parts = {}
const defs = {}
for (const g of GROUPS) {
  parts[g] = J.order(g).map((key) => ({ key, pack: J.registry(g)[key]?.pack ?? null }))
  defs[g] = {}
  for (const key of J.order(g))
    defs[g][key] = { name: J.registry(g)[key]?.name, ...scalars(J.registry(g)[key]) }
}

defs.__AE_MAP = aeMapOf()

const styles = { order: J.STYLE_ORDER.slice(), styles: {} }
for (const key of J.STYLE_ORDER) {
  const st = J.STYLES[key]
  styles.styles[key] = { name: st.name, ...scalars(st), fonts: st.fonts }
}

fs.mkdirSync(OUT, { recursive: true })
const write = (file, data) => {
  fs.writeFileSync(path.join(OUT, file), `${JSON.stringify(data, null, 1)}\n`)
  console.log(`${file}: ${fs.statSync(path.join(OUT, file)).size} bytes`)
}
write('jizura-parts.json', parts)
write('jizura-defs.json', defs)
write('jizura-styles.json', styles)
console.log('计数：', Object.fromEntries(GROUPS.map((g) => [g, parts[g].length])))
console.log('风格：', styles.order.length)
