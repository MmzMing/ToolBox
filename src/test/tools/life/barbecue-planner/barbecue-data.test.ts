import { describe, expect, it } from 'vitest'

import {
  CHARCOAL_TYPES,
  CONFLICTS,
  DISH_GROUP_ORDER,
  GRILL_TIERS,
  INGREDIENTS,
  INGREDIENT_BY_ID,
  POOL_OF_GROUP,
  PURCHASE_GROUPS,
  RECIPE_KIND_LABELS,
  RECIPES,
  RECIPE_BY_ID,
  SUPPLIES,
  TIMELINE_STEPS,
} from '@/tools/life/barbecue-planner/data/index'
import { isNum } from '@/tools/life/barbecue-planner/measure'
import type { LocalText } from '@/tools/life/barbecue-planner/types'

const ALL_GROUP_IDS = PURCHASE_GROUPS.map((item) => item.id)

function collectLocalTexts(node: unknown, found: LocalText[] = []): LocalText[] {
  if (node === null || typeof node !== 'object') {
    return found
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectLocalTexts(item, found)
    }
    return found
  }
  const record = node as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length === 2 && typeof record.zh === 'string' && typeof record.en === 'string') {
    found.push({ zh: record.zh, en: record.en })
    return found
  }
  for (const value of Object.values(record)) {
    collectLocalTexts(value, found)
  }
  return found
}

describe('dish picker coverage', () => {
  it('puts every ingredient into a pickable dish group', () => {
    const pickable = new Set<string>(DISH_GROUP_ORDER)
    const hidden = INGREDIENTS.filter((item) => !pickable.has(item.group)).map((item) => item.id)
    expect(hidden).toEqual([])
  })

  it('lists the dish groups in shopping order', () => {
    expect([...DISH_GROUP_ORDER]).toEqual([
      'mammal',
      'poultry',
      'seafood',
      'vegetable',
      'soy',
      'staple',
    ])
  })

  it('gives every dish at least one cooking window', () => {
    const windowless = INGREDIENTS.filter((item) => item.cook.windows.length === 0).map(
      (item) => item.id,
    )
    expect(windowless).toEqual([])
  })

  it('restricts only the slow-smoke cuts to the smoker', () => {
    // 牛胸、猪肩、猪小肋排确实没法在烤网上十几分钟搞定，这是数据而非缺陷
    const noCharcoal = INGREDIENTS.filter(
      (item) => !item.cook.windows.some((window) => window.mode === 'charcoal'),
    ).map((item) => item.id)
    expect(noCharcoal.sort()).toEqual(['us-baby-back-ribs', 'us-brisket', 'us-pork-butt'])
  })

  it('spans all four cuisines across the dish list', () => {
    const cuisines = new Set(INGREDIENTS.map((item) => item.cuisine))
    expect([...cuisines].sort()).toEqual(['cn', 'jp', 'kr', 'us'])
  })
})

