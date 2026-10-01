import { gap, num } from '../measure'
import type { Ingredient, Recipe } from '../types'

/**
 * 美式 BBQ：低温长时烟熏，核心变量是「出成率」。
 * 肉池按生重给出，带 yieldPct 的项在引擎里按 生重 = 熟重 ÷ 出成率 上浮，
 * 这正是 catering 采购的通行算法（1 lb 成品 ≈ 2.6 人）。
 */
export const US_INGREDIENTS: Ingredient[] = [
  {
    id: 'us-brisket',
    cuisine: 'us',
    name: { zh: '牛胸肉', en: 'Brisket' },
    group: 'mammal',
    unit: 'gram',
    qty: { mode: 'pool' },
    cook: {
      heat: 'gentle',
      windows: [
        {
          mode: 'smoker',
          minutes: { min: 360, max: 720 },
          note: {
            zh: '225–250 ℉（约 107–121 ℃），0.6–0.8 h/lb；10 磅 6–9 h，15 磅 10–12 h，20 磅 12–16 h',
            en: '225–250 °F, 0.6–0.8 h per pound',
          },
        },
      ],
    },
    prep: ['temper'],
    marinadeIds: [],
    coreTempId: 'whole-beef',
    yieldPct: num(43, 43),
    excludedBy: [],
    spice: 0,
    note: {
      zh: '整块 packer 通常 5–8 kg，无法按人头拆买；165–175 ℉ 就已经能用叉撕开，但 198–205 ℉ 才真正嫩。下炉前室温回温 1–2 h。',
      en: 'A packer is 5–8 kg and cannot be bought per head. Fork-tender at 165–175 °F, truly tender at 198–205 °F.',
    },
  },
  {
    id: 'us-pork-butt',
    cuisine: 'us',
    name: { zh: '猪肩／手撕猪肉', en: 'Pork butt (pulled pork)' },
    group: 'mammal',
    unit: 'gram',
    qty: { mode: 'pool' },
    cook: {
      heat: 'gentle',
      windows: [
        {
          mode: 'smoker',
          minutes: { min: 300, max: 600 },
          note: { zh: '中心 180–200 ℉ 出炉', en: 'Pull at 180–200 °F core' },
        },
      ],
    },
    prep: ['temper'],
    marinadeIds: [],
    coreTempId: 'ground-pork',
    yieldPct: num(50, 50),
    excludedBy: [],
    spice: 0,
    note: {
      zh: '出成率 50%，等于一半重量在烟熏里蒸发；做汉堡按每人 1 份熟肉估算。',
      en: 'Half the weight leaves as smoke and moisture.',
    },
  },
  {
    id: 'us-baby-back-ribs',
    cuisine: 'us',
    name: { zh: '猪小肋排', en: 'Baby back ribs' },
    group: 'mammal',
    unit: 'portion',
    qty: {
      mode: 'perPerson',
      perPerson: { light: num(0.33, 0.33), standard: num(0.5, 0.5), heavy: num(0.5, 0.5) },
    },
    cook: {
      heat: 'gentle',
      windows: [
        {
          mode: 'smoker',
          minutes: { min: 360, max: 360 },
          note: {
            zh: '3-2-1 法：3 h 烟熏 → 2 h 包裹 → 1 h 刷酱；180 ℉ 起后升 225 ℉',
            en: '3-2-1: 3 h smoke, 2 h wrap, 1 h sauce',
          },
        },
      ],
    },
    prep: ['temper'],
    marinadeIds: [],
    coreTempId: 'whole-pork',
    yieldPct: gap({
      zh: '猪小肋排的出成率未查到可溯源数值',
      en: 'No sourced yield for baby backs',
    }),
    excludedBy: [],
    spice: 0,
    note: {
      zh: '2 副 baby back = 6 人份（唯一主肉口径）；若还有其他肉，1 副可撑 3 人。这里的 perPerson 按"唯一主肉"给。',
      en: 'Two racks feed six as the only meat; one rack stretches to three if sharing.',
    },
  },
  {
    id: 'us-pork-loin',
    cuisine: 'us',
    name: { zh: '猪腰肉', en: 'Pork loin' },
    group: 'mammal',
    unit: 'gram',
    qty: { mode: 'pool' },
    cook: {
      heat: 'medium',
      windows: [
        { mode: 'smoker', minutes: { min: 120, max: 180 } },
        { mode: 'charcoal', minutes: { min: 30, max: 45 } },
      ],
    },
    prep: ['temper'],
    marinadeIds: [],
    coreTempId: 'whole-pork',
    yieldPct: num(65, 65),
    excludedBy: [],
    spice: 0,
    note: {
      zh: '出成率 65%，比猪肩温和得多，适合不想守一整天的场合。',
      en: '65 % yield — far friendlier than a butt.',
    },
  },
  {
    id: 'us-sausage',
    cuisine: 'us',
    name: { zh: '烟熏香肠', en: 'Smoked sausage' },
    group: 'mammal',
    unit: 'stick',
    counter: { zh: '条', en: 'pcs' },
    qty: {
      mode: 'perPerson',
      perPerson: { light: num(0.5, 0.5), standard: num(0.75, 0.75), heavy: num(1, 1) },
    },
    cook: {
      heat: 'medium',
      windows: [
        { mode: 'charcoal', minutes: { min: 10, max: 15 } },
        { mode: 'smoker', minutes: { min: 60, max: 90 } },
      ],
    },
    prep: [],
    marinadeIds: [],
    coreTempId: 'ground-pork',
    yieldPct: num(65, 65, 'derived', {
      zh: '按 pork loin 出成率借用',
      en: 'Borrowed from the loin figure',
    }),
    excludedBy: [],
    spice: 1,
    note: {
      zh: '来源口径是"1 lb 生香肠 = 4 人"，约合每人 113 g 生重；本表按一根约 100 g 折算。',
      en: 'Source says 1 lb feeds four; that is roughly one 100 g link a head.',
    },
  },
  {
    id: 'us-chicken-quarter',
    cuisine: 'us',
    name: { zh: '带骨鸡块', en: 'Chicken quarters' },
    group: 'poultry',
    unit: 'piece',
    qty: {
      mode: 'perPerson',
      perPerson: { light: num(1.5, 1.5), standard: num(2.5, 2.5), heavy: num(2.5, 2.5) },
    },
    cook: {
      heat: 'medium',
      windows: [
        { mode: 'smoker', minutes: { min: 90, max: 150 } },
        { mode: 'charcoal', minutes: { min: 35, max: 45 } },
      ],
    },
    prep: ['marinate'],
    marinadeIds: [],
    coreTempId: 'poultry',
    yieldPct: num(34, 34),
    excludedBy: [],
    spice: 0,
    note: {
      zh: '整鸡出成率只有 34%，骨头占掉大半重量；作为唯一主肉每人 2.5 块，有其他肉时 1.5 块。',
      en: 'Only 34 % of a whole chicken survives as meat — bone is most of the invoice.',
    },
  },
  {
    id: 'us-corn',
    cuisine: 'us',
    name: { zh: '带皮玉米', en: 'Corn on the cob' },
    group: 'vegetable',
    unit: 'portion',
    qty: {
      mode: 'perPerson',
      perPerson: { light: num(0.5, 0.5), standard: num(1, 1), heavy: num(1, 1) },
    },
    cook: {
      heat: 'medium',
      windows: [
        {
          mode: 'charcoal',
          minutes: { min: 15, max: 25 },
          note: { zh: '留内层皮直接焖烤', en: 'Leave the inner husks on' },
        },
      ],
    },
    prep: [],
    marinadeIds: [],
    excludedBy: [],
    spice: 0,
  },
  {
    id: 'us-bun',
    cuisine: 'us',
    name: { zh: '汉堡胚／白面包', en: 'Buns / white bread' },
    group: 'staple',
    unit: 'piece',
    qty: {
      mode: 'perPerson',
      perPerson: { light: num(1, 1), standard: num(1, 1), heavy: num(2, 2) },
    },
    cook: {
      heat: 'gentle',
      windows: [
        {
          mode: 'charcoal',
          minutes: { min: 1, max: 2 },
          note: { zh: '切面烤到微焦即可', en: 'Just toast the cut face' },
        },
      ],
    },
    prep: [],
    marinadeIds: [],
    excludedBy: ['glutenFree', 'vegetarianFirst'],
    spice: 0,
    note: {
      zh: '手撕猪肉与牛胸肉都要靠面包兜住，压扁的白面包是德州传统。',
      en: 'Pulled pork and brisket both need bread; squashed white slices are the Texas way.',
    },
  },
]

