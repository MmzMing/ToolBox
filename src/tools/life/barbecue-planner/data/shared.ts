import type {
  AppetiteTier,
  CharcoalType,
  Conflict,
  CuisineId,
  DietTag,
  EquipmentMode,
  GrillTier,
  HeatLevel,
  LocalText,
  Measure,
  PurchaseGroupId,
  RecipeKind,
  ServeUnit,
} from '../types'
import { num, range } from '../measure'

/* ------------------------------------------------------------------ 菜系 */

export const CUISINES = [
  { id: 'cn', name: { zh: '中式烧烤', en: 'Chinese skewers' } },
  { id: 'jp', name: { zh: '日式烧鸟', en: 'Yakitori' } },
  { id: 'kr', name: { zh: '韩式烤肉', en: 'Korean BBQ' } },
  { id: 'us', name: { zh: '美式 BBQ', en: 'American BBQ' } },
] as const satisfies readonly { id: CuisineId; name: LocalText }[]

/* ------------------------------------------------------------------ 饭量档 */

export const APPETITE_TIERS = [
  {
    id: 'light',
    name: { zh: '偏小', en: 'Light' },
    hint: { zh: '有主食/老人小孩多', en: 'Breads or mixed ages' },
  },
  {
    id: 'standard',
    name: { zh: '标准', en: 'Standard' },
    hint: { zh: '普通聚会', en: 'Typical party' },
  },
  { id: 'heavy', name: { zh: '偏大', en: 'Heavy' }, hint: { zh: '纯肉无主食', en: 'Meat only' } },
] as const satisfies readonly { id: AppetiteTier; name: LocalText; hint: LocalText }[]

/* ------------------------------------------------------------------ 忌口 */

export const DIET_TAGS = [
  { id: 'noSpicy', name: { zh: '不吃辣', en: 'No spicy' } },
  { id: 'vegetarianFirst', name: { zh: '素食优先', en: 'Veg first' } },
  { id: 'glutenFree', name: { zh: '无麸质', en: 'Gluten-free' } },
  { id: 'noSeafood', name: { zh: '不吃海鲜', en: 'No seafood' } },
  { id: 'kidFriendly', name: { zh: '儿童友好', en: 'Kid friendly' } },
] as const satisfies readonly { id: DietTag; name: LocalText }[]

/* ------------------------------------------------------------------ 采购分组（数组顺序即清单顺序） */

export const PURCHASE_GROUPS = [
  { id: 'mammal', name: { zh: '畜肉', en: 'Red meat' } },
  { id: 'poultry', name: { zh: '禽肉', en: 'Poultry' } },
  { id: 'seafood', name: { zh: '海鲜河鲜', en: 'Seafood' } },
  { id: 'vegetable', name: { zh: '蔬菜', en: 'Vegetables' } },
  { id: 'soy', name: { zh: '豆制品', en: 'Bean products' } },
  { id: 'staple', name: { zh: '主食', en: 'Staples' } },
  { id: 'condiment', name: { zh: '调料', en: 'Seasonings' } },
  { id: 'consumable', name: { zh: '耗材', en: 'Supplies' } },
] as const satisfies readonly { id: PurchaseGroupId; name: LocalText }[]

/**
 * 点菜页里自由勾选的调料分类，顺序即页面顺序。
 * 腌料不在里面 —— 它由所选的肉自动配套，不占用户的选择预算。
 */
export const RECIPE_KIND_LABELS = [
  { id: 'dryRub', name: { zh: '干撒料', en: 'Dry rubs' } },
  { id: 'baste', name: { zh: '刷酱', en: 'Bastes' } },
  { id: 'dip', name: { zh: '蘸料', en: 'Dips' } },
  { id: 'salt', name: { zh: '盐', en: 'Salt' } },
] as const satisfies readonly { id: RecipeKind; name: LocalText }[]

