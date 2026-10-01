import {
  CHARCOAL_TYPES,
  CONFLICTS,
  GRILL_TIERS,
  INGREDIENTS,
  INGREDIENT_BY_ID,
  PER_PERSON_BASELINE,
  POOL_OF_GROUP,
  PURCHASE_GROUPS,
  RECIPES,
  RECIPE_BY_ID,
  SAFETY_NOTICES,
  SUPPLIES,
  SUPPLY_GROUPS,
  TIMELINE_STEPS,
  UNIT_LABELS,
} from './data/index'
import { isNum, midpoint } from './measure'
import type {
  AppetiteTier,
  BarbecuePlan,
  CustomItem,
  DietTag,
  EquipmentMode,
  EquipmentPlan,
  Ingredient,
  LocalText,
  PlannerInput,
  PurchaseGroupId,
  Recipe,
  RecipeItem,
  RecipePlan,
  SafetyNotice,
  ServeUnit,
  ShoppingGroup,
  ShoppingLine,
  StepGate,
  TimelineEntry,
} from './types'

const APPETITE_IDS: readonly AppetiteTier[] = ['light', 'standard', 'heavy']
const DIET_IDS: readonly DietTag[] = [
  'noSpicy',
  'vegetarianFirst',
  'glutenFree',
  'noSeafood',
  'kidFriendly',
]
const MODE_IDS: readonly EquipmentMode[] = [
  'charcoal',
  'gas',
  'airFryer',
  'homeOven',
  'stovetopPan',
  'smoker',
]
/** 只有真的烧炭的设备才要买炭 —— 空气炸锅那桌不该被提醒买 15 kg 木炭 */
const CHARCOAL_MODES: readonly EquipmentMode[] = ['charcoal', 'smoker']
const DISH_IDS: readonly string[] = INGREDIENTS.map((item) => item.id)
/** 撒料／刷酱／蘸料／盐 —— 腌料不在里面，腌料跟着肉走 */
const SAUCE_IDS: readonly string[] = RECIPES.filter((recipe) => recipe.kind !== 'marinade').map(
  (recipe) => recipe.id,
)
/** 「基本」= 买来直接用的成品调料（蒜蓉辣酱、蜂蜜那一瓶一瓶的东西），在菜单里勾选带走哪几样 */
const BASIC_IDS: readonly string[] = SUPPLIES.filter((item) => item.group === 'condiment').map(
  (item) => item.id,
)
/** 清单上可能出现的所有行号（菜品 + 调料耗材），划掉操作只认这些 */
const LINE_IDS: readonly string[] = [...DISH_IDS, ...SUPPLIES.map((item) => item.id)]
/** ServeUnit 全集以 UNIT_LABELS 的键为准，将来加单位这里自动跟着走 */
const SERVE_UNITS: readonly ServeUnit[] = Object.keys(UNIT_LABELS) as ServeUnit[]
/** 自定义项能选的单位 —— 串在任务 1 之后只剩"炉子上的一串"，菜市场里没有这个买法 */
export const CUSTOM_UNIT_CHOICES: readonly ServeUnit[] = SERVE_UNITS.filter(
  (unit) => unit !== 'skewer',
)
/** 手动改量的上限：超过一万个单位肯定是误输入 */
const MAX_QTY = 99999
/** 一桌中式炭烤的默认撒料：不选就等于没调料，所以开桌先给三样 */
const DEFAULT_SAUCES: readonly string[] = ['cn-s-classic', 'cn-s-baste', 'cn-s-dip-dry']

const POOL_KEYS = ['meat', 'seafood', 'vegetable', 'soy', 'staple'] as const
type PoolKey = (typeof POOL_KEYS)[number]

/** 淄博小饼效应：单吃肉约 20 串才饱，配小饼卷葱约 10 串即饱 */
const BING_SKEWER_FACTOR = 0.5

const DEFAULT_GRILL_START = '18:30'

const GROUP_LABELS = new Map<PurchaseGroupId, LocalText>(
  PURCHASE_GROUPS.map((item) => [item.id, item.name]),
)
/** 手动补的行必须落在真实分组里，认不出的分组连同这一项一起丢 */
const PURCHASE_GROUP_IDS: readonly PurchaseGroupId[] = PURCHASE_GROUPS.map((item) => item.id)

/**
 * 夹住并清洗外部输入。人数必须落在 1–20，其余字段非法时回落默认值而不是抛错 ——
 * 受控控件的瞬时值可能暂时不合法，页面不该因此崩掉。
 */
