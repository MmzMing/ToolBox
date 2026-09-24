/**
 * 字体目录与按需加载。
 *
 * Google Fonts 的 CJK 字体按 unicode-range 分片，只有真正画到的字符才会下载，
 * 所以目录里多列几种字体几乎没有代价（attachFamily 每个家族只挂一次）。
 */
import type { FontDef, Plan } from './types'

const CJK_SANS_FB =
  '"Noto Sans SC","PingFang SC","Microsoft YaHei","Source Han Sans SC","Hiragino Sans GB",sans-serif'
const CJK_SERIF_FB =
  '"Noto Serif SC","Songti SC","SimSun","Source Han Serif SC","Hiragino Mincho ProN",serif'

/** 字体 key -> 定义（gf 为 Google Fonts css2 的 family 参数） */
export const FONTS: Record<string, FontDef> = {
  sans_black: {
    label: 'Noto Sans SC Black',
    family: '"Noto Sans SC"',
    weight: 900,
    kind: 'sans',
    fallback: CJK_SANS_FB,
    gf: 'Noto+Sans+SC:wght@300;500;700;900',
  },
  sans_bold: {
    label: 'Noto Sans SC Bold',
    family: '"Noto Sans SC"',
    weight: 700,
    kind: 'sans',
    fallback: CJK_SANS_FB,
    gf: 'Noto+Sans+SC:wght@300;500;700;900',
  },
  sans_med: {
    label: 'Noto Sans SC Medium',
    family: '"Noto Sans SC"',
    weight: 500,
    kind: 'sans',
    fallback: CJK_SANS_FB,
    gf: 'Noto+Sans+SC:wght@300;500;700;900',
  },
  sans_light: {
    label: 'Noto Sans SC Light',
    family: '"Noto Sans SC"',
    weight: 300,
    kind: 'sans',
    fallback: CJK_SANS_FB,
    gf: 'Noto+Sans+SC:wght@300;500;700;900',
  },
  serif_black: {
    label: 'Noto Serif SC Black',
    family: '"Noto Serif SC"',
    weight: 900,
    kind: 'serif',
    fallback: CJK_SERIF_FB,
    gf: 'Noto+Serif+SC:wght@300;500;700;900',
  },
  serif_bold: {
    label: 'Noto Serif SC Bold',
    family: '"Noto Serif SC"',
    weight: 700,
    kind: 'serif',
    fallback: CJK_SERIF_FB,
    gf: 'Noto+Serif+SC:wght@300;500;700;900',
  },
  serif: {
    label: 'Noto Serif SC Medium',
    family: '"Noto Serif SC"',
    weight: 500,
    kind: 'serif',
    fallback: CJK_SERIF_FB,
    gf: 'Noto+Serif+SC:wght@300;500;700;900',
  },
  serif_light: {
    label: 'Noto Serif SC Light',
    family: '"Noto Serif SC"',
    weight: 300,
    kind: 'serif',
    fallback: CJK_SERIF_FB,
    gf: 'Noto+Serif+SC:wght@300;500;700;900',
  },
  kuaile: {
    label: 'ZCOOL KuaiLe',
    family: '"ZCOOL KuaiLe"',
    weight: 400,
    kind: 'round',
    fallback: CJK_SANS_FB,
    gf: 'ZCOOL+KuaiLe',
  },
  qingke: {
    label: 'ZCOOL QingKe HuangYou',
    family: '"ZCOOL QingKe HuangYou"',
    weight: 400,
    kind: 'display',
    fallback: CJK_SANS_FB,
    gf: 'ZCOOL+QingKe+HuangYou',
  },
  xiaowei: {
    label: 'ZCOOL XiaoWei',
    family: '"ZCOOL XiaoWei"',
    weight: 400,
    kind: 'serif',
    fallback: CJK_SERIF_FB,
    gf: 'ZCOOL+XiaoWei',
  },
  mashan: {
    label: 'Ma Shan Zheng',
    family: '"Ma Shan Zheng"',
    weight: 400,
    kind: 'brush',
    fallback: CJK_SERIF_FB,
    gf: 'Ma+Shan+Zheng',
  },
  zhimang: {
    label: 'Zhi Mang Xing',
    family: '"Zhi Mang Xing"',
    weight: 400,
    kind: 'brush',
    fallback: CJK_SERIF_FB,
    gf: 'Zhi+Mang+Xing',
  },
  longcang: {
    label: 'Long Cang',
    family: '"Long Cang"',
    weight: 400,
    kind: 'hand',
    fallback: CJK_SERIF_FB,
    gf: 'Long+Cang',
  },
  liujian: {
    label: 'Liu Jian Mao Bi',
    family: '"Liu Jian Mao Bi"',
    weight: 400,
    kind: 'hand',
    fallback: CJK_SERIF_FB,
    gf: 'Liu+Jian+Mao+Bi',
  },
  mono: {
    label: 'IBM Plex Mono',
    family: '"IBM Plex Mono"',
    weight: 500,
    kind: 'mono',
    fallback: CJK_SANS_FB,
    gf: 'IBM+Plex+Mono:wght@500;600',
  },
  pixel: {
    label: 'DotGothic16',
    family: '"DotGothic16"',
    weight: 400,
    kind: 'pixel',
    fallback: CJK_SANS_FB,
    gf: 'DotGothic16',
  },
}