/** 采购清单的计量单位文案（数据层单一来源，序列化工具与 UI 共用） */
export const UNIT_LABELS: Record<ServeUnit, LocalText> = {
  gram: { zh: 'g', en: 'g' },
  skewer: { zh: '串', en: 'skewers' },
  piece: { zh: '个', en: 'pieces' },
  portion: { zh: '份', en: 'portions' },
  slice: { zh: '片', en: 'slices' },
  stick: { zh: '根', en: 'sticks' },
  head: { zh: '头', en: 'heads' },
  pack: { zh: '包', en: 'packs' },
  bottle: { zh: '瓶', en: 'bottles' },
  roll: { zh: '卷', en: 'rolls' },
  pair: { zh: '双', en: 'pairs' },
}

/* ------------------------------------------------------------------ 设备与火力 */

export const EQUIPMENT_MODES = [
  { id: 'charcoal', name: { zh: '炭烤炉', en: 'Charcoal grill' } },
  { id: 'gas', name: { zh: '燃气烤炉', en: 'Gas grill' } },
  { id: 'airFryer', name: { zh: '空气炸锅', en: 'Air fryer' } },
  { id: 'homeOven', name: { zh: '烤箱', en: 'Home oven' } },
  { id: 'stovetopPan', name: { zh: '家用煎锅', en: 'Stovetop pan' } },
  { id: 'smoker', name: { zh: '美式烟熏炉', en: 'Smoker' } },
] as const satisfies readonly { id: EquipmentMode; name: LocalText }[]

export const HEAT_LEVELS = {
  strong: { zh: '大火', en: 'High heat' },
  medium: { zh: '中火', en: 'Medium heat' },
  gentle: { zh: '文火', en: 'Low heat' },
} as const satisfies Record<HeatLevel, LocalText>

/** 火力档 ↔ 炉温与手掌测火法（来源：户外烧烤指南的手测口径） */
export const HEAT_ZONE_TABLE = [
  { level: 'strong', tempC: range(232, 288), handSeconds: 2 },
  { level: 'medium', tempC: range(177, 232), handSeconds: 4 },
  { level: 'gentle', tempC: range(121, 177), handSeconds: 6 },
] as const satisfies readonly {
  level: HeatLevel
  tempC: { min: number; max: number }
  handSeconds: number
}[]

/* ------------------------------------------------------------------ 人均基准 */

export const PER_PERSON_BASELINE: Record<
  AppetiteTier,
  {
    meat: Measure
    seafood: Measure
    vegetable: Measure
    soy: Measure
    staple: Measure
    skewers: Measure
    /** 三档炭量不是调研口径，是按一场用户实测校准出来的，依据写在各档 basis 里 */
    charcoal: Measure
  }
