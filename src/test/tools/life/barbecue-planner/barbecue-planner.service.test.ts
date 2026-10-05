import { describe, expect, it } from 'vitest'

import {
  CUSTOM_UNIT_CHOICES,
  adjustedLineCount,
  applyOverride,
  apportionPieces,
  assertPlanInvariants,
  buildShopping,
  clockAt,
  droppedLineCount,
  formatCharcoal,
  formatMass,
  isAdjusted,
  isDropped,
  lineUnitLabel,
  normalizePlannerInput,
  nextCustomId,
  planBarbecue,
  referenceRecipe,
  scaleRecipe,
  selectableLineIds,
  serializePlan,
  serializeShopping,
  stepAmount,
  stepForUnit,
} from '@/tools/life/barbecue-planner/barbecue-planner.service'
import { INGREDIENT_BY_ID, RECIPE_BY_ID, SUPPLIES } from '@/tools/life/barbecue-planner/data/index'
import type {
  CustomItem,
  PlannerInput,
  PurchaseGroupId,
  ServeUnit,
  ShoppingLine,
} from '@/tools/life/barbecue-planner/types'

/** 一桌没有小饼的普通点菜，用来验证池分配 */
const DISHES = [
  'cn-lamb-skewer',
  'cn-beef-skewer',
  'cn-pork-belly',
  'cn-shrimp',
  'cn-eggplant',
  'cn-rice-cake',
]

/** 成品调料默认全带上，与 normalizePlannerInput 的兜底口径一致 */
const ALL_BASICS = SUPPLIES.filter((item) => item.group === 'condiment').map((item) => item.id)

const BASE: PlannerInput = {
  people: 6,
  appetite: 'standard',
  dishes: DISHES,
  diets: [],
  equipmentMode: 'charcoal',
  qtyMode: 'auto',
  grillStart: '18:30',
  sauces: ['cn-s-classic'],
  basics: ALL_BASICS,
  overrides: {},
  unitChoices: {},
  conflictChoices: {},
  customs: [],
}

function plan(overrides: Partial<PlannerInput> = {}) {
  return planBarbecue({ ...BASE, ...overrides })
}

function lineOf(result: ReturnType<typeof plan>, fragment: string) {
  for (const group of result.shopping.groups) {
    for (const line of group.lines) {
      if (line.ingredientId.includes(fragment)) {
        return line
      }
    }
  }
  return undefined
}

function entryOf(result: ReturnType<typeof plan>, id: string) {
  return result.timeline.find((entry) => entry.id === id)
}

/** 取采购清单里的一行；取不到就报错，省得后面全是可选链 */
function requireLine(result: ReturnType<typeof plan>, fragment: string): ShoppingLine {
  const line = lineOf(result, fragment)
  if (!line) {
    throw new Error(`shopping line missing: ${fragment}`)
  }
  return line
}

describe('normalizePlannerInput', () => {
  it('keeps the legal ends of the headcount range', () => {
    expect(normalizePlannerInput({ ...BASE, people: 1 }).people).toBe(1)
    expect(normalizePlannerInput({ ...BASE, people: 20 }).people).toBe(20)
  })

  it('clamps illegal headcounts into range instead of throwing', () => {
    expect(normalizePlannerInput({ ...BASE, people: 0 }).people).toBe(1)
    expect(normalizePlannerInput({ ...BASE, people: 999 }).people).toBe(20)
    expect(normalizePlannerInput({ ...BASE, people: -3 }).people).toBe(1)
    expect(normalizePlannerInput({ people: Number.NaN }).people).toBe(6)
    expect(normalizePlannerInput({ ...BASE, people: 7.6 }).people).toBe(8)
  })

  it('keeps an empty dish list empty so the picker can show its prompt', () => {
    expect(normalizePlannerInput(BASE).dishes).toEqual(DISHES)
    expect(normalizePlannerInput({ ...BASE, dishes: [] }).dishes).toEqual([])
    expect(normalizePlannerInput({ people: 6 }).dishes).toEqual([])
  })

  it('drops dish ids that do not exist and deduplicates the rest', () => {
    const result = normalizePlannerInput({
      ...BASE,
      dishes: ['cn-lamb-skewer', 'cn-lamb-skewer', 'cn-nope'],
    })
    expect(result.dishes).toEqual(['cn-lamb-skewer'])
  })

  it('falls back to the default grill start on a malformed clock', () => {
    expect(normalizePlannerInput({ ...BASE, grillStart: '25:99' }).grillStart).toBe('23:59')
    expect(normalizePlannerInput({ ...BASE, grillStart: '9:05' }).grillStart).toBe('09:05')
    expect(normalizePlannerInput({ ...BASE, grillStart: 'tea time' }).grillStart).toBe('18:30')
    expect(normalizePlannerInput({ ...BASE, grillStart: '' }).grillStart).toBe('18:30')
  })

  it('resolves every conflict to a real variant id', () => {
    expect(
      normalizePlannerInput({ ...BASE, conflictChoices: { 'thaw-time': 'slow' } }).conflictChoices[
        'thaw-time'
      ],
    ).toBe('slow')
    expect(normalizePlannerInput(BASE).conflictChoices['grill-order']).toBe('heat-zone')
    expect(
      normalizePlannerInput({ ...BASE, conflictChoices: { 'thaw-time': 'bogus' } }).conflictChoices[
        'thaw-time'
      ],
    ).toBe('fast')
  })

  it('defaults the seasoning picks but honours an explicit empty list', () => {
    expect(normalizePlannerInput({ people: 6 }).sauces.length).toBeGreaterThan(0)
    expect(normalizePlannerInput({ ...BASE, sauces: [] }).sauces).toEqual([])
  })

  it('only lets freely pickable seasonings in, never a marinade', () => {
    const result = normalizePlannerInput({
      ...BASE,
      sauces: ['cn-s-classic', 'cn-m-belly', 'cn-nope'],
    })
    expect(result.sauces).toEqual(['cn-s-classic'])
  })

  it('drops unknown line ids and non-finite quantities but keeps a legal zero as a clamp', () => {
    const result = normalizePlannerInput({
      ...BASE,
      overrides: { 'sup-skewer': -5, 'cn-nope': 3, 'sup-foil': Number.NaN },
    })
    expect(result.overrides).toEqual({ 'sup-skewer': 0 })
  })

  it('keeps a legal override exactly as typed', () => {
    expect(
      normalizePlannerInput({ ...BASE, overrides: { 'cn-lamb-skewer': 120 } }).overrides,
    ).toEqual({
      'cn-lamb-skewer': 120,
    })
  })

  it('rounds and clamps the amount written by applyOverride', () => {
    expect(applyOverride({}, 'sup-skewer', 12.4)).toEqual({ 'sup-skewer': 12 })
    expect(applyOverride({}, 'sup-skewer', 1000000)).toEqual({ 'sup-skewer': 99999 })
  })

  it('deletes the key when applyOverride is handed null', () => {
    expect(
      applyOverride({ 'cn-lamb-skewer': 120, 'sup-skewer': 0 }, 'cn-lamb-skewer', null),
    ).toEqual({ 'sup-skewer': 0 })
  })
})