export function normalizePlannerInput(raw: Partial<PlannerInput>): PlannerInput {
  const appetite = isOneOf(APPETITE_IDS, raw.appetite) ? raw.appetite : 'standard'
  const customs = normalizeCustoms(raw.customs)
  const conflictChoices: Record<string, string> = {}
  for (const conflict of CONFLICTS) {
    const picked = raw.conflictChoices?.[conflict.id]
    const chosen = conflict.variants.find((variant) => variant.id === picked)
    conflictChoices[conflict.id] = chosen ? chosen.id : conflict.defaultVariantId
  }
  return {
    people: clampPeople(raw.people),
    appetite,
    // 一道都没选是合法状态（选择引导页），不该替用户擅自勾一桌
    dishes: dedupe((raw.dishes ?? []).filter((id) => DISH_IDS.includes(id))),
    // 蘸料没给时用默认三样；显式给了空数组是"我一瓶都不要"，尊重之
    sauces:
      raw.sauces === undefined
        ? [...DEFAULT_SAUCES]
        : dedupe(raw.sauces.filter((id) => SAUCE_IDS.includes(id))),
    // 成品调料默认全带上（不给就等于照旧什么都有），给了空数组才是"这次一瓶都不带"
    basics:
      raw.basics === undefined
        ? [...BASIC_IDS]
        : dedupe(raw.basics.filter((id) => BASIC_IDS.includes(id))),
    // 自定义行也是行，改过数量的 override 必须认得它的 id
    overrides: normalizeOverrides(
      raw.overrides,
      customs.map((item) => item.id),
    ),
    diets: dedupe((raw.diets ?? []).filter((id) => isOneOf(DIET_IDS, id))),
    equipmentMode: isOneOf(MODE_IDS, raw.equipmentMode) ? raw.equipmentMode : 'charcoal',
    grillStart: normalizeClock(raw.grillStart),
    conflictChoices,
    customs,
  }
}

/** 用户自己补的采购项：名字与数量都可能是脏输入，整条丢掉比兜一个 0 安全 */
function normalizeCustoms(raw: readonly CustomItem[] | undefined): CustomItem[] {
  const out: CustomItem[] = []
  const seen = new Set<string>()
  for (const item of raw ?? []) {
    const name = item.name.trim()
    const amount = Math.round(item.amount)
    if (!name || !item.id || seen.has(item.id) || !Number.isFinite(amount) || amount < 0) {
      continue
    }
    if (!SERVE_UNITS.includes(item.unit) || !isOneOf(PURCHASE_GROUP_IDS, item.group)) {
      continue
    }
    seen.add(item.id)
    out.push({
      id: item.id,
      name,
      amount: Math.min(MAX_QTY, amount),
      // 「串」现在只描述炉子，自己买的东西按件计
      unit: item.unit === 'skewer' ? 'piece' : item.unit,
      group: item.group,
    })
  }
  return out
}

/** 下一个自定义行号：取已有最大序号 +1，删掉一条也不会让新 id 撞车 */
export function nextCustomId(customs: readonly CustomItem[]): string {
  let highest = 0
  for (const item of customs) {
    const matched = /^custom-(\d+)$/.exec(item.id)
    if (matched) {
      highest = Math.max(highest, Number(matched[1]))
    }
  }
  return `custom-${highest + 1}`
}

/** 只接受 HH:MM，其余一律回落默认开烤时刻 */
function normalizeClock(value: string | undefined): string {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) {
    return DEFAULT_GRILL_START
  }
  const [hour, minute] = value.split(':')
  const h = Math.min(23, Math.max(0, Number(hour)))
  const m = Math.min(59, Math.max(0, Number(minute)))
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function isOneOf<T extends string>(list: readonly T[], value: string | undefined): value is T {
  return value !== undefined && (list as readonly string[]).includes(value)
}

/**
 * 只接受合法行号上的合法数量：非数字、负数、未知 id 一律丢弃而不是兜一个 0 ——
 * 静默变成"不买"比丢一次输入危险得多。自定义行的 id 是运行时生成的，所以额外传进来。
 */
function normalizeOverrides(
  raw: Record<string, number> | undefined,
  extraIds: readonly string[] = [],
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [id, value] of Object.entries(raw ?? {})) {
    if ((!LINE_IDS.includes(id) && !extraIds.includes(id)) || !Number.isFinite(value)) {
      continue
    }
    out[id] = Math.min(MAX_QTY, Math.max(0, Math.round(value)))
  }
  return out
}

/**
 * 步进量按单位分档：串和根按 5 递增，克按 50；
 * 一瓶一瓶地加减才是买耗材的真实节奏，所以瓶装/包/个/双走 1。
 */
export function stepForUnit(unit: ServeUnit): number {
  switch (unit) {
    case 'gram':
      return 50
    case 'skewer':
    case 'stick':
      return 5
    default:
      return 1
  }
}