> = {
  light: {
    meat: num(200, 200),
    seafood: num(60, 60, 'derived', {
      zh: '公开清单未量化海鲜；按烤虾 3–4 只/人 ×18g 可食 + 2 只生蚝折算',
      en: 'Not published; derived from 3–4 prawns plus 2 oysters per person',
    }),
    vegetable: num(100, 100, 'derived', {
      zh: '"植物类须占三成"口径在小份下的折算',
      en: 'One-third-of-plate rule at the small share',
    }),
    soy: num(50, 50, 'derived', {
      zh: '无来源；按折半替代肉类的经验值推算',
      en: 'No source; derived as a half-replacement of meat',
    }),
    staple: num(80, 80),
    skewers: num(13, 13, 'derived', {
      zh: '按小串 15g/串 与肉 200g 折算',
      en: '200 g ÷ 15 g skewer',
    }),
    charcoal: num(1000, 1000, 'derived', {
      zh: '按用户实测口径校准：12 人一场约 30 斤（15 kg）炭，小桌同比例下调',
      en: 'Calibrated to a field report of ~15 kg for a 12-person session, scaled proportionally',
    }),
  },
  standard: {
    meat: num(280, 280),
    seafood: num(100, 100, 'derived', {
      zh: '公开清单未量化海鲜；按 2–3 串烤虾 + 3–4 个扇贝 + 2 只生蚝折算',
      en: 'Not published; derived from prawns, scallops and oysters',
    }),
    vegetable: num(150, 150),
    soy: num(60, 60, 'derived', {
      zh: '无来源；按折半替代肉类的经验值推算',
      en: 'No source; derived as a half-replacement of meat',
    }),
    staple: num(65, 65),
    skewers: num(19, 19, 'derived', {
      zh: '15–20 串/人 × 15g 小串的区间中位',
      en: 'Mid of 15–20 skewers at 15 g',
    }),
    charcoal: num(1250, 1250, 'derived', {
      zh: '按用户实测口径校准：12 人一场约 30 斤（15 kg）炭，标准桌取三档中位',
      en: 'Calibrated to a field report of ~15 kg for a 12-person session, the middle tier',
    }),
  },
  heavy: {
    meat: num(350, 350),
    seafood: num(150, 150, 'derived', {
      zh: '公开清单未量化海鲜；肉食党口径下海鲜同比例上浮',
      en: 'Not published; scaled up with the meat-heavy tier',
    }),
    vegetable: num(190, 190),
    soy: num(70, 70, 'derived', {
      zh: '无来源；按折半替代肉类的经验值推算',
      en: 'No source; derived as a half-replacement of meat',
    }),
    staple: num(50, 50),
    skewers: num(23, 23, 'derived', {
      zh: '肉食党 320–350g ÷ 15g 小串',
      en: '320–350 g ÷ 15 g skewer',
    }),
    charcoal: num(1500, 1500, 'derived', {
      zh: '按用户实测口径校准：12 人一场约 30 斤（15 kg）炭，大桌同比例上浮',
      en: 'Calibrated to a field report of ~15 kg for a 12-person session, scaled up for the heavy tier',
    }),
  },
}

/** 食材 group → 采购池；condiment/consumable 不参与池分配，必须自带 perPerson */
export const POOL_OF_GROUP: Partial<
  Record<PurchaseGroupId, 'meat' | 'seafood' | 'vegetable' | 'soy' | 'staple'>
> = {
  mammal: 'meat',
  poultry: 'meat',
  seafood: 'seafood',
  vegetable: 'vegetable',
  soy: 'soy',
  staple: 'staple',
}

/**
 * 淄博小饼三件套的实测效应：单吃肉约 20 串才饱，配小饼卷葱约 10 串即饱。
 * 开启「有饼」时串数按此系数压缩。
 */
export const BING_SKEWER_FACTOR = 0.5

/* ------------------------------------------------------------------ 炉具与炭 */

export const GRILL_TIERS: GrillTier[] = [
  {
    id: 'g30',
    lengthCm: 30,
    people: range(1, 3),
    batchSkewers: num(8, 10, 'derived', {
      zh: '按 150cm≈40 串线性折算',
      en: 'Scaled from 150 cm ≈ 40 skewers',
    }),
  },
  {
    id: 'g60',
    lengthCm: 60,
    people: range(4, 5),
    batchSkewers: num(16, 20, 'derived', {
      zh: '按 150cm≈40 串线性折算',
      en: 'Scaled from 150 cm ≈ 40 skewers',
    }),
  },
  {
    id: 'g80',
    lengthCm: 80,
    people: range(6, 8),
    batchSkewers: num(21, 24, 'derived', {
      zh: '按 150cm≈40 串线性折算',
      en: 'Scaled from 150 cm ≈ 40 skewers',
    }),
  },
  {
    id: 'g120',
    lengthCm: 120,
    people: range(9, 14),
    batchSkewers: num(32, 36, 'derived', {
      zh: '按 150cm≈40 串线性折算',
      en: 'Scaled from 150 cm ≈ 40 skewers',
    }),
  },
  {
    id: 'g150',
    lengthCm: 150,
    people: range(15, 20),
    // 唯一有明确来源的单批产能数字
    batchSkewers: num(40, 40),
  },
]