describe('clockAt', () => {
  it('shifts by minutes in both directions', () => {
    expect(clockAt('18:30', 0)).toBe('18:30')
    expect(clockAt('18:30', -10)).toBe('18:20')
    expect(clockAt('18:30', 45)).toBe('19:15')
  })

  it('wraps across midnight', () => {
    expect(clockAt('00:15', -30)).toBe('23:45')
    expect(clockAt('23:30', 60)).toBe('00:30')
    // 提前 24 h 以上仍然落在同一个钟点
    expect(clockAt('18:30', -24 * 60)).toBe('18:30')
  })
})

describe('shopping quantities', () => {
  it('scales linearly with the headcount', () => {
    const four = lineOf(plan({ people: 4 }), 'cn-lamb-skewer')?.amount
    const twelve = lineOf(plan({ people: 12 }), 'cn-lamb-skewer')?.amount
    expect(four).toBeTypeOf('number')
    expect(twelve! / four!).toBeCloseTo(3, 0)
  })

  it('holds the researched per-person meat baseline whatever is picked', () => {
    expect(plan().shopping.totalMeatGrams).toBeCloseTo(280 * 6, -1)
    expect(plan({ appetite: 'heavy' }).shopping.totalMeatGrams).toBeCloseTo(350 * 6, -1)
    expect(plan({ appetite: 'light' }).shopping.totalMeatGrams).toBeCloseTo(200 * 6, -1)
  })

  it('splits a pool evenly between the dishes picked from it', () => {
    const three = plan({ dishes: ['cn-lamb-skewer', 'cn-beef-skewer', 'cn-pork-belly'] })
    const lamb = requireLine(three, 'cn-lamb-skewer')
    // 畜肉池 1680 g ÷ 3 样 = 560 g：菜市场要的是克重，串数不再是清单上的一行
    expect(lamb.amount).toBe(560)
    expect(lamb.unit).toBe('gram')
  })

  it('shrinks each share as more dishes join the same pool', () => {
    const two =
      lineOf(plan({ dishes: ['cn-lamb-skewer', 'cn-beef-skewer'] }), 'cn-lamb-skewer')?.amount ?? 0
    const four =
      lineOf(
        plan({ dishes: ['cn-lamb-skewer', 'cn-beef-skewer', 'cn-pork-belly', 'cn-pork-ribs'] }),
        'cn-lamb-skewer',
      )?.amount ?? 0
    expect(four).toBeLessThan(two)
    expect(
      plan({ dishes: ['cn-lamb-skewer', 'cn-beef-skewer'] }).shopping.totalMeatGrams,
    ).toBeCloseTo(
      plan({ dishes: ['cn-lamb-skewer', 'cn-beef-skewer', 'cn-pork-belly', 'cn-pork-ribs'] })
        .shopping.totalMeatGrams,
      0,
    )
  })

  it('redistributes instead of shrinking when a restriction drops a dish', () => {
    const all = plan()
    const noSeafood = plan({ diets: ['noSeafood'] })
    expect(lineOf(noSeafood, 'cn-shrimp')).toBeUndefined()
    expect(noSeafood.shopping.totalMeatGrams).toBeCloseTo(all.shopping.totalMeatGrams, 0)
  })

  it('halves the meat grams exactly when flatbread lands on the list', () => {
    // 5 人 × 280 g = 1400 g，正好落在 roundGrams 的 50 g 网格上，行量与池总量都能精确对半
    const input = normalizePlannerInput({ ...BASE, people: 5 })
    const lamb = INGREDIENT_BY_ID['cn-lamb-skewer']
    const bing = INGREDIENT_BY_ID['cn-zibo-bing']
    const without = buildShopping(input, [lamb])
    const withBing = buildShopping(input, [lamb, bing])
    const grams = (result: typeof without) =>
      result.groups
        .flatMap((group) => group.lines)
        .find((line) => line.ingredientId === 'cn-lamb-skewer')?.amount ?? 0
    // 小饼在，肉就只买一半：减半压在肉池总量上，所以「20 串才饱 → 10 串即饱」没有取整噪声
    expect(withBing.bingActive).toBe(true)
    expect(grams(withBing)).toBe(grams(without) / 2)
    expect(withBing.totalMeatGrams).toBe(without.totalMeatGrams / 2)
  })

  it('purchases every pool dish in grams, never in skewers', () => {
    const lines = plan().shopping.groups.flatMap((group) => group.lines)
    expect(lines.filter((line) => line.unit === 'skewer')).toEqual([])
    // 串数只是炉子与竹签的内部账，它不再占用清单上的一行
    expect(plan().shopping.totalSkewers).toBeGreaterThan(0)
    // 烤面筋的单串净重是资料缺口，可克重照样给得出来 —— 缺口不再吃掉整行
    const gluten = requireLine(plan({ dishes: ['cn-wheat-gluten'] }), 'cn-wheat-gluten')
    expect(gluten.amount).toBe(360)
    expect(gluten.unit).toBe('gram')
  })

  it('counts wings in the market counter, not the generic 个', () => {
    const wings = requireLine(plan({ dishes: ['cn-chicken-wing'] }), 'cn-chicken-wing')
    expect(wings.unitLabel?.zh).toBe('只')
    const text = serializeShopping(plan({ dishes: ['cn-chicken-wing'] }), 'zh')
    expect(text).toContain('鸡翅：12 只')
    expect(text).not.toContain('鸡翅：12 个')
  })

  it('inflates American purchases by the cooking yield', () => {
    const brisket = lineOf(plan({ dishes: ['us-brisket'], equipmentMode: 'smoker' }), 'us-brisket')
    expect(brisket?.confidence).toBe('derived')
    // 43 % 出成率：整池 1680 g 熟重口径下生重必须显著更高
    expect(brisket!.amount!).toBeGreaterThan(280 * 6 * 0.4)
  })

  it('drops a dish the selected device cannot cook but keeps the supplies', () => {
    const groups = plan({ dishes: ['us-brisket'], equipmentMode: 'airFryer' }).shopping.groups
    const dishLines = groups
      .flatMap((group) => group.lines)
      .filter((line) => !line.ingredientId.startsWith('sup-'))
    expect(dishLines).toHaveLength(0)
    // 调料与耗材不依赖菜品，永远该在清单上
    expect(groups.map((group) => group.id)).toEqual(['condiment', 'consumable'])
  })

  it('counts per-head dishes by people, not by pool', () => {
    const wings = lineOf(plan({ people: 6, dishes: ['cn-chicken-wing'] }), 'cn-chicken-wing')
    expect(wings?.amount).toBe(12)
    expect(
      lineOf(plan({ people: 12, dishes: ['cn-chicken-wing'] }), 'cn-chicken-wing')?.amount,
    ).toBe(24)
  })
})

