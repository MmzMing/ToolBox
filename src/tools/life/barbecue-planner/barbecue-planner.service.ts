import { CONFLICTS } from './data/index'
import { activeGroups, droppedLineCount, formatCharcoal, formatMass, lineUnitLabel } from './engine'
import { formatMinutes, formatOffset, isNum } from './measure'
import type { BarbecuePlan, LocalText, ShoppingLine } from './types'

export * from './engine'
export { CONFLICTS, UNIT_LABELS } from './data/index'
export { formatMinutes, formatOffset, isNum, midpoint } from './measure'
export type { BarbecuePlan, RecipePlan, ShoppingGroup, ShoppingLine, TimelineEntry } from './types'

export function pick(text: LocalText, lang: 'zh' | 'en'): string {
  return text[lang]
}

/**
 * 清单里的量：null 表示资料缺口，输出"资料缺口"而不是编一个 0。
 * 调料名字后面跟一句用途；纯蘸酱没有括注 —— 括注缺席就是必需。
 */
function lineText(line: ShoppingLine, lang: 'zh' | 'en'): string {
  const name = line.use ? `${line.name[lang]} · ${line.use[lang]}` : line.name[lang]
  if (line.amount === null) {
    return lang === 'zh' ? `${name}：资料缺口` : `${name}: no sourced figure`
  }
  const amount = `${line.amount} ${lineUnitLabel(line, lang)}`
  return lang === 'zh' ? `${name}：${amount}` : `${name}: ${amount}`
}

/**
 * 把整份方案压成纯文本，供复制与下载。
 * 只依赖 plan 与 lang，不碰 DOM，所以单测可以直接断言输出片段。
 */
export function serializePlan(plan: BarbecuePlan, lang: 'zh' | 'en'): string {
  const zh = lang === 'zh'
  const out: string[] = []
  const { input } = plan

  out.push(
    lang === 'zh'
      ? `烧烤方案 · ${input.people} 人 · ${input.dishes.length} 道菜`
      : `BBQ plan · ${input.people} people · ${input.dishes.length} dishes`,
  )

  out.push('', zh ? '## 采购清单' : '## Shopping list')
  const dropped = droppedLineCount(plan)
  if (dropped > 0) {
    out.push(
      zh
        ? `其中 ${dropped} 项数量已置 0，本次不买。`
        : `${dropped} item(s) are set to 0 and are not being bought.`,
    )
  }
  for (const group of activeGroups(plan)) {
    out.push(zh ? `\n### ${group.label.zh}` : `\n### ${group.label.en}`)
    for (const line of group.lines) {
      out.push(`- ${lineText(line, lang)}`)
    }
  }
  const totals = [
    zh
      ? `生肉合计 ${formatMass(plan.shopping.totalMeatGrams)}`
      : `Total raw meat ${formatMass(plan.shopping.totalMeatGrams)}`,
    zh ? `肉串合计 ${plan.shopping.totalSkewers} 串` : `${plan.shopping.totalSkewers} skewers`,
  ]
  // 不用炭的设备炭量为 0，这一节整句消失而不是写着"木炭 0 g"
  if (plan.shopping.charcoalGrams > 0) {
    totals.push(
      zh
        ? `木炭 ${formatCharcoal(plan.shopping.charcoalGrams, 'zh')}`
        : `charcoal ${formatCharcoal(plan.shopping.charcoalGrams, 'en')}`,
    )
  }
  out.push('', totals.join(' · '))

  const recipeBlock = zh ? '## 腌料 / 撒料·刷酱·蘸料' : '## Marinades, rubs and sauces'
  out.push('', recipeBlock)
  for (const recipe of [...plan.marinades, ...plan.seasonings]) {
    out.push('', `- ${pick(recipe.name, lang)} (${pick(recipe.scaledTo, lang)})`)
    out.push(
      `  ${recipe.lines.map((item) => `${pick(item.name, lang)} ${item.amount}${item.unit === 'to-taste' ? '' : ' ' + item.unit}`).join(' / ')}`,
    )
    if (recipe.timing) {
      out.push(`  ${zh ? '时机' : 'timing'}: ${pick(recipe.timing, lang)}`)
    }
    if (recipe.glutenFreeSwap) {
      out.push(`  ${zh ? '无麸质' : 'gluten-free'}: ${pick(recipe.glutenFreeSwap, lang)}`)
    }
  }

  out.push('', zh ? '## 时间线' : '## Timeline')
  for (const entry of plan.timeline) {
    const duration = isNum(entry.durationMin)
      ? ` [${formatMinutes({ min: entry.durationMin.min, max: entry.durationMin.max })}]`
      : ''
    out.push(`- ${formatOffset(entry.offsetMin)} ${pick(entry.title, lang)}${duration}`)
    if (entry.body[lang]) {
      out.push(`  ${entry.body[lang]}`)
    }
  }

  const equipment = plan.equipment
  out.push(
    '',
    zh ? '## 炉具与炭' : '## Grill and charcoal',
    zh
      ? `- 建议炉长 ${equipment.grill.lengthCm} cm（适用 ${equipment.grill.people.min}–${equipment.grill.people.max} 人）`
      : `- Suggested grate ${equipment.grill.lengthCm} cm (serves ${equipment.grill.people.min}–${equipment.grill.people.max})`,
    zh
      ? `- 批次产能：${equipment.batches.batchCount} 批 × 每批约 ${equipment.batches.capacity} 串，烤制窗口约 ${formatMinutes(equipment.batches.totalMin)}`
      : `- Throughput: ${equipment.batches.batchCount} batches × ~${equipment.batches.capacity} skewers, window ~${formatMinutes(equipment.batches.totalMin)}`,
    `- ${zh ? '炭' : 'charcoal'}: ${equipment.charcoalOptions.map((c) => pick(c.name, lang)).join(' / ')}`,
  )

  out.push('', zh ? '## 安全' : '## Safety')
  for (const notice of plan.safety) {
    out.push(`- ${pick(notice.title, lang)}: ${pick(notice.body, lang)}`)
  }

  out.push(
    '',
    zh ? '## 来源分歧（本工具不做取舍）' : '## Where the sources disagree (no verdict applied)',
  )
  for (const conflict of CONFLICTS) {
    const chosen = conflict.variants.find((v) => v.id === input.conflictChoices[conflict.id])
    out.push(`- ${pick(conflict.title, lang)} → ${chosen ? pick(chosen.label, lang) : '-'}`)
  }

  return out.join('\n')
}