export const CHARCOAL_TYPES: CharcoalType[] = [
  {
    id: 'fruitwood',
    name: { zh: '果木炭', en: 'Fruitwood charcoal' },
    burnHours: num(1.5, 2),
    smoke: 'low',
    flavor: {
      zh: '增添天然果木熏香；梨木宜牛羊肉，荔枝木温度最高、解腻宜五花',
      en: 'Adds fruitwood smoke; lychee runs hottest and cuts fat',
    },
    priceTier: 2,
    bestFor: { zh: '追求风味加分，需中途补炭', en: 'Flavour first; expect to top up' },
  },
  {
    id: 'briquette',
    name: { zh: '机制炭', en: 'Charcoal briquette' },
    burnHours: num(3, 4),
    smoke: 'none',
    flavor: {
      zh: '烟气纯净，完全保留肉本身原香；温度波动 ≤50℃，几乎不窜明火',
      en: 'Clean smoke, ≤50 °C swing, minimal flare-ups',
    },
    priceTier: 1,
    bestFor: { zh: '长时间高频、人多、性价比', en: 'Long sessions and big crowds' },
  },
  {
    id: 'bamboo',
    name: { zh: '竹炭', en: 'Bamboo charcoal' },
    burnHours: num(1, 1),
    smoke: 'none',
    flavor: { zh: '火力温和平稳、几乎无烟', en: 'Mild and steady, almost smokeless' },
    priceTier: 2,
    bestFor: { zh: '新手、家庭偶尔、主烤海鲜蔬菜', en: 'Beginners, seafood and veg' },
  },
  {
    id: 'binchotan',
    name: { zh: '备长炭', en: 'Binchotan' },
    burnHours: num(4, 6),
    smoke: 'none',
    flavor: {
      zh: '1200℃炭化、含水 <1%、远红外，短时烤透且表面干爽',
      en: '1200 °C char, <1 % moisture, far-infrared, crisp surface',
    },
    priceTier: 3,
    bestFor: { zh: '烧鸟与追求表皮酥脆', en: 'Yakitori and crisp skin' },
  },
]

/** 竹签/木签使用前的浸水时长，防止上炉即焦 */
export const SKEWER_SOAK_MIN = num(30, 30)

/* ------------------------------------------------------------------ 冲突项 */