describe('supplies', () => {
  const lines = (result: ReturnType<typeof plan>) =>
    result.shopping.groups
      .filter((group) => group.id === 'condiment' || group.id === 'consumable')
      .flatMap((g) => g.lines)

  it('always puts seasonings and tools on the list', () => {
    const ids = lines(plan({ dishes: ['cn-lamb-skewer'] })).map((line) => line.ingredientId)
    expect(ids).toContain('sup-skewer')
    expect(ids).toContain('sup-foil')
    expect(ids).toContain('sup-garlic-chilli')
    expect(ids).toContain('sup-oil')
  })

  it('carries every ready-made seasoning unless told otherwise', () => {
    expect(normalizePlannerInput({ ...BASE, basics: undefined }).basics).toEqual(ALL_BASICS)
  })

  it('takes an unchecked seasoning off the list without touching the tools', () => {
    const result = plan({ basics: ALL_BASICS.filter((id) => id !== 'sup-garlic-chilli') })
    const ids = lines(result).map((line) => line.ingredientId)
    expect(ids).not.toContain('sup-garlic-chilli')
    expect(ids).toContain('sup-skewer')
  })

  it('ignores a basics list that names a dish instead of a seasoning', () => {
    expect(
      normalizePlannerInput({ ...BASE, basics: ['cn-lamb-skewer', 'sup-oil'] }).basics,
    ).toEqual(['sup-oil'])
  })

  it('scales bamboo skewers off the skewer count, not the head count', () => {
    const few = lines(plan({ people: 4, dishes: ['cn-lamb-skewer'] })).find(
      (l) => l.ingredientId === 'sup-skewer',
    )
    const many = lines(plan({ people: 16, dishes: ['cn-lamb-skewer'] })).find(
      (l) => l.ingredientId === 'sup-skewer',
    )
    expect(many!.amount!).toBeGreaterThan(few!.amount!)
    // 每串 1.2 根留替换余量
    expect(few!.amount!).toBeGreaterThanOrEqual(Math.ceil(20 * 1.2))
  })

  it('never lets a derived quantity fall below the minimum pack size', () => {
    for (const line of lines(plan({ people: 1, dishes: ['cn-lamb-skewer'] }))) {
      expect(line.amount, line.ingredientId).toBeGreaterThanOrEqual(1)
      expect(Number.isInteger(line.amount), line.ingredientId).toBe(true)
    }
  })
})