/** 只导出采购清单，供清单卡片单独复制 */
export function serializeShopping(plan: BarbecuePlan, lang: 'zh' | 'en'): string {
  const out: string[] = [
    lang === 'zh'
      ? `烧烤采购清单 · ${plan.input.people} 人`
      : `BBQ shopping list · ${plan.input.people} people`,
  ]
  const dropped = droppedLineCount(plan)
  if (dropped > 0) {
    out.push(
      lang === 'zh'
        ? `其中 ${dropped} 项数量已置 0，本次不买。`
        : `${dropped} item(s) are set to 0 and not being bought.`,
    )
  }
  for (const group of activeGroups(plan)) {
    out.push('', lang === 'zh' ? `【${group.label.zh}】` : `[${group.label.en}]`)
    for (const line of group.lines) {
      out.push(lineText(line, lang))
    }
  }
  const tail: string[] = []
  if (plan.shopping.charcoalGrams > 0) {
    tail.push(
      lang === 'zh'
        ? `木炭 ${formatCharcoal(plan.shopping.charcoalGrams, 'zh')}`
        : `Charcoal ${formatCharcoal(plan.shopping.charcoalGrams, 'en')}`,
    )
  }
  tail.push(
    lang === 'zh'
      ? `生肉合计 ${formatMass(plan.shopping.totalMeatGrams)}`
      : `raw meat ${formatMass(plan.shopping.totalMeatGrams)}`,
  )
  out.push('', tail.join(' · '))
  return out.join('\n')
}

/** 供 UI 与单测共用的健康检查：正常应返回空数组 */
export function assertPlanInvariants(plan: BarbecuePlan): string[] {
  const problems: string[] = []
  if (plan.shopping.groups.length === 0) {
    problems.push('shopping list is empty')
  }
  if (plan.timeline.length === 0) {
    problems.push('timeline is empty')
  }
  if (plan.input.people < 1 || plan.input.people > 20) {
    problems.push(`people out of range: ${plan.input.people}`)
  }
  let previous = Number.NEGATIVE_INFINITY
  for (const entry of plan.timeline) {
    if (entry.offsetMin < previous) {
      problems.push(`timeline not sorted at ${entry.id}`)
      break
    }
    previous = entry.offsetMin
  }
  for (const group of plan.shopping.groups) {
    for (const line of group.lines) {
      if (line.amount !== null && !Number.isFinite(line.amount)) {
        problems.push(`non-finite amount for ${line.ingredientId}`)
      }
    }
  }
  return problems
}