/** 行上的量词：菜市场说"两只鸡翅""一条肠"，所以食材自带的覆盖优先于通用 UNIT_LABELS */
export function lineUnitLabel(line: ShoppingLine, lang: 'zh' | 'en'): string {
  return (line.unitLabel ?? UNIT_LABELS[line.unit])[lang]
}

function clampPeople(value: number | undefined): number {
  const rounded = Math.round(Number(value ?? 6))
  if (!Number.isFinite(rounded)) {
    return 6
  }
  return Math.min(20, Math.max(1, rounded))
}

function dedupe<T>(list: readonly T[]): T[] {
  return [...new Set(list)]
}

/** 忌口开关 + 设备模式共同决定本次有哪些食材参与 */
export function isIngredientAllowed(
  ingredient: Ingredient,
  diets: readonly DietTag[],
  mode: EquipmentMode,
): boolean {
  if (ingredient.excludedBy.some((tag) => diets.includes(tag))) {
    return false
  }
  // 没有当前设备模式的烤制窗口 = 这桌做不了（比如只有空气炸锅却要熏 12 小时的牛胸肉）
  return ingredient.cook.windows.some((window) => window.mode === mode)
}

export function chooseIngredients(input: PlannerInput): Ingredient[] {
  return INGREDIENTS.filter(
    (item) =>
      input.dishes.includes(item.id) && isIngredientAllowed(item, input.diets, input.equipmentMode),
  )
}

/** 采购池总量（克，人均基准 × 人数）；池里没有可选食材时为 0 */
function poolTotalGrams(
  pool: PoolKey,
  input: PlannerInput,
  members: readonly Ingredient[],
  bingActive: boolean,
): number {
  if (members.length === 0) {
    return 0
  }
  const perPerson = midpoint(PER_PERSON_BASELINE[input.appetite][pool])
  if (perPerson === null) {
    return 0
  }
  // 淄博小饼效应直接压在肉池总量上：单吃肉约 20 串才饱、卷饼约 10 串即饱，所以肉只买一半。
  // 压在池总量而不是单行上，生肉合计、竹签数、批次与腌料缩放才会跟着同一个数字走。
  const base = perPerson * input.people
  return pool === 'meat' && bingActive ? base * BING_SKEWER_FACTOR : base
}

/**
 * 池总量在同池被选中的菜品之间**均分**：用户是手工点菜的，
 * "每样来一点"就是他们的直觉，藏一个人气权重表只会让结果难以预期。
 * 池的总量始终等于调研基准，所以多点几样只改变分配、不抬高人均。
 * 带出成率的项按 生重 = 熟重 ÷ 出成率 上浮，这是美式 catering 的通行算法。
 */
function allocatePool(
  pool: PoolKey,
  input: PlannerInput,
  universe: readonly Ingredient[],
  bingActive: boolean,
): Map<string, number> {
  const members = universe.filter(
    (item) => item.qty.mode === 'pool' && POOL_OF_GROUP[item.group] === pool,
  )
  const total = poolTotalGrams(pool, input, members, bingActive)
  const result = new Map<string, number>()
  if (total <= 0 || members.length === 0) {
    return result
  }
  const each = total / members.length
  for (const item of members) {
    const yieldPct = isNum(item.yieldPct) ? midpoint(item.yieldPct) : null
    result.set(item.id, yieldPct && yieldPct > 0 ? each / (yieldPct / 100) : each)
  }
  return result
}

function composeLine(
  ingredient: Ingredient,
  grams: number | undefined,
  input: PlannerInput,
  bingActive: boolean,
): Omit<ShoppingLine, 'baseAmount'> | null {
  if (ingredient.qty.mode === 'pool') {
    if (grams === undefined) {
      return null
    }
    return {
      ingredientId: ingredient.id,
      name: ingredient.name,
      unitLabel: ingredient.counter,
      // 去菜市场的人买的是克，不是串；串数只在 buildShopping 里为炉子与竹签算一笔内部账
      amount: roundGrams(grams),
      unit: 'gram',
      // 带出成率的项做了生重上浮，属于推导结果而非直接来源
      confidence: isNum(ingredient.yieldPct) ? 'derived' : 'authoritative',
    }
  }

  // 小饼减半压在肉池总量上，管不到人头项；鸡翅这类按只买的同样要少一半，所以系数留在这一支
  const factor = bingActive && POOL_OF_GROUP[ingredient.group] === 'meat' ? BING_SKEWER_FACTOR : 1
  const measure = ingredient.qty.perPerson[input.appetite]
  if (!isNum(measure)) {
    return {
      ingredientId: ingredient.id,
      name: ingredient.name,
      unitLabel: ingredient.counter,
      amount: null,
      unit: ingredient.unit,
      confidence: 'gap',
      note: measure.basis,
    }
  }
  return {
    ingredientId: ingredient.id,
    name: ingredient.name,
    unitLabel: ingredient.counter,
    amount: Math.max(1, Math.ceil((midpoint(measure) ?? 0) * input.people * factor)),
    unit: ingredient.unit,
    confidence: measure.confidence,
  }
}