describe('recipe scaling', () => {
  it('scales a meat-based marinade linearly with the meat on the table', () => {
    const orleans = RECIPE_BY_ID['cn-m-orleans']!
    const small = scaleRecipe(orleans, 1000, 4, false)
    const large = scaleRecipe(orleans, 3000, 12, false)
    expect(Number(large.lines[0]!.amount) / Number(small.lines[0]!.amount)).toBeCloseTo(3, 1)
    expect(small.scaledTo.zh).toContain('1 kg')
  })

  it('does not blow up on zero meat', () => {
    expect(scaleRecipe(RECIPE_BY_ID['cn-m-orleans']!, 0, 1, false).lines[0]!.amount).toBe('0')
  })

  it('rounds spoons to one decimal instead of printing 6.72', () => {
    expect(scaleRecipe(RECIPE_BY_ID['cn-m-belly']!, 1500, 6, false).lines[0]!.amount).toBe('6')
  })

  it('keeps blend ratios in parts unscaled', () => {
    const lines = scaleRecipe(RECIPE_BY_ID['cn-m-chicken-blend']!, 4000, 8, false).lines
    expect(lines[1]!.amount).toBe('2')
    expect(lines[2]!.amount).toBe('10')
  })

  it('only surfaces the gluten-free swap when the switch is on', () => {
    const tare = RECIPE_BY_ID['jp-tare-classic']!
    expect(scaleRecipe(tare, 2000, 6, false).glutenFreeSwap).toBeUndefined()
    expect(scaleRecipe(tare, 2000, 6, true).glutenFreeSwap).toBeDefined()
  })

  it('swaps hot rubs for the mild one on a no-spicy table', () => {
    const result = plan({
      dishes: ['cn-lamb-skewer', 'jp-kawa'],
      sauces: ['cn-s-classic', 'cn-s-classic-hot', 'cn-s-classic-light', 'jp-tare-spicy'],
      diets: ['noSpicy'],
    })
    const ids = [...result.marinades, ...result.seasonings].map((item) => item.id)
    expect(ids).not.toContain('cn-s-classic')
    expect(ids).not.toContain('cn-s-classic-hot')
    expect(ids).not.toContain('jp-tare-spicy')
    expect(ids).toContain('cn-s-classic-light')
  })

  it('surfaces only the seasonings that were picked, not everything that fits', () => {
    const ids = plan({
      dishes: ['jp-momo', 'jp-kawa'],
      sauces: ['jp-salt-coarse', 'jp-salt-rock'],
    }).seasonings.map((item) => item.id)
    expect(ids).toEqual(expect.arrayContaining(['jp-salt-coarse', 'jp-salt-rock']))
    // 没勾的tare 一套不会因为点了鸡就冒出来
    expect(ids).not.toContain('jp-tare-classic')
  })

  it('brings the marinade along with the meat without being asked', () => {
    const ids = plan({ dishes: ['cn-pork-belly'], sauces: [] }).marinades.map((item) => item.id)
    expect(ids).toContain('cn-m-belly')
  })
})

describe('timeline', () => {
  it('is sorted from the earliest task to the last', () => {
    const offsets = plan({ dishes: DISHES }).timeline.map((entry) => entry.offsetMin)
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets)
  })

  it('derives every clock time from the chosen grill start', () => {
    const result = plan({ grillStart: '19:00' })
    expect(entryOf(result, 'tl-first-drop')?.clock).toBe('19:00')
    expect(entryOf(result, 'tl-light')?.clock).toBe('18:50')
    expect(entryOf(result, 'tl-check')?.clock).toBe('19:10')
  })

  it('adds the thaw task only when something needs thawing', () => {
    expect(entryOf(plan(), 'tl-thaw')).toBeDefined()
    expect(entryOf(plan({ dishes: ['kr-moksal'] }), 'tl-thaw')).toBeUndefined()
  })

  it('adds the shellfish purge only when shellfish is on the list', () => {
    expect(entryOf(plan({ dishes: ['cn-clam'] }), 'tl-purge')).toBeDefined()
    expect(entryOf(plan({ dishes: ['cn-clam'], diets: ['noSeafood'] }), 'tl-purge')).toBeUndefined()
  })

  it('lets the chosen thaw school drive the printed window', () => {
    const fast = entryOf(plan(), 'tl-thaw')!
    const slow = entryOf(plan({ conflictChoices: { 'thaw-time': 'slow' } }), 'tl-thaw')!
    expect(fast.body.zh).toContain('5–8')
    expect(slow.body.zh).toContain('12–24')
    expect(slow.offsetMin).toBeLessThan(fast.offsetMin)
  })

  it('pulls the marinating lead time from the longest selected marinade', () => {
    const entry = entryOf(plan({ dishes: ['cn-pork-belly'] }), 'tl-marinate')
    expect(entry?.durationMin.kind === 'num' && entry.durationMin.max).toBe(720)
    expect(entry?.clock).toBe('06:30')
  })

  it('groups every entry into a phase', () => {
    const phases = new Set(plan().timeline.map((entry) => entry.phase))
    expect(phases.has('lead')).toBe(true)
    expect(phases.has('grill')).toBe(true)
  })
})