/* ------------------------------------------------------------------ dry rub / 酱汁 */

export const US_RECIPES: Recipe[] = [
  {
    id: 'us-rub-texas',
    kind: 'dryRub',
    cuisine: 'us',
    name: { zh: 'Texas 极简擦料', en: 'Texas dalmatian rub' },
    base: { kind: 'meat', baseGrams: 1000 },
    items: [
      { name: { zh: '盐', en: 'Salt' }, qty: num(20, 30), unit: 'g' },
      { name: { zh: '现磨黑胡椒', en: 'Coarse black pepper' }, qty: num(10, 15), unit: 'g' },
      {
        name: {
          zh: '蒜粉／洋葱粉／辣椒粉（可选）',
          en: 'Garlic / onion powder / paprika (optional)',
        },
        qty: num(0, 0),
        unit: 'to-taste',
      },
    ],
    appliesTo: ['us-brisket', 'us-pork-loin'],
    timing: {
      zh: '下炉前均匀擦满，不腌；中央德州用橡木可连熏 18 h。',
      en: 'Apply just before the fire; central Texas runs oak for up to 18 h.',
    },
    spice: 0,
    note: {
      zh: '这一系的立场是"肉本身才是主角"，酱通常不上桌。',
      en: 'The meat is the point — sauce often never reaches the table.',
    },
  },
  {
    id: 'us-rub-kc',
    kind: 'dryRub',
    cuisine: 'us',
    name: { zh: 'Kansas City 甜擦料', en: 'Kansas City rub' },
    base: { kind: 'meat', baseGrams: 1000 },
    items: [
      {
        name: { zh: '棕糖', en: 'Brown sugar' },
        qty: num(60, 60, 'derived', {
          zh: '原文给"棕糖 : 红椒粉 = 2:1"，按每 kg 肉约 90 g 混合料折算',
          en: 'Source gives a 2:1 sugar-to-paprika ratio; sized at ~90 g per kg',
        }),
        unit: 'g',
      },
      {
        name: { zh: '红椒粉（paprika）', en: 'Paprika' },
        qty: num(30, 30, 'derived', { zh: '同上，比例 1 份', en: 'Same ratio, one part' }),
        unit: 'g',
      },
      {
        name: { zh: '蒜粉', en: 'Garlic powder' },
        qty: num(15, 15, 'derived', {
          zh: '原文只列种类未给克数，按同系列配方的常见占比推算',
          en: 'Source lists ingredients only; proportion estimated',
        }),
        unit: 'g',
      },
      { name: { zh: '盐', en: 'Salt' }, qty: num(20, 20), unit: 'g' },
      {
        name: { zh: '辣椒粉', en: 'Cayenne' },
        qty: num(5, 5, 'derived', { zh: '原文只列种类，用量推算', en: 'Quantity estimated' }),
        unit: 'g',
      },
    ],
    appliesTo: ['us-brisket', 'us-pork-butt', 'us-baby-back-ribs', 'us-sausage', 'us-corn'],
    timing: {
      zh: '提前擦好让糖渗出结壳，这层 bark 是 KC 风格的门面。',
      en: 'Apply early so the sugar draws out and sets the bark.',
    },
    spice: 1,
    note: {
      zh: '棕糖与红椒粉的 2:1 比例是来源明写的；其余四项来源只给种类不给克数，已标为推算。',
      en: 'Only the 2:1 sugar-to-paprika ratio is documented; the rest are flagged as estimates.',
    },
  },
  {
    id: 'us-rub-memphis',
    kind: 'dryRub',
    cuisine: 'us',
    name: { zh: 'Memphis 九香料擦料', en: 'Memphis rub' },
    base: { kind: 'meat', baseGrams: 1000 },
    items: [
      { name: { zh: '盐', en: 'Salt' }, qty: num(20, 20), unit: 'g' },
      {
        name: { zh: '糖', en: 'Sugar' },
        qty: num(40, 40, 'derived', {
          zh: '来源只列九种原料未给配比，按 Memphis 常见的糖盐 2:1 推算',
          en: 'Source lists the nine ingredients without ratios; sugar:salt 2:1 assumed',
        }),
        unit: 'g',
      },
      {
        name: { zh: '红椒粉', en: 'Paprika' },
        qty: num(20, 20, 'derived', { zh: '用量推算', en: 'Estimated' }),
        unit: 'g',
      },
      {
        name: { zh: '蒜粉', en: 'Garlic powder' },
        qty: num(10, 10, 'derived', { zh: '用量推算', en: 'Estimated' }),
        unit: 'g',
      },
      {
        name: { zh: '黑胡椒', en: 'Black pepper' },
        qty: num(8, 8, 'derived', { zh: '用量推算', en: 'Estimated' }),
        unit: 'g',
      },
      {
        name: { zh: '姜粉', en: 'Ground ginger' },
        qty: num(5, 5, 'derived', { zh: '用量推算', en: 'Estimated' }),
        unit: 'g',
      },
      {
        name: { zh: '洋葱粉', en: 'Onion powder' },
        qty: num(10, 10, 'derived', { zh: '用量推算', en: 'Estimated' }),
        unit: 'g',
      },
      {
        name: { zh: '卡宴辣椒', en: 'Cayenne' },
        qty: num(4, 4, 'derived', { zh: '用量推算', en: 'Estimated' }),
        unit: 'g',
      },
      {
        name: { zh: '迷迭香', en: 'Rosemary' },
        qty: num(3, 3, 'derived', { zh: '用量推算', en: 'Estimated' }),
        unit: 'g',
      },
    ],
    appliesTo: ['us-pork-butt', 'us-pork-loin', 'us-chicken-quarter', 'us-baby-back-ribs'],
    timing: {
      zh: 'Memphis 的干擦与"sauced middle"两条路线并存，猪肋排最典型。',
      en: 'Memphis runs both dry and sauced-middle; ribs are the showcase.',
    },
    spice: 2,
  },
  {
    id: 'us-sauce-kc',
    kind: 'dip',
    cuisine: 'us',
    name: { zh: 'Kansas City 厚酱', en: 'Kansas City sauce' },
    base: {
      kind: 'batch',
      batchGrams: 500,
      covers: { zh: '约 3–4 kg 肉', en: 'about 3–4 kg of meat' },
    },
    items: [
      { name: { zh: '番茄酱', en: 'Tomato ketchup' }, qty: num(240, 240), unit: 'g' },
      {
        name: { zh: '碎番茄', en: 'Tomato sauce' },
        qty: num(80, 80, 'derived', {
          zh: '来源只列种类未给克数，按 1/3 番茄酱量推算',
          en: 'Ratio estimated',
        }),
        unit: 'g',
      },
      {
        name: { zh: '棕糖', en: 'Brown sugar' },
        qty: num(60, 60, 'derived', { zh: '用量推算', en: 'Estimated' }),
        unit: 'g',
      },
      {
        name: { zh: '苹果醋', en: 'Apple cider vinegar' },
        qty: num(45, 45, 'derived', { zh: '用量推算', en: 'Estimated' }),
        unit: 'ml',
      },
      {
        name: { zh: '糖蜜', en: 'Molasses' },
        qty: num(30, 30, 'derived', { zh: '用量推算', en: 'Estimated' }),
        unit: 'g',
      },
      {
        name: { zh: '香料（洋葱粉／蒜粉／胡椒）', en: 'Spices' },
        qty: num(0, 0),
        unit: 'to-taste',
      },
    ],
    durationMin: num(15, 20),
    appliesTo: ['us-baby-back-ribs', 'us-pork-butt', 'us-sausage', 'us-brisket'],
    timing: {
      zh: '厚、甜、挂得住；最后一小时才刷，早刷糖会焦。',
      en: 'Thick and sweet; brush only in the last hour or the sugar scorches.',
    },
    spice: 0,
    note: {
      zh: '来源给出的是原料种类清单而非配比，除番茄酱外的克数均为推算并已标注。',
      en: 'The source names the ingredients, not the ratios; all but the ketchup are flagged estimates.',
    },
  },
  {
    id: 'us-sauce-carolina',
    kind: 'dip',
    cuisine: 'us',
    name: { zh: '东卡罗来纳醋酱', en: 'Eastern Carolina vinegar sauce' },
    base: {
      kind: 'batch',
      batchGrams: 300,
      covers: { zh: '约 2–3 kg 猪肉', en: 'about 2–3 kg of pork' },
    },
    items: [
      {
        name: { zh: '苹果醋', en: 'Apple cider vinegar' },
        qty: num(240, 240, 'derived', {
          zh: '东卡口径为"纯醋"，主体是醋；水与调味补足到约 300 g',
          en: 'Eastern NC is vinegar-first; the 300 g total is assembled',
        }),
        unit: 'ml',
      },
      {
        name: { zh: '水', en: 'Water' },
        qty: num(30, 30, 'derived', { zh: '用量推算', en: 'Estimated' }),
        unit: 'ml',
      },
      {
        name: { zh: '盐／胡椒／红椒粉', en: 'Salt / pepper / crushed chilli' },
        qty: num(0, 0),
        unit: 'to-taste',
      },
    ],
    durationMin: num(5, 10),
    appliesTo: ['us-pork-butt', 'us-sausage'],
    timing: {
      zh: '全猪与猪肩的传统搭配，酸到能切开油脂。Carolina 一派还常在长时间（12–24 h）涂抹液体 mop 保湿。',
      en: 'Built for whole hog and shoulder; the Carolina school also mops for 12–24 h.',
    },
    glutenFreeSwap: {
      zh: '这一版天然最接近无麸质（纯醋 + 香料），比 KC 厚酱安全得多',
      en: 'Naturally the closest to gluten-free of the regional sauces',
    },
    spice: 1,
  },
  {
    id: 'us-sauce-alabama',
    kind: 'dip',
    cuisine: 'us',
    name: { zh: 'Alabama 白酱', en: 'Alabama white sauce' },
    base: { kind: 'batch', batchGrams: 0 },
    items: [
      {
        name: { zh: '蛋黄酱为基底的白酱', en: 'Mayonnaise-based white sauce' },
        qty: gap({
          zh: '多个候选来源（Wikipedia / Food & Wine / Allrecipes）均返回 402/403 无法读取正文，本工具不编造克数。检索标题一致指向"以蛋黄酱为基底"，仅可作为方向性提示。',
          en: 'Every candidate source returned 402/403; no quantities are invented here. Headlines point at a mayo base — treat as direction only.',
        }),
        unit: 'to-taste',
      },
    ],
    appliesTo: ['us-chicken-quarter', 'us-pork-butt'],
    timing: {
      zh: '已知它配猪肉与禽类，配比请自行查权威来源后再补。',
      en: 'Pairing is documented; look up a citable ratio before trusting any numbers.',
    },
    spice: 0,
  },
]