/** 默认量同时写进 baseAmount，"恢复默认"与"这行被动过"都以它为基准 */
function toLine(
  ingredient: Ingredient,
  grams: number | undefined,
  input: PlannerInput,
  bingActive: boolean,
): ShoppingLine | null {
  const line = composeLine(ingredient, grams, input, bingActive)
  return line === null ? null : { ...line, baseAmount: line.amount }
}

function roundGrams(value: number): number {
  return value >= 1000 ? Math.round(value / 50) * 50 : Math.round(value / 10) * 10
}

/**
 * 调料与耗材的量由人数、串数、肉量推导，而不是从采购池里抢份额。
 * 一律向上取整并守住最小购买量 —— 1 个人也算不出 0.17 包竹签。
 */
export function buildSupplyGroups(
  input: PlannerInput,
  totals: { skewers: number; meatGrams: number },
): ShoppingGroup[] {
  const byGroup = new Map<PurchaseGroupId, ShoppingLine[]>()
  for (const supply of SUPPLIES) {
    // 成品调料跟着「基本」的勾选走；耗材没有"这次不买"这一说，始终在清单上
    if (supply.group === 'condiment' && !input.basics.includes(supply.id)) {
      continue
    }
    const raw =
      supply.qty.basis === 'fixed'
        ? supply.qty.amount
        : supply.qty.basis === 'people'
          ? input.people * supply.qty.per
          : supply.qty.basis === 'skewers'
            ? totals.skewers * supply.qty.per
            : (totals.meatGrams / 1000) * supply.qty.per
    const amount = Math.max(supply.min, Math.ceil(raw))
    const line: ShoppingLine = {
      ingredientId: supply.id,
      name: supply.name,
      amount,
      baseAmount: amount,
      unit: supply.unit,
      confidence: supply.qty.basis === 'fixed' ? 'authoritative' : 'derived',
      optional: supply.optional,
      use: supply.use,
      note: supply.note,
    }
    const list = byGroup.get(supply.group)
    if (list) {
      list.push(line)
    } else {
      byGroup.set(supply.group, [line])
    }
  }
  return SUPPLY_GROUPS.filter((group) => byGroup.has(group.id)).map((group) => ({
    id: group.id as PurchaseGroupId,
    label: group.name,
    lines: byGroup.get(group.id) ?? [],
  }))
}