export const CONFLICTS: Conflict[] = [
  {
    id: 'grill-order',
    title: { zh: '上串顺序的两种口径', en: 'Two grilling-order schools' },
    defaultVariantId: 'heat-zone',
    variants: [
      {
        id: 'category',
        label: { zh: '按类别：肉→菜→主食→海鲜', en: 'By category: meat → veg → staple → seafood' },
        body: {
          zh: '先烤肉类让油脂滴落助燃，海鲜压后避免串味。',
          en: 'Meat first so dripping fat feeds the fire; seafood last to avoid flavour transfer.',
        },
      },
      {
        id: 'heat-zone',
        label: { zh: '按火力分带：旺火薄肉 / 中火翅虾 / 文火素菜', en: 'By heat zone' },
        body: {
          zh: '烤网同时划出三个温区，薄肉串在旺火区、鸡翅大虾在中火区、素菜在文火区，效率更高。',
          en: 'Split the grate into three zones and run thin skewers, wings/prawns and vegetables in parallel.',
        },
      },
    ],
  },
  {
    id: 'thaw-time',
    title: { zh: '冷藏解冻时长的两种口径', en: 'Two fridge-thaw timings' },
    defaultVariantId: 'fast',
    variants: [
      {
        id: 'fast',
        label: { zh: '每 500g 约 5–8 小时', en: '≈5–8 h per 500 g' },
        body: {
          zh: '市场监管局的科普口径，小份肉切得薄时成立。',
          en: 'Market-regulator guidance; holds for thin small cuts.',
        },
      },
      {
        id: 'slow',
        label: { zh: '每 500g 需 12–24 小时', en: '12–24 h per 500 g' },
        body: {
          zh: '医疗科普口径，厚块与安全余量按这条更稳。',
          en: 'Medical guidance; safer for thick roasts.',
        },
      },
    ],
  },
  {
    id: 'zibo-scallion',
    title: { zh: '淄博卷饼用哪段葱', en: 'Which scallion in Zibo wraps' },
    defaultVariantId: 'thin',
    variants: [
      {
        id: 'thin',
        label: { zh: '本地小香葱（比小拇指细）', en: 'Local thin scallion' },
        body: {
          zh: '主流说法，取葱白段入饼。',
          en: 'The common account; use the white part in the wrap.',
        },
      },
      {
        id: 'big',
        label: { zh: '整根大葱', en: 'Whole Welsh onion' },
        body: { zh: '另一派记为整根大葱。', en: 'Another account records a whole onion.' },
      },
    ],
  },
  {
    id: 'jinzhou-style',
    title: { zh: '锦州烧烤的"生烤 / 熟烤"', en: 'Jinzhou raw-grill vs pre-cooked' },
    defaultVariantId: 'both',
    variants: [
      {
        id: 'both',
        label: { zh: '两条路线并存', en: 'Both routes coexist' },
        body: {
          zh: '来源只说明存在生烤与熟烤之别，未展开工艺差异，此处不做定量结论。',
          en: 'Sources only note the two schools exist; no process detail is given.',
        },
      },
      {
        id: 'marinate',
        label: { zh: '熟烤＝腌/卤后再烤', en: 'Pre-cooked means marinated/brined' },
        body: {
          zh: '按字面工艺理解：先腌或先卤再上炉，适合内脏与厚件。',
          en: 'Read literally as marinated or braised before the grill; suits offal and thick cuts.',
        },
      },
    ],
  },
]

/* ------------------------------------------------------------------ 缺口登记 */

/** 明确查不到可溯源数字的条目，UI 据此提示而不是静默兜底 */
export const KNOWN_GAPS: readonly { field: string; reason: LocalText }[] = [
  {
    field: 'seafood.perPerson',
    reason: {
      zh: '人均海鲜克数无公开量化来源，按肉量 15–30% 置换推算',
      en: 'No public per-person figure; derived by swapping 15–30 % of meat',
    },
  },
  {
    field: 'soy.perPerson',
    reason: {
      zh: '人均豆制品克数无来源，按折半替代肉推算',
      en: 'No source; derived as half-replacement of meat',
    },
  },
  {
    field: 'drinks.volume',
    reason: {
      zh: '饮品只查到「≥2 份/人」，无毫升基准',
      en: 'Only "≥2 portions per person" is documented',
    },
  },
  {
    field: 'grilled-fruit',
    reason: {
      zh: '烤凤梨/烤桃的用量与时间完全空白',
      en: 'Grilled fruit has no documented quantity or timing',
    },
  },
  {
    field: 'korean.griddle-temp',
    reason: {
      zh: '韩式烤盘温度无可溯源 ℃ 数值',
      en: 'No sourced temperature for the Korean griddle',
    },
  },
  {
    field: 'american.alabama-white',
    reason: {
      zh: 'Alabama white 酱基底未能读到正文核实',
      en: 'Alabama white base could not be verified',
    },
  },
]

/** 贝类吐沙：花甲上桌前必须预留 */
export const SHELLFISH_PURGE_MIN = num(120, 120)

/** 每 10 分钟查验一次熟度 */
export const DONENESS_CHECK_INTERVAL_MIN = num(10, 10)

/** 一炉炭的补炭提醒（果木炭下沿） */
export const CHARCOAL_TOPUP_MIN = num(90, 120)