describe('equipment and throughput', () => {
  it('maps headcount onto the documented grill lengths', () => {
    expect(plan({ people: 2 }).equipment.grill.lengthCm).toBe(30)
    expect(plan({ people: 7 }).equipment.grill.lengthCm).toBe(80)
    expect(plan({ people: 18 }).equipment.grill.lengthCm).toBe(150)
  })

  it('rounds the batch count up over the grate capacity', () => {
    const { totalSkewers, capacity, batchCount } = plan({ people: 18 }).equipment.batches
    expect(totalSkewers).toBeGreaterThan(0)
    expect(batchCount).toBe(Math.ceil(totalSkewers / capacity))
  })

  it('paces batches on meat times, not on the fastest vegetable', () => {
    const { perBatchMin } = plan({ dishes: ['cn-lamb-skewer', 'cn-chive'] }).equipment.batches
    expect(perBatchMin.min).toBeGreaterThanOrEqual(3)
    expect(perBatchMin.max).toBeLessThanOrEqual(12)
  })

  it('buys more charcoal for more people', () => {
    expect(plan({ people: 4 }).shopping.charcoalGrams).toBeLessThan(
      plan({ people: 12 }).shopping.charcoalGrams,
    )
  })

  it('lands the 12-person field report of 15 kg at standard appetite', () => {
    expect(plan({ people: 12 }).shopping.charcoalGrams).toBe(15000)
  })

  it('asks for no charcoal on a device that burns none', () => {
    expect(plan({ equipmentMode: 'airFryer' }).shopping.charcoalGrams).toBe(0)
    expect(plan({ equipmentMode: 'gas' }).shopping.charcoalGrams).toBe(0)
    expect(plan({ equipmentMode: 'homeOven' }).shopping.charcoalGrams).toBe(0)
    expect(plan({ equipmentMode: 'stovetopPan' }).shopping.charcoalGrams).toBe(0)
    // 烟熏炉照样烧炭，只是烧得久
    expect(plan({ equipmentMode: 'smoker' }).shopping.charcoalGrams).toBeGreaterThan(0)
  })

  it('drops the charcoal clause from the copy text on a no-charcoal device', () => {
    const gas = plan({ equipmentMode: 'gas' })
    expect(serializeShopping(gas, 'zh')).not.toContain('木炭')
    expect(serializeShopping(gas, 'en')).not.toMatch(/charcoal/i)
    // serializePlan 后面还会列炭种（果木炭这类名字里就带「木炭」），所以只查合计那一行
    const totalsLine = serializePlan(gas, 'zh')
      .split('\n')
      .find((line) => line.startsWith('生肉合计'))
    expect(totalsLine).toBeDefined()
    expect(totalsLine).not.toContain('木炭')
    expect(serializeShopping(plan(), 'zh')).toContain('木炭 7.5 kg · 15 斤')
  })
})

describe('formatCharcoal', () => {
  it('adds the market 斤 reading for Chinese shoppers only', () => {
    expect(formatCharcoal(15000, 'zh')).toBe('15 kg · 30 斤')
    expect(formatCharcoal(15000, 'en')).toBe('15 kg')
    expect(formatCharcoal(15000, 'en')).not.toContain('斤')
  })

  it('keeps sub-kilogram and zero amounts on the gram scale', () => {
    expect(formatCharcoal(0, 'zh')).toBe('0 g')
    expect(formatCharcoal(0, 'en')).toBe('0 g')
    expect(formatCharcoal(900, 'zh')).toBe('900 g')
  })
})

