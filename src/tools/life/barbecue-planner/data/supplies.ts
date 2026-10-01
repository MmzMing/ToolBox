import type { LocalText, ServeUnit } from '../types'

/**
 * 调料与耗材。这些不是"菜"，没有烤制窗口，所以单独建模：
 * 数量由人数、串数或肉量推导，而不是从采购池里抢份额。
 */
export type SupplyGroupId = 'condiment' | 'consumable'

export type SupplyQuantity =
  | { basis: 'people'; per: number }
  | { basis: 'skewers'; per: number }
  | { basis: 'meatKg'; per: number }
  | { basis: 'fixed'; amount: number }

export type Supply = {
  id: string
  group: SupplyGroupId
  name: LocalText
  unit: ServeUnit
  qty: SupplyQuantity
  /** 至少买这么多，避免 1 个人时算出 0.17 包 */
  min: number
  /** 非必需，清单里标"按需" */
  optional?: boolean
  /**
   * 一句话用途，跟在清单名字后面。纯蘸酱/基础必需品刻意留空 ——
   * "没有括注"本身就是"这个必须买"的标记，写了反而是噪音。
   */
  use?: LocalText
  note?: LocalText
}

export const SUPPLY_GROUPS = [
  { id: 'condiment', name: { zh: '调味料', en: 'Seasonings & sauces' } },
  { id: 'consumable', name: { zh: '工具与耗材', en: 'Tools & disposables' } },
] as const satisfies readonly { id: SupplyGroupId; name: LocalText }[]

