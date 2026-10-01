import { num } from '../measure'
import type { Ingredient, Recipe } from '../types'

/**
 * 韩式烤肉：以「인분」为单位。
 * 韩国肉铺与烤肉店的 1 인분 有三档口径（基准 120–150 g / 烤肉店 180 g / 肉铺 200 g），
 * 主流做法是每人点 2 份，即 300–400 g，因此本系的肉池乘数高于中式（见 shared.ts）。
 */
export const KR_INGREDIENTS: Ingredient[] = [
  {
    id: 'kr-moksal',
    cuisine: 'kr',
    name: { zh: '猪颈肉', en: 'Pork neck (moksal)' },
    group: 'mammal',
    unit: 'gram',
    qty: { mode: 'pool' },
    cook: {
      heat: 'medium',
      windows: [
        { mode: 'charcoal', minutes: { min: 8, max: 12 } },
        { mode: 'stovetopPan', minutes: { min: 8, max: 10 } },
      ],
    },
    prep: ['temper'],
    marinadeIds: [],
    coreTempId: 'whole-pork',
    excludedBy: [],
    spice: 0,
    note: {
      zh: '鲜嫩，带骨煎烤更出味，熟后改刀再上桌。',
      en: 'Tender; bone-in grilling tastes better — slice after it is cooked.',
    },
  },
  {
    id: 'kr-galbi',
    cuisine: 'kr',
    name: { zh: '调味牛小排', en: 'Marinated short rib (galbi)' },
    group: 'mammal',
    unit: 'gram',
    qty: { mode: 'pool' },
    cook: {
      heat: 'gentle',
      windows: [
        {
          mode: 'charcoal',
          minutes: { min: 10, max: 16 },
          note: {
            zh: '中弱火慢烤，里外才一起湿润',
            en: 'Medium-low and slow so the centre stays wet',
          },
        },
      ],
    },
    prep: ['thaw', 'marinate'],
    marinadeIds: ['kr-m-galbi'],
    coreTempId: 'whole-beef',
    excludedBy: [],
    spice: 0,
    note: {
      zh: '需要最长的烹饪周期，慢翻至焦黄；腌足 6 h 以上、最好一天。',
      en: 'Longest cook of the plate; turn slowly to colour. Marinate 6 h, ideally a day.',
    },
  },
  {
    id: 'kr-chadolbakki',
    cuisine: 'kr',
    name: { zh: '牛五花／胸腹薄片', en: 'Brisket plate (chadolbakki)' },
    group: 'mammal',
    unit: 'gram',
    qty: { mode: 'pool' },
    cook: {
      heat: 'strong',
      windows: [
        {
          mode: 'charcoal',
          minutes: { min: 1, max: 2 },
          note: { zh: '薄片上网即翻，数秒一门', en: 'Flash sear, seconds per side' },
        },
      ],
    },
    prep: ['temper'],
    marinadeIds: [],
    coreTempId: 'whole-beef',
    excludedBy: [],
    spice: 0,
    note: {
      zh: '常规单份出品 80–100 g；薄切，旺火快炙，一慢就出油发柴。',
      en: 'Served 80–100 g; thin over fierce heat or the fat drains away.',
    },
  },
  {
    id: 'kr-sohye',
    cuisine: 'kr',
    name: { zh: '牛舌', en: 'Beef tongue (sohye)' },
    group: 'mammal',
    unit: 'gram',
    qty: { mode: 'pool' },
    cook: { heat: 'strong', windows: [{ mode: 'charcoal', minutes: { min: 2, max: 4 } }] },
    prep: ['temper'],
    marinadeIds: [],
    coreTempId: 'whole-beef',
    excludedBy: [],
    spice: 0,
    note: {
      zh: '铁网快炙出脆边，常规单份 70–100 g。',
      en: 'Fast sear for crisp edges; 70–100 g a plate.',
    },
  },
  {
    id: 'kr-salchisal',
    cuisine: 'kr',
    name: { zh: '肩胛里脊／眼肉', en: 'Shoulder tender (salchisal)' },
    group: 'mammal',
    unit: 'gram',
    qty: { mode: 'pool' },
    cook: { heat: 'strong', windows: [{ mode: 'charcoal', minutes: { min: 2, max: 4 } }] },
    prep: ['temper'],
    marinadeIds: [],
    coreTempId: 'whole-beef',
    excludedBy: [],
    spice: 0,
    note: {
      zh: '单份 80–100 g，雪花丰富，旺火封口即可，别烤过头。',
      en: '80–100 g; well marbled, so just seal the surface.',
    },
  },
  {
    id: 'kr-hanwoo',
    cuisine: 'kr',
    name: { zh: '韩牛', en: 'Hanwoo beef' },
    group: 'mammal',
    unit: 'gram',
    qty: { mode: 'pool' },
    cook: { heat: 'strong', windows: [{ mode: 'charcoal', minutes: { min: 1, max: 3 } }] },
    prep: ['temper'],
    marinadeIds: [],
    coreTempId: 'whole-beef',
    excludedBy: [],
    spice: 0,
    note: {
      zh: '顶级部位单份压到 50–80 g，靠分量而非饱腹取胜；盐麻油蘸最配。',
      en: 'Only 50–80 g a plate; the salt-and-oil dip does the work.',
    },
  },
  {
    id: 'kr-lettuce',
    cuisine: 'kr',
    name: { zh: '包肉生菜', en: 'Wrapping lettuce (sangchu)' },
    group: 'vegetable',
    unit: 'piece',
    qty: {
      mode: 'perPerson',
      perPerson: { light: num(3, 3), standard: num(5, 5), heavy: num(6, 6) },
    },
    cook: {
      heat: 'gentle',
      windows: [
        {
          mode: 'charcoal',
          minutes: { min: 0, max: 0 },
          note: { zh: '不烤，生食包肉', en: 'Not grilled — raw wrapper' },
        },
      ],
    },
    prep: [],
    marinadeIds: [],
    excludedBy: [],
    spice: 0,
    note: {
      zh: '经典包法：菜叶 + 熟肉 + 生蒜 + 米饭。苏子叶在多份备料清单标题出现但正文未核实，列为可选。',
      en: 'The classic wrap is leaf + meat + raw garlic + rice. Perilla leaf appears in lists but is unconfirmed.',
    },
  },
  {
    id: 'kr-garlic',
    cuisine: 'kr',
    name: { zh: '生蒜片', en: 'Raw garlic slices' },
    group: 'vegetable',
    unit: 'gram',
    qty: { mode: 'pool' },
    cook: {
      heat: 'gentle',
      windows: [
        {
          mode: 'charcoal',
          minutes: { min: 0, max: 0 },
          note: { zh: '生食入包', en: 'Eaten raw in the wrap' },
        },
      ],
    },
    prep: [],
    marinadeIds: [],
    excludedBy: [],
    spice: 0,
  },
  {
    id: 'kr-zucchini',
    cuisine: 'kr',
    name: { zh: '西葫芦', en: 'Zucchini slices' },
    group: 'vegetable',
    unit: 'piece',
    counter: { zh: '个', en: 'pcs' },
    qty: {
      mode: 'perPerson',
      perPerson: {
        light: num(0.4, 0.4, 'derived', {
          zh: '蔬菜池人均 100 g ÷ 一根约 250 g',
          en: '100 g vegetable pool over a ~250 g fruit',
        }),
        standard: num(0.6, 0.6, 'derived', {
          zh: '蔬菜池人均 150 g ÷ 一根约 250 g',
          en: '150 g vegetable pool over a ~250 g fruit',
        }),
        heavy: num(0.8, 0.8, 'derived', {
          zh: '蔬菜池人均 190 g ÷ 一根约 250 g',
          en: '190 g vegetable pool over a ~250 g fruit',
        }),
      },
    },
    cook: { heat: 'medium', windows: [{ mode: 'charcoal', minutes: { min: 3, max: 5 } }] },
    prep: [],
    marinadeIds: [],
    excludedBy: [],
    spice: 0,
    note: {
      zh: '备料清单里出现，烤制分钟为推算。',
      en: 'Listed in prep guides; minutes inferred.',
    },
  },
  {
    id: 'kr-rice',
    cuisine: 'kr',
    name: { zh: '米饭（包肉用）', en: 'Steamed rice' },
    group: 'staple',
    unit: 'portion',
    qty: {
      mode: 'perPerson',
      perPerson: { light: num(0.5, 0.5), standard: num(1, 1), heavy: num(1, 1) },
    },
    cook: {
      heat: 'gentle',
      windows: [
        { mode: 'charcoal', minutes: { min: 0, max: 0 }, note: { zh: '不烤', en: 'Not grilled' } },
      ],
    },
    prep: [],
    marinadeIds: [],
    excludedBy: [],
    spice: 0,
  },
  {
    id: 'kr-mu',
    cuisine: 'kr',
    name: { zh: '腌萝卜片', en: 'Pickled radish' },
    group: 'vegetable',
    unit: 'gram',
    qty: { mode: 'pool' },
    cook: {
      heat: 'gentle',
      windows: [
        {
          mode: 'charcoal',
          minutes: { min: 0, max: 0 },
          note: { zh: '配菜，不烤', en: 'A banchan, not grilled' },
        },
      ],
    },
    prep: [],
    marinadeIds: [],
    excludedBy: [],
    spice: 1,
    note: { zh: '解腻配菜，与烤盘上的肉交替入口。', en: 'The palate reset between bites of fat.' },
  },
]