describe('serialization', () => {
  it('emits both languages without leaking external URLs', () => {
    const result = plan({ people: 8 })
    const zh = serializePlan(result, 'zh')
    const en = serializePlan(result, 'en')
    expect(zh).toContain('采购清单')
    expect(zh).toContain('8 人 · 6 道菜')
    expect(en).toContain('Shopping list')
    for (const text of [zh, en]) {
      expect(text).not.toMatch(/https?:\/\//)
    }
  })

  it('annotates a condiment with its job and leaves the plain essentials bare', () => {
    const text = serializeShopping(plan(), 'zh')
    expect(text).toContain('孜然粒／孜然粉 · 牛羊肉撒料')
    // 盐没有任何括注 —— 括注缺席就是"必买"
    expect(text).toMatch(/^盐：1 包$/m)
  })

  it('stopped printing 推算 markers on the list', () => {
    expect(serializeShopping(plan(), 'zh')).not.toContain('推算')
  })

  it('is stable for the same input', () => {
    const first = serializePlan(plan(), 'zh')
    expect(serializePlan(plan(), 'zh')).toBe(first)
  })
})

describe('quantity overrides', () => {
  it('zeroing a row marks it dropped but keeps it on the list', () => {
    const result = plan({ overrides: { 'sup-skewer': 0 } })
    const line = requireLine(result, 'sup-skewer')
    expect(line.amount).toBe(0)
    expect(isDropped(line)).toBe(true)
    expect(isAdjusted(line)).toBe(true)
    expect(line.baseAmount ?? 0).toBeGreaterThan(0)
    expect(selectableLineIds(result)).not.toContain('sup-skewer')
  })

  it('leaves zeroed rows out of the copy text in both serialisers', () => {
    const result = plan({ overrides: { 'cn-lamb-skewer': 0, 'sup-skewer': 0 } })
    const shopping = serializeShopping(result, 'zh')
    const whole = serializePlan(result, 'zh')
    expect(shopping).not.toContain('羊肉串')
    expect(shopping).not.toContain('竹签')
    expect(whole).not.toContain('羊肉串')
    // 时间线里的"竹签泡水 30 分钟"是步骤说明，不是采购行，不该被当成清单残留
    expect(shopping).toContain('数量已置 0')
    expect(whole).toContain('数量已置 0')
    expect(serializeShopping(plan(), 'zh')).not.toContain('数量已置 0')
  })

  it('does not redistribute the pool or shrink the charcoal when a row is zeroed', () => {
    const zeroed = plan({ overrides: { 'cn-lamb-skewer': 0 } })
    expect(zeroed.shopping.totalMeatGrams).toBeCloseTo(280 * 6, -1)
    expect(zeroed.shopping.charcoalGrams).toBe(plan().shopping.charcoalGrams)
  })

  it('raises a row above the engine default without moving the baseline', () => {
    const result = plan({ overrides: { 'sup-skewer': 200 } })
    const line = requireLine(result, 'sup-skewer')
    expect(line.amount).toBe(200)
    expect(line.baseAmount).toBe(requireLine(plan(), 'sup-skewer').baseAmount)
    expect(line.baseAmount ?? 0).toBeLessThan(200)
  })

  it('counts only the rows the user actually touched', () => {
    expect(adjustedLineCount(plan())).toBe(0)
    const result = plan({ overrides: { 'sup-skewer': 200 } })
    expect(adjustedLineCount(result)).toBe(1)
    expect(droppedLineCount(result)).toBe(0)
  })

  it('steps each unit by the size you really shop in', () => {
    expect(stepForUnit('gram')).toBe(50)
    expect(stepForUnit('skewer')).toBe(5)
    expect(stepForUnit('stick')).toBe(5)
    expect(stepForUnit('bottle')).toBe(1)
  })

  it('never steps a quantity below zero', () => {
    const line = requireLine(plan(), 'sup-skewer')
    expect(stepAmount({ ...line, amount: 0 }, -5)).toBe(0)
  })
})

describe('assertPlanInvariants', () => {
  it('passes across headcount and appetite', () => {
    for (const people of [1, 6, 20]) {
      for (const appetite of ['light', 'standard', 'heavy'] as const) {
        expect(assertPlanInvariants(plan({ people, appetite })), `${people}/${appetite}`).toEqual(
          [],
        )
      }
    }
  })

  it('passes for every dish on a device it supports', () => {
    for (const item of Object.values(INGREDIENT_BY_ID)) {
      const mode = item.cook.windows[0]!.mode
      const result = plan({ dishes: [item.id], equipmentMode: mode })
      expect(result.shopping.groups.length, item.id).toBeGreaterThan(0)
      expect(assertPlanInvariants(result), item.id).toEqual([])
    }
  })

  it('grows monotonically with the headcount', () => {
    expect(plan({ people: 16 }).shopping.totalMeatGrams).toBeGreaterThan(
      plan({ people: 2 }).shopping.totalMeatGrams,
    )
    expect(plan({ people: 16 }).shopping.charcoalGrams).toBeGreaterThan(
      plan({ people: 2 }).shopping.charcoalGrams,
    )
  })
})

describe('formatMass', () => {
  it('switches to kilograms above a thousand grams', () => {
    expect(formatMass(450)).toBe('450 g')
    expect(formatMass(2800)).toBe('2.8 kg')
  })
})

describe('custom items', () => {
  const beer: CustomItem = {
    id: 'custom-1',
    name: '啤酒',
    amount: 6,
    unit: 'piece',
    group: 'condiment',
  }

  it('drops nameless, negative, bogus-unit and bogus-group entries and re-reads 串 as 件', () => {
    const result = normalizePlannerInput({
      ...BASE,
      customs: [
        { id: 'custom-1', name: '  雪碧 ', amount: 3, unit: 'bottle', group: 'condiment' },
        { id: 'custom-2', name: '   ', amount: 3, unit: 'piece', group: 'condiment' },
        { id: 'custom-3', name: '负数', amount: -2, unit: 'piece', group: 'condiment' },
        {
          id: 'custom-4',
          name: '乱单位',
          amount: 2,
          unit: 'crate' as ServeUnit,
          group: 'condiment',
        },
        { id: 'custom-5', name: '没数量', amount: Number.NaN, unit: 'piece', group: 'condiment' },
        { id: 'custom-6', name: '烤串', amount: 20, unit: 'skewer', group: 'mammal' },
        {
          id: 'custom-7',
          name: '没分组',
          amount: 2,
          unit: 'piece',
          group: 'drinks' as PurchaseGroupId,
        },
      ],
    })
    expect(result.customs).toEqual([
      { id: 'custom-1', name: '雪碧', amount: 3, unit: 'bottle', group: 'condiment' },
      { id: 'custom-6', name: '烤串', amount: 20, unit: 'piece', group: 'mammal' },
    ])
  })

  it('keeps an id the engine has never seen exactly as written', () => {
    const result = normalizePlannerInput({
      ...BASE,
      customs: [{ id: 'mine-77', name: '可乐', amount: 2, unit: 'bottle', group: 'condiment' }],
    })
    expect(result.customs.map((item) => item.id)).toEqual(['mine-77'])
  })

  it('hands out the next free custom id past the highest suffix', () => {
    expect(nextCustomId([])).toBe('custom-1')
    expect(nextCustomId([beer])).toBe('custom-2')
    // 删掉中间一条之后，新 id 仍越过已占用的后缀
    expect(
      nextCustomId([
        { id: 'custom-2', name: 'a', amount: 1, unit: 'piece', group: 'mammal' },
        { id: 'mine-9', name: 'b', amount: 1, unit: 'piece', group: 'mammal' },
      ]),
    ).toBe('custom-3')
  })

  it('joins the shopping group it was added to', () => {
    const result = plan({ customs: [beer] })
    const group = result.shopping.groups.find((entry) => entry.id === 'condiment')
    const line = group?.lines.find((entry) => entry.ingredientId === 'custom-1')
    // 自定义行并进所属分组末尾，不再单列一张卡
    expect(result.shopping.groups).toHaveLength(plan().shopping.groups.length)
    expect(line?.amount).toBe(6)
    // baseAmount === amount：步进器与「置 0 = 不买」对自定义行免费生效
    expect(line?.baseAmount).toBe(6)
    expect(line?.name).toEqual({ zh: '啤酒', en: '啤酒' })
    expect(serializeShopping(result, 'zh')).toContain('啤酒：6 个')
    expect(serializePlan(result, 'zh')).toContain('啤酒')
  })

  it('gives a group of its own when that group has nothing else on the list', () => {
    const result = plan({ customs: [{ ...beer, group: 'soy' }] })
    const ids = result.shopping.groups.map((entry) => entry.id)
    expect(ids).toContain('soy')
    // 插在蔬菜之后、主食之前，而不是堆到清单末尾
    expect(ids.indexOf('soy')).toBe(ids.indexOf('vegetable') + 1)
    expect(result.shopping.groups.find((entry) => entry.id === 'soy')?.lines).toHaveLength(1)
  })

  it('zeroing a custom row takes it out of the copy text like any other row', () => {
    const result = plan({ customs: [beer], overrides: { 'custom-1': 0 } })
    expect(requireLine(result, 'custom-1').amount).toBe(0)
    expect(serializeShopping(result, 'zh')).not.toContain('啤酒')
    expect(serializePlan(result, 'zh')).not.toContain('啤酒')
  })

  it('leaves meat, skewer and charcoal totals alone when a custom item joins', () => {
    const plain = plan()
    const withCustom = plan({ customs: [beer] })
    expect(withCustom.shopping.totalMeatGrams).toBe(plain.shopping.totalMeatGrams)
    expect(withCustom.shopping.totalSkewers).toBe(plain.shopping.totalSkewers)
    expect(withCustom.shopping.charcoalGrams).toBe(plain.shopping.charcoalGrams)
    expect(assertPlanInvariants(withCustom)).toEqual([])
  })

  it('is not offered 串 as a unit to shop for', () => {
    expect(CUSTOM_UNIT_CHOICES).not.toContain('skewer')
    expect(CUSTOM_UNIT_CHOICES).toContain('piece')
  })
})

describe('referenceRecipe', () => {
  it('keeps a meat-based mix at its sourced ratio and names that base', () => {
    const result = referenceRecipe(RECIPE_BY_ID['cn-m-xinjiang'])
    expect(result.scaledTo).toEqual({ zh: '每 2 kg 肉', en: 'per 2 kg of meat' })
    expect(result.lines.map((line) => line.amount)).toEqual(['150', '40'])
  })

  it('shows a batch mix with its own covers note instead of a scaled figure', () => {
    expect(referenceRecipe(RECIPE_BY_ID['cn-s-classic']).scaledTo.zh).toBe('约够 2–3 kg 肉')
  })

  it('does not scale with the meat on the table', () => {
    const recipe = RECIPE_BY_ID['cn-m-xinjiang']
    const bigTable = scaleRecipe(recipe, 6000, 6, false)
    expect(referenceRecipe(recipe).lines.map((line) => line.amount)).toEqual(['150', '40'])
    expect(bigTable.lines.map((line) => line.amount)).toEqual(['450', '120'])
  })
})

describe('apportionPieces', () => {
  it('splits evenly between equal claims', () => {
    expect(apportionPieces([1, 1, 1], 9)).toEqual([3, 3, 3])
  })

  it('keeps bigger claims ahead without hard-coding their lead', () => {
    expect(apportionPieces([12, 6], 12, 1)).toEqual([8, 4])
    expect(apportionPieces([12, 6, 12], 12, 1)).toEqual([5, 3, 4])
  })

  it('never lets an existing dish grow when another one joins', () => {
    // 除数法的卖点：house / population 单调，不会像最大余额法那样触发 Alabama 悖论
    const two = apportionPieces([12, 6], 12, 1)
    const three = apportionPieces([12, 6, 12], 12, 1)
    expect(three[0]).toBeLessThan(two[0])
    expect(three[1]).toBeLessThan(two[1])
  })

  it('never drops below the floor even when that overshoots the budget', () => {
    // 1 个人点 5 道按件买的菜：预算只有 2 件，但菜市场买不到 0.4 只鸡翅
    expect(apportionPieces([2, 1, 1, 1, 1], 2, 1)).toEqual([1, 1, 1, 1, 1])
  })

  it('returns nothing when there is no budget or nothing to split', () => {
    expect(apportionPieces([], 10)).toEqual([])
    expect(apportionPieces([5, 5], 0)).toEqual([0, 0])
  })
})

describe('unit choices', () => {
  const lineOf = (result: ReturnType<typeof plan>, id: string) =>
    result.shopping.groups
      .flatMap((group) => group.lines)
      .find((entry) => entry.ingredientId === id)

  it('relabels a line without touching the number', () => {
    const plain = plan({ dishes: ['cn-bacon'] })
    const swapped = plan({ dishes: ['cn-bacon'], unitChoices: { 'cn-bacon': 'pack' } })
    expect(lineOf(plain, 'cn-bacon')?.amount).toBe(18)
    expect(lineUnitLabel(lineOf(plain, 'cn-bacon') as ShoppingLine, 'zh')).toBe('片')
    expect(lineOf(swapped, 'cn-bacon')?.amount).toBe(18)
    expect(lineUnitLabel(lineOf(swapped, 'cn-bacon') as ShoppingLine, 'zh')).toBe('包')
  })

  it('drops unknown line ids and units the market does not sell by', () => {
    const result = normalizePlannerInput({
      ...BASE,
      unitChoices: { 'cn-bacon': 'slice', 'cn-nope': 'pack', 'jp-momo': 'skewer' } as Record<
        string,
        ServeUnit
      >,
    })
    // skewer 是"炉子上的一串"，不是菜市场买法，所以归一化阶段就丢掉
    expect(result.unitChoices).toEqual({ 'cn-bacon': 'slice' })
  })

  it('leaves every other line on its sourced counter', () => {
    const result = plan({ dishes: ['cn-bacon', 'cn-sausage'], unitChoices: { 'cn-bacon': 'pack' } })
    expect(lineOf(result, 'cn-sausage')?.unit).toBe('stick')
  })
})

describe('per-piece dilution', () => {
  function lineOf(result: ReturnType<typeof plan>, id: string): ShoppingLine {
    const line = result.shopping.groups
      .flatMap((group) => group.lines)
      .find((entry) => entry.ingredientId === id)
    expect(line, id).toBeDefined()
    return line as ShoppingLine
  }

  const totalOf = (result: ReturnType<typeof plan>, ids: string[]) =>
    ids.reduce((sum, id) => sum + (lineOf(result, id).amount ?? 0), 0)

  it('leaves a lone per-piece dish at its sourced per-head amount', () => {
    // 鸡翅人均 2 只 × 6 人；同池只有一道时无需摊薄，行为与改动前一致
    expect(lineOf(plan({ dishes: ['cn-chicken-wing'] }), 'cn-chicken-wing').amount).toBe(12)
  })

  it('shrinks every dish when another per-piece dish joins the same pool', () => {
    const two = plan({ dishes: ['cn-chicken-wing', 'cn-chicken-drumstick'] })
    expect(lineOf(two, 'cn-chicken-wing').amount).toBe(8)
    expect(lineOf(two, 'cn-chicken-drumstick').amount).toBe(4)

    const three = plan({
      dishes: ['cn-chicken-wing', 'cn-chicken-drumstick', 'cn-chicken-feet'],
    })
    expect(lineOf(three, 'cn-chicken-wing').amount).toBe(5)
    expect(lineOf(three, 'cn-chicken-drumstick').amount).toBe(3)
    expect(lineOf(three, 'cn-chicken-feet').amount).toBe(4)
  })

  it('caps the pool at the largest single dish instead of summing the picks', () => {
    const ids = ['cn-chicken-wing', 'cn-chicken-drumstick', 'cn-chicken-feet']
    expect(totalOf(plan({ dishes: ids }), ids)).toBe(12)
  })

  it('keeps the diluted figure as the default, so no row looks hand-edited', () => {
    const result = plan({ dishes: ['cn-chicken-wing', 'cn-chicken-drumstick'] })
    for (const id of ['cn-chicken-wing', 'cn-chicken-drumstick']) {
      const line = lineOf(result, id)
      expect(line.baseAmount).toBe(line.amount)
      expect(isAdjusted(line)).toBe(false)
    }
    expect(adjustedLineCount(result)).toBe(0)
  })

  it('dilutes across the meat pool, which covers both 畜肉 and 禽肉', () => {
    // 香肠与鸡翅抢的是同一个肉池，所以点了鸡翅就要少买香肠 —— 这是摊薄，不是串场
    const mixed = plan({ dishes: ['cn-sausage', 'cn-chicken-wing', 'cn-chicken-drumstick'] })
    expect(lineOf(mixed, 'cn-sausage').amount).toBe(4)
    expect(lineOf(mixed, 'cn-chicken-wing').amount).toBe(5)
    expect(lineOf(mixed, 'cn-chicken-drumstick').amount).toBe(3)
  })

  it('leaves dishes in other pools alone', () => {
    // 海鲜池独立：生蚝人均 3 只 × 6 人，禽肉点多少都不该动它
    const plain = plan({ dishes: ['cn-oyster'] })
    const mixed = plan({ dishes: ['cn-oyster', 'cn-chicken-wing', 'cn-chicken-drumstick'] })
    expect(lineOf(plain, 'cn-oyster').amount).toBe(18)
    expect(lineOf(mixed, 'cn-oyster').amount).toBe(18)
  })
})
