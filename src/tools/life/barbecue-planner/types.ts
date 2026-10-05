/**
 * 烧烤规划器的共享类型。
 * 遵守 AGENTS.md §4：禁 enum / namespace / 参数属性，只用 `type` + `as const` 联合类型。
 */

export type LocalText = { zh: string; en: string }

/** 调研数据绝大多数是区间，一律用 Range 表达，不写死单值 */
export type Range = { min: number; max: number }

/**
 * 一个带出处的量。`gap` 分支表示公开资料缺口 —— 类型层面就不允许填数值，
 * 防止把推算/缺失的数据当成事实展示。
 */
export type Measure =
  | {
      kind: 'num'
      min: number
      max: number
      /** authoritative = 多来源交叉或官方口径；derived = 由已核实规则推算 */
      confidence: 'authoritative' | 'derived'
      /** derived 必填，写明推导链 */
      basis?: LocalText
    }
  | { kind: 'gap'; confidence: 'gap'; basis: LocalText }

export type CuisineId = 'cn' | 'jp' | 'kr' | 'us'

/** 每道菜买多少：auto = 由引擎按采购池摊薄；manual = 在点菜卡片上自己填 */
export type QtyMode = 'auto' | 'manual'

export type AppetiteTier = 'light' | 'standard' | 'heavy'

export type DietTag = 'noSpicy' | 'vegetarianFirst' | 'glutenFree' | 'noSeafood' | 'kidFriendly'

/** 采购清单的分组，决定清单里的展示顺序 */
export type PurchaseGroupId =
  'mammal' | 'poultry' | 'seafood' | 'vegetable' | 'soy' | 'staple' | 'condiment' | 'consumable'

/** 烤制设备模式：同一食材在不同模式下时间不同 */
export type EquipmentMode = 'charcoal' | 'gas' | 'airFryer' | 'homeOven' | 'stovetopPan' | 'smoker'

export type HeatLevel = 'strong' | 'medium' | 'gentle'

export type ServeUnit =
  | 'gram'
  | 'skewer'
  | 'piece'
  | 'portion'
  | 'slice'
  | 'stick'
  | 'head'
  | 'pack'
  | 'bottle'
  | 'roll'
  | 'pair'

/** 预处理类型，驱动时间线裁剪 */
export type PrepKind =
  'thaw' | 'marinate' | 'purgeSand' | 'soakSkewer' | 'temper' | 'preBoil' | 'foil'

export type CookWindow = { mode: EquipmentMode; minutes: Range; note?: LocalText }

/**
 * 用量规则：
 * pool      —— 该食材从所属采购池（畜肉+禽肉 / 海鲜 / 蔬菜 / 豆制品 / 主食）里抢占份额，
 *              权重来自所选组合卡片（见 data/menus.ts 的 items.weight）；
 * perPerson —— 按人头直接计数（生蚝 2–3 只、鸡翅 0.5–1 只这类无法用克池切的项）。
 *
 * 池的总量始终等于调研口径的人均基准，所以勾选多少食材不会把总量抬高。
 */
export type IngredientQtyRule =
  { mode: 'pool' } | { mode: 'perPerson'; perPerson: Record<AppetiteTier, Measure> }

export type Ingredient = {
  id: string
  cuisine: CuisineId
  name: LocalText
  group: PurchaseGroupId
  /**
   * 展示单位：整只类用 piece，切片类用 gram。
   * 池内项即使标 skewer，采购量也一律给克 —— skewer 只用来折算串数（炉子与竹签的账）。
   */
  unit: ServeUnit
  /** 买这个件数时菜市场用的量词，覆盖 UNIT_LABELS[unit]；英文一律 pcs */
  counter?: LocalText
  /** unit 为 skewer 时的单串净重，用于把池内克数折算成串数 */
  skewerGrams?: Measure
  qty: IngredientQtyRule
  cook: { heat: HeatLevel; windows: CookWindow[] }
  prep: PrepKind[]
  marinadeIds: string[]
  /** 指向 CORE_TEMPS 的 id；非肉项省略 */
  coreTempId?: string
  /** 美式低温慢烤的生→熟出成率，采购量 = 熟量 ÷ 出成率 */
  yieldPct?: Measure
  /** 勾选这些忌口开关时，该食材被排除 */
  excludedBy: DietTag[]
  /** 辣度 0–3，「不吃辣 / 儿童友好」开关据此降级 */
  spice?: 0 | 1 | 2 | 3
  note?: LocalText
}