export function buildShopping(input: PlannerInput, universe: readonly Ingredient[]) {
  // 小饼要真的在这桌的清单上，肉量减半才成立 —— 由清单自动判定，不再让用户手动开关
  const bingActive = universe.some((item) => item.id === 'cn-zibo-bing')

  const allocations = new Map<string, number>()
  for (const pool of POOL_KEYS) {
    for (const [id, grams] of allocatePool(pool, input, universe, bingActive)) {
      allocations.set(id, grams)
    }
  }

  const lines: ShoppingLine[] = []
  for (const item of universe) {
    const line = toLine(item, allocations.get(item.id), input, bingActive)
    if (line) {
      lines.push(line)
    }
  }

  const byGroup = new Map<PurchaseGroupId, ShoppingLine[]>()
  for (const line of lines) {
    const group = INGREDIENT_BY_ID[line.ingredientId]?.group
    if (!group) {
      continue
    }
    if (!byGroup.has(group)) {
      byGroup.set(group, [])
    }
    byGroup.get(group)!.push(line)
  }

  const groups: ShoppingGroup[] = PURCHASE_GROUPS.filter((entry) => byGroup.has(entry.id)).map(
    (entry) => ({
      id: entry.id,
      label: GROUP_LABELS.get(entry.id) ?? entry.name,
      lines: byGroup.get(entry.id)!,
    }),
  )

  const totalMeatGrams = universe
    .filter((item) => POOL_OF_GROUP[item.group] === 'meat')
    .reduce((sum, item) => sum + (allocations.get(item.id) ?? 0), 0)
  // 串数只服务炉子与竹签：菜市场要的是克重，所以它不再是清单上的一行，而是这里的一笔内部账。
  // 按人头计数的串项在现有数据里不存在（skewer 单位全是池项），所以只需从池分配反推。
  const totalSkewers = universe.reduce((sum, item) => {
    if (item.unit !== 'skewer' || !isNum(item.skewerGrams)) {
      return sum
    }
    const per = midpoint(item.skewerGrams) ?? 0
    const grams = allocations.get(item.id) ?? 0
    return per > 0 ? sum + Math.ceil(grams / per) : sum
  }, 0)
  const charcoalPerPerson = midpoint(PER_PERSON_BASELINE[input.appetite].charcoal) ?? 1250
  const supplies = buildSupplyGroups(input, { skewers: totalSkewers, meatGrams: totalMeatGrams })

  // 自己买的项并进所属分组卡片的末尾：它只是带去菜市场的一句备忘，
  // 不参与肉量/串数/炭/批次的任何推导
  const all: ShoppingGroup[] = [...groups, ...supplies]
  for (const item of input.customs) {
    const line: ShoppingLine = {
      ingredientId: item.id,
      // 用户手打的名字没有译文，两种语言下都原样显示
      name: { zh: item.name, en: item.name },
      amount: item.amount,
      // baseAmount === amount：步进器与「置 0 = 不买」对这一行免费生效
      baseAmount: item.amount,
      unit: item.unit,
      confidence: 'authoritative',
    }
    const target = all.find((entry) => entry.id === item.group)
    if (target) {
      target.lines.push(line)
      continue
    }
    // 整组一道菜都没点时也要给它留一行：按采购顺序插在它该在的位置
    const rank = PURCHASE_GROUP_IDS.indexOf(item.group)
    const after = all.findIndex((entry) => PURCHASE_GROUP_IDS.indexOf(entry.id) > rank)
    all.splice(after === -1 ? all.length : after, 0, {
      id: item.group,
      label: GROUP_LABELS.get(item.group) ?? line.name,
      lines: [line],
    })
  }
  // 手改数量只改这一行：池分配、炭量、批次与配方缩放始终按调研基准推导，
  // 否则"少买一包芝麻"会连带把羊肉串的克重算多，那是谁都看不懂的报表。
  for (const group of all) {
    for (const line of group.lines) {
      const override = input.overrides[line.ingredientId]
      if (override !== undefined && line.baseAmount !== null) {
        line.amount = override
      }
    }
  }

  return {
    // 菜在前、调料与耗材在后，顺序就是逛超市的动线
    groups: all,
    totalMeatGrams,
    totalSkewers,
    charcoalGrams: CHARCOAL_MODES.includes(input.equipmentMode)
      ? Math.ceil((charcoalPerPerson * input.people) / 100) * 100
      : 0,
    bingActive,
  }
}

/* ------------------------------------------------------------------ 配方 */

/**
 * 腌料由食材自己指定（哪种肉配哪种 cure，属于自动配套），
 * 撒料/刷酱/蘸料由用户在点菜页自由勾选 —— 一桌人各有所好，不该由菜倒推。
 * 「不吃辣 / 儿童友好」只保留辣度低于 2 的配方。
 */
export function selectRecipes(
  universe: readonly Ingredient[],
  kind: 'marinade' | 'seasoning',
  input: PlannerInput,
): Recipe[] {
  const picked =
    kind === 'marinade'
      ? new Set(universe.flatMap((item) => item.marinadeIds))
      : new Set(input.sauces)
  const mild = input.diets.includes('noSpicy') || input.diets.includes('kidFriendly')
  return [...picked]
    .map((id) => RECIPE_BY_ID[id])
    .filter(
      (recipe): recipe is Recipe => recipe !== undefined && !(mild && (recipe.spice ?? 0) >= 2),
    )
}

/** 按本次实际肉量缩放；勺／个／瓣保留原始计量，家用没有秤的人更需要"几大勺" */
export function scaleRecipe(
  recipe: Recipe,
  targetMeatGrams: number,
  people: number,
  glutenFree: boolean,
) {
  let factor = 1
  let scaledTo: LocalText
  if (recipe.base.kind === 'meat') {
    factor = recipe.base.baseGrams > 0 ? targetMeatGrams / recipe.base.baseGrams : 1
    scaledTo = {
      zh: `按 ${formatMass(targetMeatGrams)} 肉缩放`,
      en: `scaled to ${formatMass(targetMeatGrams)} of meat`,
    }
  } else if (recipe.base.kind === 'people') {
    factor = recipe.base.basePeople > 0 ? people / recipe.base.basePeople : 1
    scaledTo = { zh: `按 ${people} 人缩放`, en: `scaled for ${people} people` }
  } else {
    scaledTo = recipe.base.covers ?? { zh: '固定批量', en: 'fixed batch' }
  }

  return {
    id: recipe.id,
    kind: recipe.kind,
    name: recipe.name,
    scaledTo,
    lines: recipe.items.map((item) => ({
      name: item.name,
      amount: formatItemQty(item, factor),
      unit: item.unit,
    })),
    timing: recipe.timing,
    glutenFreeSwap: glutenFree ? recipe.glutenFreeSwap : undefined,
    note: recipe.note,
  }
}

