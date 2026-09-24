/**
 * 中文分块与断行、文字排版度量。
 *
 * 分块（chunkText）决定"一个镜头里 text 再切成几组词"，
 * 断行（splitLines）决定多行文字在何处换行：中文没有空格，
 * 只能按标点与词性打分找缝，且不能把西词拆断。
 */
import type { LaidText, TextItem } from './types'
import { charKind, isClosePunct, isHan, isOpenPunct, isSpace } from './script'
import { metrics } from './glyphs'
import { clamp } from './util'

const segmenter =
  typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter('zh', { granularity: 'word' })
    : null

/** 分词：优先 Intl.Segmenter，退化时按脚本类型成组 */
export function segments(text: string): string[] {
  if (segmenter) return [...segmenter.segment(text)].map((s) => s.segment)
  const out: string[] = []
  let cur = ''
  let kind = ''
  for (const c of text) {
    const k = charKind(c)
    if (cur && k !== kind && !(kind === 'han' && k === 'han')) {
      out.push(cur)
      cur = ''
    }
    cur += c
    kind = k
  }
  if (cur) out.push(cur)
  return out
}

/** 单个词块允许的最大字数（超过则再切） */
const MAX_CHUNK = 6
/** 一行/一列允许的最大字数 */
const MAX_LINE = 8

/**
 * 把一句歌词切成适合分镜的词块。
 * 标点黏在前一块上；单字虚词并入前块；过长的块再均衡拆分。
 */
export function chunkText(text: string): string[] {
  const segs = segments(text)
  const chunks: string[] = []
  let cur = ''
  const close = () => {
    if (cur.trim()) chunks.push(cur.trim())
    cur = ''
  }
  for (const sg of segs) {
    const kind = charKind(sg[0] ?? '')
    if (isSpace(sg)) {
      close()
      continue
    }
    if (kind === 'punct') {
      if (cur) cur += sg
      else if (chunks.length) chunks[chunks.length - 1] += sg
      else cur = sg
      continue
    }
    const size = [...sg].length
    if (!cur) {
      cur = sg
      continue
    }
    const curSize = [...cur].length
    const sameFamily = isHan(sg[0] ?? '') === isHan(cur[0] ?? '')
    if (size <= 1 || (sameFamily && curSize + size <= MAX_CHUNK)) {
      cur += sg
      continue
    }
    close()
    cur = sg
  }
  close()

  const out: string[] = []
  for (const c of chunks) {
    const n = [...c].length
    if (n > MAX_LINE) out.push(...splitLines(c, Math.ceil(n / Math.ceil(n / MAX_LINE))).split('\n'))
    else out.push(c)
  }
  // 末位孤字并入前一块（汉字除外，单字汉语句末落词常有意象价值）
  for (let i = out.length - 1; i > 0; i--) {
    if ([...out[i]].length === 1 && !isHan(out[i])) {
      out[i - 1] += out[i]
      out.splice(i, 1)
    }
  }
  return out.length ? out : [text]
}

/** 均衡断行：在中文字数不超过 maxPer 的前提下，找标点/词性最优的缝 */
export function splitLines(text: string, maxPer: number): string {
  const arr = [...text]
  if (arr.length <= maxPer) return text
  const nLines = Math.ceil(arr.length / maxPer)
  const per = arr.length / nLines
  const out: string[] = []
  let start = 0
  for (let l = 1; l < nLines; l++) {
    const target = Math.round(per * l)
    let best = target
    let bestScore = Number.NEGATIVE_INFINITY
    for (let k = Math.max(start + 1, target - 3); k <= Math.min(arr.length - 1, target + 3); k++) {
      const a = arr[k - 1] ?? ''
      const b = arr[k] ?? ''
      let s = 3 - Math.abs(k - target)
      if (charKind(a) === 'punct') s += 5
      if (isSpace(a)) s += 5
      if (isClosePunct(b) || isOpenPunct(a)) s -= 6
      if ((isHan(a) || charKind(a) === 'punct') && charKind(b) === 'latin') s += 3
      if (charKind(a) === 'latin' && charKind(b) === 'latin') s -= 4
      if (charKind(a) === 'digit' && charKind(b) === 'digit') s -= 4
      if (s > bestScore) {
        bestScore = s
        best = k
      }
    }
    out.push(arr.slice(start, best).join('').trim())
    start = best
  }
  out.push(arr.slice(start).join('').trim())
  return out.join('\n')
}