export type RecipeKind = 'marinade' | 'dryRub' | 'baste' | 'dip' | 'salt'

export type RecipeItem = {
  name: LocalText
  qty: Measure
  unit: 'g' | 'ml' | 'tbsp' | 'tsp' | 'piece' | 'clove' | 'part' | 'to-taste'
}

/**
 * 配方的缩放基准，三种之一：
 * meat  —— 表中用量对应 baseGrams 克肉，随实际肉量线性缩放（腌料走这条）；
 * people—— 表中用量是一份固定批量，按人数缩放；
 * batch —— 一次配一罐/一缸的干料与酱汁，不随本次人数缩放，原样列出并注明大约够多少肉。
 */
export type RecipeBase =
  | { kind: 'meat'; baseGrams: number }
  | { kind: 'people'; basePeople: number }
  | { kind: 'batch'; batchGrams: number; covers?: LocalText }

export type Recipe = {
  id: string
  kind: RecipeKind
  cuisine: CuisineId
  name: LocalText
  base: RecipeBase
  items: RecipeItem[]
  /** 腌制或熬煮所需分钟区间，驱动时间线 */
  durationMin?: Measure
  appliesTo: string[]
  /** 施加时机（干撒料"七八分熟分次撒"这类关键信息） */
  timing?: LocalText
  glutenFreeSwap?: LocalText
  /** 辣度 0–3，「不吃辣 / 儿童友好」开关据此把配方降级到同系列的温和版本 */
  spice?: 0 | 1 | 2 | 3
  note?: LocalText
}

export type StepGate =
  { kind: 'always' } | { kind: 'prep'; prep: PrepKind } | { kind: 'group'; group: PurchaseGroupId }

/** 时间线的四个阶段，决定 UI 上的色带与分组 */
export type TimelinePhase = 'lead' | 'ready' | 'grill' | 'close'

export type TimelineStep = {
  id: string
  /** 相对开烤时刻的分钟偏移，负数 = 提前 */
  offsetMin: number
  durationMin: Measure
  title: LocalText
  body?: LocalText
  gate: StepGate
  phase: TimelinePhase
  conflictId?: string
}

export type ConflictVariant = { id: string; label: LocalText; body: LocalText }

/** 调研中来源互相打架的条目：不合并成唯一正解，UI 提供口径切换 */
export type Conflict = {
  id: string
  title: LocalText
  variants: ConflictVariant[]
  defaultVariantId: string
}

export type GrillTier = {
  id: string
  lengthCm: number
  people: Range
  /** 单炉单批出串量 */
  batchSkewers?: Measure
  note?: LocalText
}

export type CharcoalType = {
  id: string
  name: LocalText
  /** 持续烤制小时数 */
  burnHours: Measure
  smoke: 'none' | 'low' | 'medium'
  flavor: LocalText
  priceTier: 1 | 2 | 3
  bestFor: LocalText
}

export type CoreTemp = {
  id: string
  meat: LocalText
  form: LocalText
  tempC: number
  restMin: number
}

/**
 * 一张烧烤组合卡片。用户选的是「局」，不是抽象的菜系标签 ——
 * items 里的 weight 只表示该食材在这套组合内的相对主角度，
 * 最终克重仍由所属采购池的人均基准决定（见 engine 的 allocatePool）。
 */
export type MenuSet = {
  id: string
  name: LocalText
  blurb: LocalText
  /** 卡片上的菜系标签，仅用于展示与筛选，不参与计算 */
  tags: CuisineId[]
  items: { id: string; weight: number }[]
  /** 能撑起这套组合的设备；当前设备不在其中时卡片置灰 */
  modes: EquipmentMode[]
  /** 从生火到第一口入嘴的净烤制时长 */
  minutes: Range
  difficulty: 1 | 2 | 3
  /** 这套局标配的主食或包法，用于卡片上的一句话提示 */
  wrap?: LocalText
}

/**
 * 用户自己补的一件采购项（某个牌子、某瓶饮料、从摊子上顺的凉菜）。
 * name 刻意是纯 string —— 用户输入没法翻译，两种语言下原样显示。
 * group 决定它落在哪张分组卡片里：自己买的东西也是"畜肉"或"调料"的一项，
 * 不该单列一组逼人在菜市场来回翻。
 */