/**
 * 参考配比：按资料原始那一版列，不跟着本桌点了什么缩放。
 * 配方区现在是"这些料都能配"，要买哪几样仍然在「菜单」里勾。
 */
export function referenceRecipe(recipe: Recipe): RecipePlan {
  const scaledTo: LocalText =
    recipe.base.kind === 'meat'
      ? {
          zh: `每 ${formatMass(recipe.base.baseGrams)} 肉`,
          en: `per ${formatMass(recipe.base.baseGrams)} of meat`,
        }
      : recipe.base.kind === 'people'
        ? {
            zh: `一份 ${recipe.base.basePeople} 人量`,
            en: `one batch for ${recipe.base.basePeople} people`,
          }
        : (recipe.base.covers ?? { zh: '固定一罐', en: 'fixed batch' })
  return {
    id: recipe.id,
    kind: recipe.kind,
    name: recipe.name,
    scaledTo,
    lines: recipe.items.map((item) => ({
      name: item.name,
      amount: formatItemQty(item, 1),
      unit: item.unit,
    })),
    timing: recipe.timing,
    glutenFreeSwap: recipe.glutenFreeSwap,
    note: recipe.note,
  }
}

function formatItemQty(item: RecipeItem, factor: number): string {
  if (!isNum(item.qty)) {
    return '—'
  }
  if (item.unit === 'to-taste') {
    return '适量'
  }
  // 混合物内部配比（part）是比例，不随肉量缩放
  const scale = item.unit === 'part' ? 1 : factor
  const scaledMin = item.qty.min * scale
  const scaledMax = item.qty.max * scale
  // 克/毫升给整数；勺、个、瓣给一位小数，"6.72 汤匙"这种精度没有意义
  const shown = (value: number) =>
    String(
      item.unit === 'g' || item.unit === 'ml' ? Math.round(value) : Math.round(value * 10) / 10,
    )
  return scaledMin === scaledMax ? shown(scaledMin) : `${shown(scaledMin)}–${shown(scaledMax)}`
}

function trim(value: number): string {
  return String(Math.round(value * 100) / 100)
}

export function formatMass(grams: number): string {
  return grams >= 1000 ? `${trim(grams / 1000)} kg` : `${Math.round(grams)} g`
}

/** 炭量按菜市场口径给：公斤打底，中文再补一句斤 */
export function formatCharcoal(grams: number, lang: 'zh' | 'en'): string {
  const mass = formatMass(grams)
  // 不足 1 kg 的炭（小炉引火）菜市场还是按克说，0 也照原样留给调用方判空
  if (lang !== 'zh' || grams < 1000) {
    return mass
  }
  return `${mass} · ${trim(grams / 500)} 斤`
}

/* ------------------------------------------------------------------ 时间线 */

