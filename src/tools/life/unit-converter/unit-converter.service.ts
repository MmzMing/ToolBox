/** 单位换算：按类别维护「单位 → 基准单位倍率」，转换为纯乘除（温度类见计算分类的温度转换工具） */

export type UnitCategoryId = 'length' | 'weight' | 'data' | 'speed' | 'area'

export interface UnitDef {
  /** 展示符号（语言中立） */
  symbol: string
  /** 相对基准单位的倍率 */
  factor: number
}

export interface UnitCategoryDef {
  id: UnitCategoryId
  /** i18n 键 */
  labelKey: string
  baseSymbol: string
  units: UnitDef[]
}

export const unitCategories: readonly UnitCategoryDef[] = [
  {
    id: 'length',
    labelKey: 'categories.length',
    baseSymbol: 'm',
    units: [
      { symbol: 'km', factor: 1000 },
      { symbol: 'm', factor: 1 },
      { symbol: 'dm', factor: 0.1 },
      { symbol: 'cm', factor: 0.01 },
      { symbol: 'mm', factor: 0.001 },
      { symbol: 'mile', factor: 1609.344 },
      { symbol: 'yd', factor: 0.9144 },
      { symbol: 'ft', factor: 0.3048 },
      { symbol: 'in', factor: 0.0254 },
      { symbol: 'nmi', factor: 1852 },
    ],
  },
  {
    id: 'weight',
    labelKey: 'categories.weight',
    baseSymbol: 'kg',
    units: [
      { symbol: 't', factor: 1000 },
      { symbol: 'kg', factor: 1 },
      { symbol: 'g', factor: 0.001 },
      { symbol: 'mg', factor: 0.000001 },
      { symbol: '斤', factor: 0.5 },
      { symbol: '两', factor: 0.05 },
      { symbol: 'lb', factor: 0.45359237 },
      { symbol: 'oz', factor: 0.028349523125 },
    ],
  },
  {
    id: 'data',
    labelKey: 'categories.data',
    baseSymbol: 'B',
    units: [
      { symbol: 'TB', factor: 1024 ** 4 },
      { symbol: 'GB', factor: 1024 ** 3 },
      { symbol: 'MB', factor: 1024 ** 2 },
      { symbol: 'KB', factor: 1024 },
      { symbol: 'B', factor: 1 },
    ],
  },
  {
    id: 'speed',
    labelKey: 'categories.speed',
    baseSymbol: 'm/s',
    units: [
      { symbol: 'm/s', factor: 1 },
      { symbol: 'km/h', factor: 1 / 3.6 },
      { symbol: 'mph', factor: 0.44704 },
      { symbol: 'kn', factor: 0.514444 },
      { symbol: 'ft/s', factor: 0.3048 },
    ],
  },
  {
    id: 'area',
    labelKey: 'categories.area',
    baseSymbol: 'm²',
    units: [
      { symbol: 'km²', factor: 1_000_000 },
      { symbol: 'ha', factor: 10_000 },
      { symbol: 'm²', factor: 1 },
      { symbol: '亩', factor: 2000 / 3 },
      { symbol: 'cm²', factor: 0.0001 },
      { symbol: 'ft²', factor: 0.09290304 },
    ],
  },
]

export function getCategory(id: UnitCategoryId): UnitCategoryDef {
  const category = unitCategories.find((item) => item.id === id)
  if (!category) {
    throw new Error(`Unknown unit category: ${id}`)
  }
  return category
}

/** 换算：先转为基准单位再转为目标单位；非法输入抛 Error */
export function convertUnit(
  categoryId: UnitCategoryId,
  value: number,
  fromSymbol: string,
  toSymbol: string,
): number {
  const category = getCategory(categoryId)
  const from = category.units.find((u) => u.symbol === fromSymbol)
  const to = category.units.find((u) => u.symbol === toSymbol)
  if (!from || !to) {
    throw new Error(`Unknown unit in ${categoryId}: ${fromSymbol} or ${toSymbol}`)
  }
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid value: ${value}`)
  }
  return (value * from.factor) / to.factor
}

/** 结果展示：保留最多 8 位有效数字，去掉多余的尾零 */
export function formatConverted(value: number): string {
  if (!Number.isFinite(value)) {
    return '—'
  }
  return String(Number(value.toPrecision(8)))
}
