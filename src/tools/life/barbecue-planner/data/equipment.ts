import { num } from '../measure'
import type { LocalText, Measure } from '../types'

/** 烟熏木材：来源能核实到"种类 + 适配"，量化风味强度表未能读到 */
export const WOOD_TYPES = [
  {
    id: 'oak',
    name: { zh: '橡木', en: 'Oak' },
    trait: {
      zh: '闷烧时释放天然芳香物，德州中部传统主用，可连熏 18 h',
      en: 'The central-Texas standard; carries an 18 h smoke',
    },
    bestFor: ['us-brisket', 'us-pork-butt'],
  },
  {
    id: 'apple',
    name: { zh: '苹果木', en: 'Apple' },
    trait: { zh: '温和、天然芳香，不夺肉味', en: 'Mild and fragrant without overpowering' },
    bestFor: ['us-pork-loin', 'us-chicken-quarter'],
  },
  {
    id: 'pecan',
    name: { zh: '山核桃木', en: 'Pecan / hickory' },
    trait: { zh: '列入推荐清单，甜润偏重', en: 'Recommended; sweet and fairly assertive' },
    bestFor: ['us-pork-butt'],
  },
  {
    id: 'lychee',
    name: { zh: '龙眼木', en: 'Lychee' },
    trait: {
      zh: '轻盈甜美的森林香，衬肉而不夺味',
      en: 'Light, sweet forest note that supports rather than dominates',
    },
    bestFor: ['us-brisket', 'us-baby-back-ribs'],
  },
  {
    id: 'mesquite',
    name: { zh: '牧豆木', en: 'Mesquite' },
    trait: {
      zh: '德州南部偏好，味烈，长熏易苦',
      en: 'Southern Texas favourite; intense and bitter over long smokes',
    },
    /* 原本只推荐配烟熏香肠，该项已删，故留空而不是硬凑一个搭配 */
    bestFor: [],
  },
] as const satisfies readonly { id: string; name: LocalText; trait: LocalText; bestFor: string[] }[]

/** 来源明确禁用：松木、杉木含脂且带异味 */
export const WOODS_TO_AVOID: LocalText = {
  zh: '松木、杉木 —— 含脂且带异味，绝不能进烤炉',
  en: 'Pine and fir — resinous and off-tasting, never for the grill',
}

/** 美式低温慢烤的关键温度锚点（℉ 为来源原始口径，℃ 为换算） */
export const SMOKER_REFERENCE = [
  {
    id: 'brisket-fire',
    label: { zh: '牛胸肉炉温', en: 'Brisket cooker temp' },
    value: { zh: '225–250 ℉（107–121 ℃）', en: '225–250 °F (107–121 °C)' },
  },
  {
    id: 'brisket-stall',
    label: { zh: 'stall 平台期', en: 'The stall' },
    value: {
      zh: '中心 150–170 ℉ 时开始，表面水分蒸发带走热量',
      en: 'Core 150–170 °F; evaporation cools the surface',
    },
  },
  {
    id: 'brisket-wrap',
    label: { zh: '包裹时机与材质', en: 'Wrap timing and material' },
    value: {
      zh: '中心 150–160 ℉ 包裹；牛皮纸保住 bark，锡纸更快更湿但表皮变软',
      en: 'Wrap at 150–160 °F; paper keeps the bark, foil is faster and wetter but softens it',
    },
  },
  {
    id: 'brisket-pull',
    label: { zh: '出炉温度', en: 'Pull temperature' },
    value: {
      zh: '195–205 ℉（约 91–96 ℃）；165–175 ℉ 已可撕开',
      en: '195–205 °F; shreddable from 165–175 °F',
    },
  },
  {
    id: 'brisket-rest',
    label: { zh: '静置', en: 'Rest' },
    value: { zh: '至少 1 小时（口径 30 min–2 h）', en: 'At least 1 h (sources say 30 min–2 h)' },
  },
  {
    id: 'ribs-321',
    label: { zh: '3-2-1 排骨法', en: '3-2-1 ribs' },
    value: {
      zh: '180 ℉ 起炉后升 225 ℉：3 h 烟熏 → 2 h 包裹（棕糖＋蜂蜜＋苹果汁）→ 1 h 刷酱；烟至中心 160 ℉ 包裹，205 ℉ 出炉',
      en: 'Start 180 °F then 225 °F: 3 h smoke, 2 h wrapped with brown sugar, honey and apple juice, 1 h sauced',
    },
  },
] as const satisfies readonly { id: string; label: LocalText; value: LocalText }[]

/** 家用复刻烧鸟的设备参数（炭火之外的全部有源口径） */
export const HOME_REPLICA = [
  {
    id: 'pan',
    label: { zh: '平底锅', en: 'Pan' },
    value: {
      zh: '中火预热少油转小火，正反各 3 min，刷酱后盖盖中小火焖 1 min',
      en: '3 min a side, then lidded 1 min after glazing',
    },
  },
  {
    id: 'broil',
    label: { zh: '烤箱 broil', en: 'Broiler' },
    value: {
      zh: '最高档，架位距加热管 15–20 cm，共约 16 min，每 2 min 翻面刷酱',
      en: 'Max, 15–20 cm under the element, ~16 min, turn and baste every 2 min',
    },
  },
  {
    id: 'oven',
    label: { zh: '烤箱常规', en: 'Oven' },
    value: { zh: '190 ℃ / 13–15 min', en: '190 °C for 13–15 min' },
  },
  {
    id: 'airfryer',
    label: { zh: '空气炸锅', en: 'Air fryer' },
    value: {
      zh: '180 ℃ / 12–15 min（或 10 min → 刷酱 → 5 min）',
      en: '180 °C for 12–15 min, or 10 + glaze + 5',
    },
  },
  {
    id: 'mwoven',
    label: { zh: '微波炉', en: 'Microwave' },
    value: { zh: '高火 3–5 min', en: 'High for 3–5 min' },
  },
] as const satisfies readonly { id: string; label: LocalText; value: LocalText }[]

/** 烧鸟炭床温区与串距 */
export const YAKITORI_COAL_BEDS = {
  low: num(150, 180),
  medium: num(180, 220),
  high: num(220, 300),
  distanceCm: num(5, 6),
} as const

/** 出成率参考表（生→熟），用于把熟人口径反推成采购生重 */
export const YIELD_REFERENCE = {
  brisketWhole: num(43, 43),
  brisketFlat: num(52, 52),
  porkButt: num(50, 50),
  porkLoin: num(65, 65),
  wholeChicken: num(34, 34),
  turkey: num(50, 50),
} as const

/** 熟肉 → 人数的美式通行换算 */
export const COOKED_LB_PER_PERSON: Measure = num(0.75, 0.75)
export const COOKED_PEOPLE_PER_LB: Measure = num(2.6, 2.6)