describe('ingredient catalogue', () => {
  it('keeps every id unique', () => {
    const ids = INGREDIENTS.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('assigns every ingredient to a declared purchase group', () => {
    for (const item of INGREDIENTS) {
      expect(ALL_GROUP_IDS).toContain(item.group)
    }
  })

  it('references only marinades that exist', () => {
    const dangling: string[] = []
    for (const item of INGREDIENTS) {
      for (const id of item.marinadeIds) {
        if (!RECIPE_BY_ID[id]) {
          dangling.push(`${item.id} -> ${id}`)
        }
      }
    }
    expect(dangling).toEqual([])
  })

  it('gives every seasoning at least one dish it fits', () => {
    const present = new Set(INGREDIENTS.map((item) => item.id))
    const orphans = RECIPES.filter(
      (recipe) => recipe.kind !== 'marinade' && !recipe.appliesTo.some((id) => present.has(id)),
    ).map((recipe) => recipe.id)
    expect(orphans).toEqual([])
  })

  it('gives every pool ingredient a group that maps to a shopping pool', () => {
    for (const item of INGREDIENTS) {
      if (item.qty.mode === 'pool') {
        expect(POOL_OF_GROUP[item.group]).toBeDefined()
      }
    }
  })

  it('declares a core temperature for every raw-meat item', () => {
    const meatGroups = ['mammal', 'poultry', 'seafood']
    const missing = INGREDIENTS.filter(
      (item) =>
        meatGroups.includes(item.group) &&
        item.cook.windows.some((w) => w.minutes.max > 0) &&
        !item.coreTempId,
    ).map((item) => item.id)
    expect(missing).toEqual([])
  })

  it('keeps every cooking window in a sane order', () => {
    for (const item of INGREDIENTS) {
      expect(item.cook.windows.length).toBeGreaterThan(0)
      for (const window of item.cook.windows) {
        expect(window.minutes.min).toBeLessThanOrEqual(window.minutes.max)
      }
    }
  })
})

describe('recipes', () => {
  it('keeps every recipe id unique', () => {
    const ids = RECIPES.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('applies only to ingredients that exist', () => {
    const dangling: string[] = []
    for (const recipe of RECIPES) {
      for (const id of recipe.appliesTo) {
        if (!INGREDIENT_BY_ID[id]) {
          dangling.push(`${recipe.id} -> ${id}`)
        }
      }
    }
    expect(dangling).toEqual([])
  })

  it('declares a positive scaling basis', () => {
    for (const recipe of RECIPES) {
      if (recipe.base.kind === 'meat') {
        expect(recipe.base.baseGrams).toBeGreaterThan(0)
      }
      if (recipe.base.kind === 'people') {
        expect(recipe.base.basePeople).toBeGreaterThan(0)
      }
    }
  })
})

describe('supplies', () => {
  it('gives every freely pickable seasoning kind a section in the picker', () => {
    const labelled = new Set(RECIPE_KIND_LABELS.map((item) => item.id))
    const unlabelled = RECIPES.filter(
      (recipe) => recipe.kind !== 'marinade' && !labelled.has(recipe.kind),
    ).map((recipe) => recipe.id)
    expect(unlabelled).toEqual([])
  })

  it('says what each annotated condiment is for, in both languages', () => {
    const annotated = SUPPLIES.filter((item) => item.use)
    expect(annotated.length).toBeGreaterThanOrEqual(8)
    for (const item of annotated) {
      expect(item.use?.zh.trim().length).toBeGreaterThan(0)
      expect(item.use?.en.trim().length).toBeGreaterThan(0)
    }
    // 纯蘸酱与基础必需品刻意留白 —— 没有括注本身就是"必买"
    expect(SUPPLIES.filter((item) => !item.use).length).toBeGreaterThan(0)
  })

  it('never asks for less than one unit of anything', () => {
    for (const item of SUPPLIES) {
      expect(item.min, item.id).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('data honesty', () => {
  it('writes every bilingual field in both languages', () => {
    const texts = [
      ...collectLocalTexts(INGREDIENTS),
      ...collectLocalTexts(RECIPES),
      ...collectLocalTexts(SUPPLIES),
      ...collectLocalTexts(TIMELINE_STEPS),
    ]
    expect(texts.length).toBeGreaterThan(250)
    for (const text of texts) {
      expect(text.zh.trim().length).toBeGreaterThan(0)
      expect(text.en.trim().length).toBeGreaterThan(0)
    }
  })

  it('keeps every market counter a one-character Chinese word with an English twin', () => {
    // 量词是一个语素，多一个字就说明有人把「只装」这种包装描述塞了进来
    const counters = INGREDIENTS.flatMap((item) =>
      item.counter ? [[item.id, item.counter] as const] : [],
    )
    expect(counters.length).toBeGreaterThan(0)
    for (const [id, counter] of counters) {
      expect(counter.zh.trim().length, id).toBe(1)
      expect(counter.en.trim().length, id).toBeGreaterThan(0)
    }
  })

  it('never leaves Chinese prose on the English side of any string', () => {
    const texts = [
      ...collectLocalTexts(INGREDIENTS),
      ...collectLocalTexts(RECIPES),
      ...collectLocalTexts(SUPPLIES),
      ...collectLocalTexts(TIMELINE_STEPS),
      ...collectLocalTexts(CONFLICTS),
      ...collectLocalTexts(CHARCOAL_TYPES),
    ]
    // 专名里的日/韩字允许出现，但成句的中文说明不许漏进 en
    const offenders = texts
      .filter((text) => /[一-鿿]{4,}/.test(text.en))
      .map((text) => text.en.slice(0, 60))
    expect(offenders).toEqual([])
  })

  it('explains every derived figure and every gap', () => {
    const unjustified: string[] = []
    for (const item of INGREDIENTS) {
      const measures = [
        item.skewerGrams,
        item.yieldPct,
        ...(item.qty.mode === 'perPerson' ? Object.values(item.qty.perPerson) : []),
      ]
      for (const measure of measures) {
        // 可选量缺席时不该被算作"缺依据"
        if (measure && measure.confidence !== 'authoritative' && !measure.basis) {
          unjustified.push(item.id)
        }
      }
    }
    for (const recipe of RECIPES) {
      for (const entry of recipe.items) {
        if (entry.qty.confidence !== 'authoritative' && !entry.qty.basis) {
          unjustified.push(recipe.id)
        }
      }
    }
    expect(unjustified).toEqual([])
  })

  it('keeps gap measures free of invented numbers', () => {
    const gaps = [
      ...INGREDIENTS.flatMap((item) => [item.skewerGrams, item.yieldPct]),
      ...INGREDIENTS.filter((item) => item.qty.mode === 'perPerson').flatMap((item) =>
        item.qty.mode === 'perPerson' ? Object.values(item.qty.perPerson) : [],
      ),
    ].filter(
      (measure): measure is NonNullable<typeof measure> =>
        measure !== undefined && measure.kind === 'gap',
    )
    expect(gaps.length).toBeGreaterThan(0)
    for (const entry of gaps) {
      expect(entry.kind).toBe('gap')
      expect(entry.basis?.zh.length).toBeGreaterThan(0)
    }
  })
})

describe('equipment, charcoal and conflicts', () => {
  it('spans 1 to 20 people with contiguous grill tiers', () => {
    expect(GRILL_TIERS[0].people.min).toBe(1)
    expect(GRILL_TIERS[GRILL_TIERS.length - 1].people.max).toBe(20)
    for (let i = 1; i < GRILL_TIERS.length; i++) {
      expect(GRILL_TIERS[i].people.min).toBe(GRILL_TIERS[i - 1].people.max + 1)
    }
  })

  it('gives the 150 cm tier the only sourced batch capacity', () => {
    const largest = GRILL_TIERS.find((tier) => tier.lengthCm === 150)
    expect(isNum(largest?.batchSkewers)).toBe(true)
    expect(largest?.batchSkewers?.kind === 'num' && largest.batchSkewers.confidence).toBe(
      'authoritative',
    )
  })

  it('names the burning window of every charcoal type', () => {
    for (const charcoal of CHARCOAL_TYPES) {
      expect(isNum(charcoal.burnHours)).toBe(true)
    }
  })

  it('offers at least two variants for every documented conflict', () => {
    for (const conflict of CONFLICTS) {
      expect(conflict.variants.length).toBeGreaterThanOrEqual(2)
      expect(conflict.variants.some((variant) => variant.id === conflict.defaultVariantId)).toBe(
        true,
      )
    }
  })

  it('tags every timeline step with a phase', () => {
    const phases = new Set(['lead', 'ready', 'grill', 'close'])
    for (const step of TIMELINE_STEPS) {
      expect(phases.has(step.phase), step.id).toBe(true)
    }
  })

  it('sorts the timeline steps by lead time', () => {
    const offsets = TIMELINE_STEPS.map((step) => step.offsetMin)
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets)
  })
})