export const SUPPLIES: Supply[] = [
  /* ---------------------------------------------------------------- 调味料 */
  {
    id: 'sup-garlic-chilli',
    group: 'condiment',
    name: { zh: '蒜蓉辣酱', en: 'Garlic chilli paste' },
    unit: 'bottle',
    qty: { basis: 'people', per: 1 / 6 },
    min: 1,
    use: { zh: '生蚝·扇贝·茄子·金针菇', en: 'Oysters, scallops, eggplant, enoki' },
    note: {
      zh: '生蚝、扇贝、茄子、金针菇通用；嫌咸就按 1:1 兑雪碧或啤酒。',
      en: 'Oysters, scallops, eggplant, enoki; cut 1:1 with lemonade or beer if too salty.',
    },
  },
  {
    id: 'sup-bbq-juice',
    group: 'condiment',
    name: { zh: '鲜味烧烤汁', en: 'Savoury BBQ sauce' },
    unit: 'bottle',
    qty: { basis: 'people', per: 1 / 8 },
    min: 1,
    use: { zh: '刷肉·调进蛋液', en: 'Brush on meat or into the eggs' },
    note: {
      zh: '味事达那类成品汁，直接刷肉或调进蛋里，比自配省事。',
      en: 'A bottled all-purpose BBQ sauce; brush straight on.',
    },
  },
  {
    id: 'sup-honey',
    group: 'condiment',
    name: { zh: '蜂蜜', en: 'Honey' },
    unit: 'bottle',
    qty: { basis: 'people', per: 1 / 10 },
    min: 1,
    use: { zh: '末段刷酱上色', en: 'Late glaze for colour' },
    note: {
      zh: '兑 1:1 温水，末段 1–2 分钟才刷；提前刷必然先焦后生。',
      en: 'Dilute 1:1 and brush only in the last minute or two.',
    },
  },
  {
    id: 'sup-sesame',
    group: 'condiment',
    name: { zh: '熟白芝麻', en: 'Toasted sesame' },
    unit: 'pack',
    qty: { basis: 'meatKg', per: 0.4 },
    min: 1,
    use: { zh: '干撒料原料', en: 'For the dry rub' },
  },
  {
    id: 'sup-cumin',
    group: 'condiment',
    name: { zh: '孜然粒／孜然粉', en: 'Cumin seed & ground' },
    unit: 'pack',
    qty: { basis: 'meatKg', per: 0.5 },
    min: 1,
    use: { zh: '牛羊肉撒料', en: 'For lamb and beef skewers' },
    note: {
      zh: '粒和粉各备一份：粒出香、粉挂得住。',
      en: 'Both forms — seed for aroma, powder to cling.',
    },
  },
  {
    id: 'sup-fennel',
    group: 'condiment',
    name: { zh: '小茴香（粒／粉）', en: 'Fennel seed & ground' },
    unit: 'pack',
    qty: { basis: 'meatKg', per: 0.25 },
    min: 1,
    optional: true,
    use: { zh: '与孜然同用的增香底', en: 'Aroma partner to cumin' },
    note: {
      zh: '羊肉与熏酱类的常用增香；干焙后现碾比买现成的粉香得多。',
      en: 'Lamb and smoked meats love it; toast and grind rather than buying it powdered.',
    },
  },
  {
    id: 'sup-chilli-flakes',
    group: 'condiment',
    name: { zh: '辣椒面', en: 'Chilli flakes' },
    unit: 'pack',
    qty: { basis: 'meatKg', per: 0.4 },
    min: 1,
    optional: true,
    use: { zh: '撒料·蘸料', en: 'Rub and dip' },
  },
  {
    id: 'sup-rub-powder',
    group: 'condiment',
    name: { zh: '烧烤料粉（配好的干撒料）', en: 'Blended BBQ rub' },
    unit: 'pack',
    qty: { basis: 'meatKg', per: 0.5 },
    min: 1,
    use: { zh: '自配撒料的兜底', en: 'The shortcut if you skip blending' },
    note: {
      zh: '不想自己配粉时的兜底；配比见「配方」页。',
      en: 'Shortcut if you skip blending — the ratios are on the recipes tab.',
    },
  },
  {
    id: 'sup-salt-pepper',
    group: 'condiment',
    name: { zh: '椒盐', en: 'Salt & pepper' },
    unit: 'bottle',
    qty: { basis: 'people', per: 1 / 10 },
    min: 1,
    use: { zh: '锡纸烤蛋·本味蔬菜', en: 'Foil eggs and plain vegetables' },
    note: {
      zh: '杏鲍菇、口蘑、蒜心这类只吃本味的蔬菜，椒盐比烧烤料合适。',
      en: 'For mushrooms and garlic scapes, not for meat.',
    },
  },
  {
    id: 'sup-oil',
    group: 'condiment',
    name: { zh: '食用油（带刷头最好）', en: 'Cooking oil' },
    unit: 'bottle',
    qty: { basis: 'people', per: 1 / 6 },
    min: 1,
    use: { zh: '全程防粘', en: 'Everything, all night' },
    note: {
      zh: '全程消耗最大的东西，蔬菜尤其费油；分装一小瓶现场补。',
      en: 'The fastest-running-out item — decant a small bottle for the grill.',
    },
  },
  {
    id: 'sup-soy-oyster',
    group: 'condiment',
    name: { zh: '生抽 + 蚝油', en: 'Light soy + oyster sauce' },
    unit: 'bottle',
    qty: { basis: 'people', per: 1 / 8 },
    min: 1,
  },
  {
    id: 'sup-condensed-milk',
    group: 'condiment',
    name: { zh: '炼奶', en: 'Condensed milk' },
    unit: 'bottle',
    qty: { basis: 'people', per: 1 / 8 },
    min: 1,
    optional: true,
    use: { zh: '烤面包·红薯·棉花糖', en: 'Toast, sweet potato, marshmallows' },
    note: {
      zh: '烤面包片、烤红薯、棉花糖的收尾搭档，有小朋友的桌子建议带上。',
      en: 'For toast, sweet potato and marshmallows.',
    },
  },
  {
    id: 'sup-salt',
    group: 'condiment',
    name: { zh: '盐', en: 'Salt' },
    unit: 'pack',
    qty: { basis: 'fixed', amount: 1 },
    min: 1,
  },
  /* ---------------------------------------------------------------- 工具耗材 */
  {
    id: 'sup-skewer',
    group: 'consumable',
    name: { zh: '竹签', en: 'Bamboo skewers' },
    unit: 'stick',
    qty: { basis: 'skewers', per: 1.2 },
    min: 20,
    note: {
      zh: '按串数 ×1.2 备，留替换余量；上炉前必须浸水 30 分钟。',
      en: 'Skewer count × 1.2 for spares; soak 30 min before use.',
    },
  },
  {
    id: 'sup-foil',
    group: 'consumable',
    name: { zh: '锡纸（卷）', en: 'Foil roll' },
    unit: 'roll',
    qty: { basis: 'people', per: 1 / 6 },
    min: 1,
    note: {
      zh: '金针菇、茄子、豆腐、花甲、粉丝、鸡蛋都要它，实际用量比想象中大。',
      en: 'Everything in foil eats far more than you expect.',
    },
  },
  {
    id: 'sup-foil-tray',
    group: 'consumable',
    name: { zh: '锡纸盘', en: 'Foil trays' },
    unit: 'piece',
    qty: { basis: 'people', per: 1 / 3 },
    min: 2,
    note: {
      zh: '装粉丝、打鸡蛋、焖花甲的容器，比锡纸叠的兜子可靠得多。',
      en: 'Much more reliable than folded foil for noodles and eggs.',
    },
  },
  {
    id: 'sup-brush',
    group: 'consumable',
    name: { zh: '油刷／硅胶刷', en: 'Basting brush' },
    unit: 'piece',
    qty: { basis: 'fixed', amount: 2 },
    min: 2,
    note: {
      zh: '生熟各一把，绝不用同一把刷完生肉再刷熟食。',
      en: 'One for raw meat, one for everything else — never shared.',
    },
  },
  {
    id: 'sup-tongs',
    group: 'consumable',
    name: { zh: '烧烤夹', en: 'Grill tongs' },
    unit: 'piece',
    qty: { basis: 'fixed', amount: 2 },
    min: 2,
    note: {
      zh: '同样生熟分开；长柄的才不会烫手。',
      en: 'Also split raw/cooked, and go long-handled.',
    },
  },
  {
    id: 'sup-bowl',
    group: 'consumable',
    name: { zh: '一次性碗', en: 'Disposable bowls' },
    unit: 'piece',
    qty: { basis: 'people', per: 2 },
    min: 6,
  },
  {
    id: 'sup-chopstick',
    group: 'consumable',
    name: { zh: '一次性筷子', en: 'Disposable chopsticks' },
    unit: 'pair',
    qty: { basis: 'people', per: 1.5 },
    min: 6,
  },
  {
    id: 'sup-glove',
    group: 'consumable',
    name: { zh: '一次性手套', en: 'Disposable gloves' },
    unit: 'pair',
    qty: { basis: 'people', per: 1 },
    min: 4,
    note: {
      zh: '腌肉、穿串、卷饼三个阶段都要，别省。',
      en: 'Marinating, skewering and wrapping all need them.',
    },
  },
  {
    id: 'sup-wipes',
    group: 'consumable',
    name: { zh: '湿巾／纸巾', en: 'Wipes' },
    unit: 'pack',
    qty: { basis: 'people', per: 1 / 5 },
    min: 1,
  },
  {
    id: 'sup-bag',
    group: 'consumable',
    name: { zh: '垃圾袋', en: 'Rubbish bags' },
    unit: 'pack',
    qty: { basis: 'people', per: 1 / 8 },
    min: 1,
    note: {
      zh: '离场时连炭灰一起带走 —— 炭火完全熄灭要约 4 小时。',
      en: 'Take the cold ash with you; coals need about 4 hours to die.',
    },
  },
  {
    id: 'sup-lighter',
    group: 'consumable',
    name: { zh: '引火块／固体酒精', en: 'Fire starters' },
    unit: 'pack',
    qty: { basis: 'people', per: 1 / 8 },
    min: 1,
    note: {
      zh: '比汽油安全得多，也省得点不着干着急。',
      en: 'Far safer than petrol, and much less frustrating.',
    },
  },
]