export type CustomItem = {
  id: string
  name: string
  amount: number
  unit: ServeUnit
  group: PurchaseGroupId
}

export type PlannerInput = {
  people: number
  appetite: AppetiteTier
  /** 选中的具体菜品（食材 id），选择单位就是"烤鸡翅""烤香肠"这种单项 */
  dishes: string[]
  diets: DietTag[]
  equipmentMode: EquipmentMode
  /** 计划开烤时刻 HH:MM，用于把 T-偏移换算成真实钟点 */
  grillStart: string
  /** 自由勾选的蘸料／撒料配方 id；腌料仍由所选菜品自动决定 */
  sauces: string[]
  /**
   * 数量是引擎摊的还是自己填的。manual 时卡片右下角出现填写框，
   * 写进的还是同一份 overrides —— 点菜页和采购清单改的是同一个数。
   */
  qtyMode: QtyMode
  /**
   * 勾选带走的「基本」成品调料 id（蒜蓉辣酱、蜂蜜这类买来直接用的）。
   * 与 sauces 分开：那是自己配的方子，这是菜市场一瓶一瓶的东西。
   */
  basics: string[]
  /**
   * 手动改过的采购量：键是行号，值是新数量。
   * 0 = 这次不买（清单上留一行划掉线，但不进复制文本与图片）；
   * 缺席 = 用引擎算出来的默认量。
   */
  overrides: Record<string, number>
  /**
   * 把某一行的买法换成别的量词（"10 片" 改成 "10 包"）。
   * 只换标签、不换数字 —— 数据里没有单件净重，换算就是凭空编一个克数。
   */
  unitChoices: Record<string, ServeUnit>
  conflictChoices: Record<string, string>
  /** 各分组卡片末尾手动补的那一行，只影响清单，不参与肉量/串数/炭/配方的推导 */
  customs: CustomItem[]
}

export type ShoppingLine = {
  ingredientId: string
  name: LocalText
  /** 生效数量：被手动改过就是改后的值。0 表示不买，null 表示资料缺口 */
  amount: number | null
  /** 引擎默认量，用于"恢复默认"按钮与"这行被我动过"的判断 */
  baseAmount: number | null
  unit: ServeUnit
  /** 行自带的量词覆盖（鸡翅按只、香肠按条），缺席就用 UNIT_LABELS[unit] */
  unitLabel?: LocalText
  confidence: Measure['confidence']
  note?: LocalText
  /** 调料与耗材里的可选项，清单上标"按需" */
  optional?: boolean
  /** 一句话用途，跟在名字后面；纯蘸酱刻意没有 —— 缺席即必需 */
  use?: LocalText
}

export type ShoppingGroup = { id: PurchaseGroupId; label: LocalText; lines: ShoppingLine[] }

export type ShoppingList = {
  groups: ShoppingGroup[]
  totalMeatGrams: number
  totalSkewers: number
  charcoalGrams: number
}

export type RecipePlanLine = { name: LocalText; amount: string; unit: RecipeItem['unit'] }

export type RecipePlan = {
  id: string
  kind: RecipeKind
  name: LocalText
  /** 缩放依据的说明，如"按 2.8kg 肉缩放" */
  scaledTo: LocalText
  lines: RecipePlanLine[]
  timing?: LocalText
  glutenFreeSwap?: LocalText
  note?: LocalText
}

export type TimelineEntry = {
  id: string
  offsetMin: number
  /** 真实钟点 HH:MM，由开烤时间推导 */
  clock: string
  durationMin: Measure
  phase: TimelinePhase
  title: LocalText
  body: LocalText
}

export type EquipmentPlan = {
  grill: GrillTier
  charcoalOptions: CharcoalType[]
  batches: {
    totalSkewers: number
    capacity: number
    batchCount: number
    /** 单批平均耗时（分钟区间） */
    perBatchMin: Range
    /** 全部批次累计烤制窗口 */
    totalMin: Range
  }
}

export type SafetyNotice = { id: string; title: LocalText; body: LocalText }

export type BarbecuePlan = {
  input: PlannerInput
  shopping: ShoppingList
  marinades: RecipePlan[]
  seasonings: RecipePlan[]
  timeline: TimelineEntry[]
  equipment: EquipmentPlan
  safety: SafetyNotice[]
}