/** 把 HH:MM 与分钟偏移合成真实钟点（跨零点也正确） */
export function clockAt(start: string, offsetMin: number): string {
  const [hour, minute] = start.split(':')
  const total = Number(hour) * 60 + Number(minute) + offsetMin
  const wrapped = ((total % 1440) + 1440) % 1440
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

export function buildTimeline(
  input: PlannerInput,
  universe: readonly Ingredient[],
): TimelineEntry[] {
  const preps = new Set(universe.flatMap((item) => item.prep))
  const groups = new Set(universe.map((item) => item.group))
  const entries: TimelineEntry[] = []

  for (const step of TIMELINE_STEPS) {
    if (!gatePasses(step.gate, { preps, groups })) {
      continue
    }
    entries.push({
      id: step.id,
      offsetMin: step.offsetMin,
      clock: clockAt(input.grillStart, step.offsetMin),
      durationMin: step.durationMin,
      phase: step.phase,
      title: step.title,
      body: conflictBody(step.conflictId, step.body, input),
    })
  }

  const thaw = makeThawEntry(input, preps)
  if (thaw) {
    entries.push(thaw)
  }
  const marinate = makeMarinateEntry(input, universe)
  if (marinate) {
    entries.push(marinate)
  }

  return entries.sort((a, b) => a.offsetMin - b.offsetMin)
}

function gatePasses(gate: StepGate, ctx: { preps: Set<string>; groups: Set<string> }): boolean {
  switch (gate.kind) {
    case 'always':
      return true
    case 'prep':
      return ctx.preps.has(gate.prep)
    case 'group':
      return ctx.groups.has(gate.group)
  }
}

function conflictBody(
  conflictId: string | undefined,
  fallback: LocalText | undefined,
  input: PlannerInput,
): LocalText {
  const conflict = conflictId ? CONFLICTS.find((item) => item.id === conflictId) : undefined
  const variant = conflict?.variants.find((v) => v.id === input.conflictChoices[conflict.id])
  return variant?.body ?? fallback ?? { zh: '', en: '' }
}

function makeThawEntry(input: PlannerInput, preps: Set<string>): TimelineEntry | null {
  if (!preps.has('thaw')) {
    return null
  }
  // 两种口径都保留在数据里，由用户的口径选择决定这一条怎么写
  const hours = input.conflictChoices['thaw-time'] === 'slow' ? [12, 24] : [5, 8]
  return {
    id: 'tl-thaw',
    offsetMin: -hours[1] * 60,
    clock: clockAt(input.grillStart, -hours[1] * 60),
    durationMin: {
      kind: 'num',
      min: hours[0] * 60,
      max: hours[1] * 60,
      confidence: 'authoritative',
    },
    phase: 'lead',
    title: { zh: '冷冻肉转入冷藏解冻', en: 'Move the frozen meat to the fridge' },
    body: {
      zh: `0–4 ℃ 冷藏解冻，每 500 g 约 ${hours[0]}–${hours[1]} h。禁止室温解冻 —— 那正好落在细菌每 20 min 翻倍的危险温区。`,
      en: `Thaw at 0–4 °C, roughly ${hours[0]}–${hours[1]} h per 500 g. Never on the counter.`,
    },
  }
}

/** 腌制提前量取本次所有腌料里最长的那一条；gap 时长的配方不参与排序 */
function makeMarinateEntry(
  input: PlannerInput,
  universe: readonly Ingredient[],
): TimelineEntry | null {
  const ids = new Set(universe.flatMap((item) => item.marinadeIds))
  let longest: { recipe: Recipe; min: number; max: number } | undefined
  for (const id of ids) {
    const recipe = RECIPE_BY_ID[id]
    if (!recipe?.durationMin || !isNum(recipe.durationMin)) {
      continue
    }
    if (!longest || recipe.durationMin.max > longest.max) {
      longest = { recipe, min: recipe.durationMin.min, max: recipe.durationMin.max }
    }
  }
  if (!longest) {
    return null
  }
  const { recipe, min, max } = longest
  return {
    id: 'tl-marinate',
    offsetMin: -max,
    clock: clockAt(input.grillStart, -max),
    durationMin: { kind: 'num', min, max, confidence: 'authoritative' },
    phase: 'lead',
    title: { zh: '腌制等待', en: 'Marinating wait' },
    body: {
      zh: `最长的一条是「${recipe.name.zh}」，需 ${formatHourRange(min, max)}；全程 0–4 ℃ 冷藏，不要室温腌。`,
      en: `The longest is "${recipe.name.en}", ${formatHourRange(min, max)} — keep it at 0–4 °C.`,
    },
  }
}

function formatHourRange(minMinutes: number, maxMinutes: number): string {
  const show = (m: number) => (m >= 60 ? `${trim(m / 60)} h` : `${m} min`)
  return minMinutes === maxMinutes ? show(minMinutes) : `${show(minMinutes)}–${show(maxMinutes)}`
}

/* ------------------------------------------------------------------ 设备与产能 */

export function resolveGrill(people: number) {
  return (
    GRILL_TIERS.find((tier) => people >= tier.people.min && people <= tier.people.max) ??
    GRILL_TIERS[GRILL_TIERS.length - 1]
  )
}

export function buildEquipmentPlan(
  input: PlannerInput,
  totalSkewers: number,
  universe: readonly Ingredient[],
): EquipmentPlan {
  const grill = resolveGrill(input.people)
  const capacity = Math.max(
    1,
    Math.round(isNum(grill.batchSkewers) ? (midpoint(grill.batchSkewers) ?? 40) : 40),
  )
  const batchCount = Math.max(1, Math.ceil(totalSkewers / capacity))

  // 批次节奏由肉串决定。把蔬菜的 3 分钟和花甲的 30 分钟一起卷进来，
  // 乘上批次数只会得到"3–90 分钟"这种没有意义的带宽。
  const batchDrivers = universe.filter((item) => POOL_OF_GROUP[item.group] === 'meat')
  const windows = (batchDrivers.length > 0 ? batchDrivers : universe)
    .flatMap((item) => item.cook.windows)
    .filter((window) => window.mode === input.equipmentMode)
  const perBatchMin =
    windows.length > 0
      ? {
          min: Math.min(...windows.map((w) => w.minutes.min)),
          max: Math.max(...windows.map((w) => w.minutes.max)),
        }
      : { min: 8, max: 12 }

  return {
    grill,
    charcoalOptions: CHARCOAL_TYPES,
    batches: {
      totalSkewers,
      capacity,
      batchCount,
      perBatchMin,
      totalMin: { min: perBatchMin.min * batchCount, max: perBatchMin.max * batchCount },
    },
  }
}

/* ------------------------------------------------------------------ 安全 */

/** 清单里可勾选的行号：调料与耗材一视同仁，买菜时都要划勾；改到 0 的不计入 */
export function selectableLineIds(plan: BarbecuePlan): string[] {
  return activeGroups(plan).flatMap((group) => group.lines.map((line) => line.ingredientId))
}

/** 数量被改成 0 —— 这一项这次不买 */
export function isDropped(line: ShoppingLine): boolean {
  return line.amount === 0
}

/** 与默认量不一致，行上该出现"恢复默认" */
export function isAdjusted(line: ShoppingLine): boolean {
  return line.amount !== line.baseAmount
}

/** 改数量：null 表示删掉这条 override，回到引擎默认量 */
export function applyOverride(
  overrides: Record<string, number>,
  id: string,
  amount: number | null,
): Record<string, number> {
  const next = { ...overrides }
  if (amount === null) {
    delete next[id]
  } else {
    next[id] = Math.min(MAX_QTY, Math.max(0, Math.round(amount)))
  }
  return next
}

/** 步进：下限 0（不买），上限 MAX_QTY，始终落在整数上 */
export function stepAmount(line: ShoppingLine, delta: number): number {
  const base = line.amount ?? line.baseAmount ?? 0
  return Math.min(MAX_QTY, Math.max(0, Math.round(base + delta)))
}

/**
 * 归零的行不参与复制文本、生成图片与进度统计。
 * 清单本体仍保留它们，否则用户没法把误改的那行恢复回来。
 */
export function activeGroups(plan: BarbecuePlan): ShoppingGroup[] {
  return plan.shopping.groups
    .map((group) => ({ ...group, lines: group.lines.filter((line) => !isDropped(line)) }))
    .filter((group) => group.lines.length > 0)
}

export function droppedLineCount(plan: BarbecuePlan): number {
  return countLines(plan, isDropped)
}

export function adjustedLineCount(plan: BarbecuePlan): number {
  return countLines(plan, isAdjusted)
}

function countLines(plan: BarbecuePlan, predicate: (line: ShoppingLine) => boolean): number {
  return plan.shopping.groups.reduce((sum, group) => sum + group.lines.filter(predicate).length, 0)
}

/** 与安全无关的条目不占版面：豆角与老酱只在真的出现在桌上时才提示 */
const CONDITIONAL_NOTICES: Record<string, (ids: Set<string>) => boolean> = {
  'green-bean': (ids) => ids.has('cn-green-bean'),
  'tare-ageing': (ids) => ids.has('jp-tare-classic') || ids.has('jp-tare-reduced'),
  'gluten-free': () => false,
}

export function buildSafetyNotices(
  universe: readonly Ingredient[],
  recipes: readonly Recipe[],
): SafetyNotice[] {
  const present = new Set<string>([
    ...universe.map((item) => item.id),
    ...recipes.map((item) => item.id),
  ])
  return SAFETY_NOTICES.filter((notice) => {
    const gate = CONDITIONAL_NOTICES[notice.id]
    return gate ? gate(present) : true
  }).map((notice) => ({ id: notice.id, title: notice.title, body: notice.body }))
}

/* ------------------------------------------------------------------ 总入口 */

export function planBarbecue(raw: Partial<PlannerInput>): BarbecuePlan {
  const input = normalizePlannerInput(raw)
  const universe = chooseIngredients(input)
  const shopping = buildShopping(input, universe)
  const glutenFree = input.diets.includes('glutenFree')

  const marinadeRecipes = selectRecipes(universe, 'marinade', input)
  const seasoningRecipes = selectRecipes(universe, 'seasoning', input)
  const marinades = marinadeRecipes.map((recipe) =>
    scaleRecipe(recipe, shopping.totalMeatGrams, input.people, glutenFree),
  )
  const seasonings = seasoningRecipes.map((recipe) =>
    scaleRecipe(recipe, shopping.totalMeatGrams, input.people, glutenFree),
  )

  return {
    input,
    shopping,
    marinades,
    seasonings,
    timeline: buildTimeline(input, universe),
    equipment: buildEquipmentPlan(input, shopping.totalSkewers, universe),
    safety: buildSafetyNotices(universe, [...marinadeRecipes, ...seasoningRecipes]),
  }
}