/** 竖排时一个字符占的高度（拉丁字母按实际宽度，其余按全角） */
function verticalAdvance(font: string, ch: string, size: number): number {
  return /[A-Za-z0-9]/.test(ch) ? metrics.adv(font, ch) * size : size
}

/** 排布与度量只需要文本项的一部分字段，故用一个窄类型，方便传对象字面量 */
export type TextMetricsInput = Pick<
  TextItem,
  'text' | 'size' | 'font' | 'track' | 'sx' | 'sy' | 'vertical' | 'lead' | 'align'
>

/** 排布：字形中心相对于文本项原点的坐标（未缩放的项目空间） */
export function layoutText(it: TextMetricsInput): LaidText {
  const text = String(it.text ?? '')
  const size = it.size
  const track = it.track || 0
  const lines = text.split('\n')
  const out = [] as unknown as LaidText
  const vertical = !!it.vertical
  const lead = (it.lead || 1.3) * size
  let gi = 0
  if (!vertical) {
    const widths = lines.map((line) => {
      let w = 0
      const arr = [...line]
      arr.forEach((ch, i) => {
        w += metrics.adv(it.font, ch) * size + (i < arr.length - 1 ? track * size : 0)
      })
      return w
    })
    const maxW = Math.max(1, ...widths)
    lines.forEach((line, li) => {
      const arr = [...line]
      let x = it.align === 'left' ? 0 : it.align === 'right' ? -widths[li] : -widths[li] / 2
      const y = (li - (lines.length - 1) / 2) * lead
      arr.forEach((ch, ci) => {
        const a = metrics.adv(it.font, ch) * size
        out.push({
          ch,
          i: gi++,
          li,
          ci,
          n: arr.length,
          x: x + a / 2,
          y,
          w: a,
          h: size,
          r90: false,
          vx: 0,
          vy: 0,
        })
        x += a + track * size
      })
    })
    out.W = maxW
    out.H = lines.length * lead - (lead - size)
  } else {
    const heights = lines.map(
      (line) =>
        [...line].reduce((h, ch) => h + verticalAdvance(it.font, ch, size) + track * size, 0) -
        track * size,
    )
    const maxH = Math.max(1, ...heights)
    lines.forEach((line, li) => {
      const arr = [...line]
      let y = it.align === 'left' ? 0 : -heights[li] / 2
      const x = -(li - (lines.length - 1) / 2) * lead
      arr.forEach((ch, ci) => {
        const a = verticalAdvance(it.font, ch, size)
        const r90 = /[A-Za-z0-9]/.test(ch)
        const punctShift = '、。，．'.includes(ch)
        out.push({
          ch,
          i: gi++,
          li,
          ci,
          n: arr.length,
          x,
          y: y + a / 2,
          w: size,
          h: a,
          r90,
          vx: punctShift ? 0.3 * size : 0,
          vy: punctShift ? -0.3 * size : 0,
        })
        y += a + track * size
      })
    })
    out.W = lines.length * lead - (lead - size)
    out.H = maxH
  }
  out.N = gi
  return out
}

/** 文本项的实际占位（设计像素，含 sx/sy） */
export function measure(it: TextMetricsInput): { w: number; h: number; lay: LaidText } {
  const lay = layoutText(it)
  return { w: lay.W * (it.sx || 1), h: lay.H * (it.sy || 1), lay }
}

/** 求出让文字正好塞进 maxW × maxH 的字号 */
export function fitSize(
  text: string,
  font: string,
  maxW: number,
  maxH: number,
  opt?: Partial<Omit<TextMetricsInput, 'text' | 'font'>>,
): number {
  const probe: TextMetricsInput = { text, font, size: 100, track: 0, ...opt }
  const m = measure(probe)
  const k = Math.min(maxW / Math.max(1, m.w), maxH / Math.max(1, m.h))
  return clamp(100 * k, 1, 100000)
}