export function fontCSS(key: string, px: number): string {
  const f = FONTS[key] ?? FONTS.sans_bold
  return `${f.weight} ${px.toFixed(2)}px ${f.family},${f.fallback}`
}

/** 注册一个用户上传的本地字体族 */
export function addUserFont(key: string, label: string, family: string, weight = 400): void {
  FONTS[key] = {
    label,
    family: `"${family.replace(/"/g, '')}"`,
    weight,
    kind: 'display',
    fallback: CJK_SANS_FB,
  }
}

/** 读取字体文件并注册，返回字体 key */
export async function loadUserFont(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[^\w]/g, '_')
  const fam = `UF_${base}`
  const face = new FontFace(fam, buf)
  await face.load()
  document.fonts.add(face)
  const key = `user_${fam}`
  addUserFont(key, base || fam, fam)
  return key
}

const cssJobs = new Map<string, Promise<void>>()

/** 懒挂载一个 Google Fonts 家族（每个家族只挂一次，失败也视为完成） */
function attachFamily(spec: string): Promise<void> {
  if (!spec || typeof document === 'undefined') return Promise.resolve()
  const hit = cssJobs.get(spec)
  if (hit) return hit
  const job = new Promise<void>((resolve) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(spec)}&display=swap`
    const done = () => resolve()
    link.onload = done
    link.onerror = done
    setTimeout(done, 5000)
    document.head.appendChild(link)
  })
  cssJobs.set(spec, job)
  return job
}

/** plan 里真正会画到的字体 key */
export function fontsOfPlan(plan: Plan | null): string[] {
  const set = new Set<string>(['mono'])
  if (!plan) return [...set]
  for (const roles of Object.values(plan.style.fonts)) {
    for (const k of roles) if (FONTS[k]) set.add(k)
  }
  for (const cut of plan.cuts) {
    for (const v of Object.values(cut.params)) {
      if (typeof v === 'string' && FONTS[v]) set.add(v)
      else if (Array.isArray(v)) v.forEach((x) => typeof x === 'string' && FONTS[x] && set.add(x))
    }
  }
  return [...set]
}

/**
 * 预热字体：挂载所需家族，再让浏览器下载这些字符所在的 unicode-range 分片。
 * 完成后必须清空字形缓存，否则会用旧的字形碎片。
 */
export async function ensureFonts(text: string, keys?: string[]): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) return
  const uniq = [...new Set([...text])].join('') || '中'
  const list = (keys ?? Object.keys(FONTS)).filter((k) => FONTS[k])
  const specs = [...new Set(list.map((k) => FONTS[k].gf).filter((s): s is string => Boolean(s)))]
  await Promise.all(specs.map(attachFamily))
  await Promise.all(
    list.map((k) =>
      document.fonts.load(`${FONTS[k].weight} 64px ${FONTS[k].family}`, uniq).catch(() => null),
    ),
  )
  await document.fonts.ready
}