/* ------------------------------------------------------------------ 配方 */

export const KR_RECIPES: Recipe[] = [
  {
    id: 'kr-m-galbi',
    kind: 'marinade',
    cuisine: 'kr',
    name: { zh: 'LA 牛小排黄金比例腌料', en: 'LA galbi golden-ratio marinade' },
    base: { kind: 'meat', baseGrams: 2000 },
    items: [
      {
        name: { zh: '酱油（韩式汤酱油）', en: 'Korean soy sauce' },
        qty: num(200, 200),
        unit: 'ml',
      },
      {
        name: { zh: '糖', en: 'Sugar' },
        qty: num(75, 75, 'derived', {
          zh: '原文 5 큰술（大勺），按 1 大匙约 15 g 折算',
          en: 'Source gives 5 tbsp; converted at ~15 g per tbsp',
        }),
        unit: 'g',
      },
      {
        name: { zh: '玉米糖浆／低聚糖', en: 'Corn syrup / oligomer' },
        qty: num(45, 45, 'derived', { zh: '原文 3 큰술', en: 'Source gives 3 tbsp' }),
        unit: 'g',
      },
      {
        name: { zh: '蒜泥', en: 'Minced garlic' },
        qty: num(30, 30, 'derived', { zh: '原文 2 큰술', en: 'Source gives 2 tbsp' }),
        unit: 'g',
      },
      {
        name: { zh: '姜泥', en: 'Minced ginger' },
        qty: num(8, 8, 'derived', { zh: '原文 0.5 큰술', en: 'Source gives ½ tbsp' }),
        unit: 'g',
      },
      {
        name: { zh: '麻油', en: 'Sesame oil' },
        qty: num(30, 30, 'derived', { zh: '原文 2 큰술', en: 'Source gives 2 tbsp' }),
        unit: 'g',
      },
      {
        name: { zh: '味醂类料酒', en: 'Cooking wine / mirin' },
        qty: num(45, 45, 'derived', { zh: '原文 3 큰술', en: 'Source gives 3 tbsp' }),
        unit: 'ml',
      },
      { name: { zh: '胡椒', en: 'Pepper' }, qty: num(0, 0), unit: 'to-taste' },
      { name: { zh: '洋葱汁', en: 'Onion juice' }, qty: num(1, 1), unit: 'piece' },
      { name: { zh: '梨汁／苹果汁', en: 'Pear or apple juice' }, qty: num(1, 1), unit: 'piece' },
      {
        name: { zh: '水（以能淹没排骨为度）', en: 'Water, enough to submerge the ribs' },
        qty: num(200, 200),
        unit: 'ml',
      },
    ],
    durationMin: num(360, 1440),
    appliesTo: ['kr-galbi'],
    timing: {
      zh: '最少 6 小时，最好腌约 1 天；中弱火慢烤才能里外都湿润。',
      en: 'At least 6 h, best about a day; slow medium-low heat keeps it wet through.',
    },
    glutenFreeSwap: {
      zh: '酱油含小麦，换标注 GF 的酱油；麻油、梨汁、蒜本身无麸质',
      en: 'The soy carries wheat — swap for a GF-labelled one; sesame oil, pear and garlic are already fine',
    },
    spice: 0,
    note: {
      zh: '梨汁／苹果汁与洋葱汁提供天然回甜和蛋白酶嫩化，全程不含辣椒，是这一系里最适合儿童与不吃辣桌面的配方。',
      en: 'Pear, apple and onion bring both sweetness and protease tenderising — zero chilli, the safest pick for kids.',
    },
  },
  {
    id: 'kr-s-salt-oil',
    kind: 'dip',
    cuisine: 'kr',
    name: { zh: '盐 + 麻油（原味派）', en: 'Salt + sesame oil' },
    base: { kind: 'people', basePeople: 4 },
    items: [
      {
        name: { zh: '粗海盐或商用蘸盐', en: 'Coarse sea salt or dip salt' },
        qty: num(8, 8),
        unit: 'g',
      },
      { name: { zh: '麻油', en: 'Sesame oil' }, qty: num(20, 20), unit: 'ml' },
    ],
    appliesTo: [
      'kr-moksal',
      'kr-chadolbakki',
      'kr-sohye',
      'kr-salchisal',
      'kr-hanwoo',
      'kr-zucchini',
    ],
    timing: {
      zh: '原味派的全部蘸料；厚切五花烤到金黄出油后直接蘸。',
      en: 'The purist dip — salt and oil, nothing else.',
    },
    spice: 0,
    note: {
      zh: '烤盘温度无可溯源 ℃ 数值（来源只说"耐高温烤盘、火力集中的燃气灶"），故本工具不给韩式烤盘标温度。',
      en: 'No sourced temperature for the Korean griddle exists, so this tool never prints one.',
    },
  },
  {
    id: 'kr-s-dip-glaze',
    kind: 'dip',
    cuisine: 'kr',
    name: { zh: '炙烤汁', en: 'Grill glaze dip' },
    base: { kind: 'people', basePeople: 4 },
    items: [
      { name: { zh: '麻油', en: 'Sesame oil' }, qty: num(15, 15), unit: 'ml' },
      { name: { zh: '酱油', en: 'Soy sauce' }, qty: num(15, 15), unit: 'ml' },
      { name: { zh: '白醋', en: 'White vinegar' }, qty: num(10, 10), unit: 'ml' },
      { name: { zh: '糖', en: 'Sugar' }, qty: num(5, 5), unit: 'g' },
    ],
    appliesTo: ['kr-galbi'],
    glutenFreeSwap: { zh: '酱油换 GF 版本', en: 'Use GF soy' },
    spice: 0,
    note: {
      zh: '来源注明可用韩式豆瓣酱或日式烧烤汁替代；ssamjang 的精确配比未能核实，故不给出克数。',
      en: 'The source allows a doubanjiang or Japanese yakiniku-sauce substitute; ssamjang ratios were never confirmed, so none are given.',
    },
  },
  {
    id: 'kr-s-mix-vinegar',
    kind: 'dip',
    cuisine: 'kr',
    name: { zh: '凉拌汁', en: 'Cold-mix dressing' },
    base: { kind: 'people', basePeople: 4 },
    items: [
      { name: { zh: '麻油', en: 'Sesame oil' }, qty: num(15, 15), unit: 'ml' },
      { name: { zh: '白醋', en: 'White vinegar' }, qty: num(15, 15), unit: 'ml' },
      { name: { zh: '盐', en: 'Salt' }, qty: num(3, 3), unit: 'g' },
      { name: { zh: '糖', en: 'Sugar' }, qty: num(5, 5), unit: 'g' },
    ],
    appliesTo: ['kr-mu', 'kr-zucchini'],
    spice: 0,
  },
  {
    id: 'kr-s-sesame',
    kind: 'dryRub',
    cuisine: 'kr',
    name: { zh: '熟芝麻收尾', en: 'Toasted sesame finish' },
    base: { kind: 'people', basePeople: 4 },
    items: [{ name: { zh: '熟芝麻', en: 'Toasted sesame seeds' }, qty: num(10, 10), unit: 'g' }],
    appliesTo: ['kr-galbi'],
    timing: {
      zh: '出锅后撒，不上炉 —— 芝麻进炭火只会变苦。',
      en: 'After it leaves the grill; sesame over coals only turns bitter.',
    },
    spice: 0,
  },
]
