/**
 * 拼豆色卡注册表 —— 由 scripts/gen-bead-palettes.mjs 生成，请勿手工编辑。
 * 数据许可与来源见各品牌模块文件头。
 */
import { rgbToLab, type BeadColor, type BeadSwatch } from '../image-to-beads.service'

type BrandModule = { COLORS: readonly BeadSwatch[] }

export type BeadBrandEntry = {
  key: string
  label: string
  beadSizeMm: number
  colorCount: number
  load: () => Promise<BrandModule>
}

export const BEAD_BRANDS: readonly BeadBrandEntry[] = [
  {
    key: 'hama',
    label: 'Hama Midi',
    beadSizeMm: 2.6,
    colorCount: 92,
    load: () => import('./hama'),
  },
  {
    key: 'perler',
    label: 'Perler',
    beadSizeMm: 2.6,
    colorCount: 103,
    load: () => import('./perler'),
  },
  {
    key: 'artkal-a',
    label: 'Artkal A',
    beadSizeMm: 2.6,
    colorCount: 145,
    load: () => import('./artkal-a'),
  },
  {
    key: 'artkal-c',
    label: 'Artkal C',
    beadSizeMm: 2.6,
    colorCount: 174,
    load: () => import('./artkal-c'),
  },
  {
    key: 'artkal-s',
    label: 'Artkal S',
    beadSizeMm: 5,
    colorCount: 199,
    load: () => import('./artkal-s'),
  },
  {
    key: 'mard',
    label: 'Mard',
    beadSizeMm: 2.6,
    colorCount: 291,
    load: () => import('./mard'),
  },
  {
    key: 'yant',
    label: 'Yant',
    beadSizeMm: 2.6,
    colorCount: 119,
    load: () => import('./yant'),
  },
]

/** 按品牌 key 取色卡（懒加载对应模块，避免 1100+ 条数据进主 chunk），Lab 在此现算 */
export async function loadBrandColors(key: string): Promise<readonly BeadColor[]> {
  const brand = BEAD_BRANDS.find((item) => item.key === key)
  if (!brand) {
    throw new Error(`Unknown bead brand: ${key}`)
  }
  const { COLORS } = await brand.load()
  return COLORS.map((swatch) => ({ ...swatch, lab: rgbToLab(swatch.rgb) }))
}
