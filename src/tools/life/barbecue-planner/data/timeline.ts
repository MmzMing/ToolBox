import { num } from '../measure'
import type { TimelineStep } from '../types'

/**
 * 时间线静态段，按 offsetMin 升序排列（数据不变量测试会守住这一点）。
 * `offsetMin` 相对"开烤"这一刻，负数表示提前；`phase` 决定界面上的色带分组。
 * 解冻与腌制两段不在这里 —— 它们的时长取决于本次选中了哪些菜品与腌料，由引擎推导后插入。
 */
export const TIMELINE_STEPS: TimelineStep[] = [
  {
    id: 'tl-purge',
    offsetMin: -120,
    durationMin: num(120, 120),
    title: { zh: '贝类盐水吐沙', en: 'Purge shellfish in salted water' },
    body: {
      zh: '花甲一开锅就是满壳泥沙的话，整顿饭就毁了。提前 2 h 盐水静置。',
      en: 'Two hours in brine, or you will bite sand all evening.',
    },
    gate: { kind: 'prep', prep: 'purgeSand' },
    phase: 'lead',
  },
  {
    id: 'tl-preboil',
    offsetMin: -60,
    durationMin: num(15, 25),
    title: { zh: '难熟项预处理', en: 'Par-cook the slow items' },
    body: {
      zh: '鸡爪先卤到软、玉米段盐水焯约 1 min、土豆切厚片预煮 —— 这几样直接生烤必然外面焦了里面还硬。',
      en: 'Braise the feet, salt-blanch the corn, par-boil the potato — raw grilling burns the outside and leaves the middle hard.',
    },
    gate: { kind: 'prep', prep: 'preBoil' },
    phase: 'ready',
  },
  {
    id: 'tl-soak-skewer',
    offsetMin: -40,
    durationMin: num(30, 30),
    title: { zh: '竹签浸水', en: 'Soak the bamboo skewers' },
    body: {
      zh: '干竹签上炉即焦、还会把肉串点燃。浸水 30 min 是最低要求，可以提前一晚泡上。',
      en: 'Dry bamboo ignites the moment it goes over the coals. Thirty minutes minimum; overnight is fine.',
    },
    gate: { kind: 'prep', prep: 'soakSkewer' },
    phase: 'ready',
  },
  {
    id: 'tl-temper',
    offsetMin: -30,
    durationMin: num(10, 30),
    title: { zh: '生食回温', en: 'Take the meat out to temper' },
    body: {
      zh: '冷藏肉直接上炉必然外焦里生；提前取出回温 10 min 以上。',
      en: 'Fridge-cold meat scorches outside while staying raw inside; give it at least 10 minutes.',
    },
    gate: { kind: 'prep', prep: 'temper' },
    phase: 'ready',
  },
  {
    id: 'tl-light',
    offsetMin: -10,
    durationMin: num(10, 15),
    title: { zh: '点火，等炭烧白', en: 'Light up and wait for the ash' },
    body: {
      zh: '必须等炭"烧白、火光稳定"、明火与烟消失后才开烤。炭没烧透就上串，是翻车清单上的第一条。',
      en: 'Wait until the coals are grey, the glow steady and the smoke gone. Grilling over raw coal is the most common failure there is.',
    },
    gate: { kind: 'always' },
    phase: 'ready',
  },
  {
    id: 'tl-first-drop',
    offsetMin: 0,
    durationMin: num(3, 5),
    title: { zh: '第一炉上串', en: 'First drop' },
    body: {
      zh: '先铺最耐烤的那一批，留出翻面余量，不要把烤网塞满 —— 密度过高会让炉温骤降、肉开始"蒸"而不是"烤"。',
      en: 'Load the hardiest items and leave gaps; a packed grate stalls the temperature and steams the meat instead of roasting it.',
    },
    gate: { kind: 'always' },
    phase: 'grill',
  },
  {
    id: 'tl-check',
    offsetMin: 10,
    durationMin: num(1, 1),
    title: { zh: '查验熟度', en: 'Check doneness' },
    body: {
      zh: '之后每 10 min 查验一次；已熟但想上色可再补烤 5 min。',
      en: 'Then every 10 minutes; cooked pieces can take five more for colour.',
    },
    gate: { kind: 'always' },
    phase: 'grill',
  },
  {
    id: 'tl-foil',
    offsetMin: 15,
    durationMin: num(15, 30),
    title: { zh: '锡纸组入炉', en: 'Put the foil trays on' },
    body: {
      zh: '金针菇、茄子、豆腐、花甲、排骨这些必须锡纸托汁的，此时进炉并放在文火区。',
      en: 'Enoki, eggplant, tofu, clams and foil-wrapped ribs go on now, over the gentle zone.',
    },
    gate: { kind: 'prep', prep: 'foil' },
    phase: 'grill',
  },
  {
    id: 'tl-staple',
    offsetMin: 25,
    durationMin: num(5, 12),
    title: { zh: '主食收尾', en: 'Finish with the staples' },
    body: {
      zh: '馒头片、烧饼、年糕、馕、淄博小饼借余温烤热；小饼要烘软才卷得动，冷了会发硬。',
      en: 'Bread, rice cake, naan and Zibo flatbread ride the residual heat; warm the flatbread or it turns leathery.',
    },
    gate: { kind: 'group', group: 'staple' },
    phase: 'grill',
  },
  {
    id: 'tl-seafood-last',
    offsetMin: 30,
    durationMin: num(2, 10),
    title: { zh: '海鲜压轴', en: 'Seafood last' },
    body: {
      zh: '按"类别顺序"口径，海鲜放最后是为了避免串味；用时最短，虾 2–4 min、生蚝 10 min、扇贝烤到开口。',
      en: 'On the by-category school seafood goes last so it borrows no flavour; prawns 2–4 min, oysters 10, scallops until they open.',
    },
    gate: { kind: 'group', group: 'seafood' },
    phase: 'grill',
  },
  {
    id: 'tl-topup',
    offsetMin: 90,
    durationMin: num(5, 10),
    title: { zh: '补炭窗口', en: 'Charcoal top-up window' },
    body: {
      zh: '果木炭 500 g 只能撑 1.5–2 h，人多时必须提前补炭；机制炭可全程不补，竹炭约 1 h。',
      en: 'Fruitwood gives 1.5–2 h per 500 g and must be topped up; briquettes run 3–4 h untouched.',
    },
    gate: { kind: 'always' },
    phase: 'grill',
  },
  {
    id: 'tl-wrap',
    offsetMin: 120,
    durationMin: num(5, 5),
    title: { zh: '收火与清场', en: 'Close out' },
    body: {
      zh: '彻底清除火源，设备完全冷却后再离场 —— 炭火完全熄灭需要约 4 h，别把没死透的炭桶搬进车里。',
      en: 'Kill every ember and let the rig cool before packing up — coals take about four hours to die.',
    },
    gate: { kind: 'always' },
    phase: 'close',
  },
]

/** 时间线四阶段在界面上的名字 */
export const TIMELINE_PHASES = {
  lead: { zh: '提前准备', en: 'Ahead of time' },
  ready: { zh: '开烤前', en: 'Before the fire' },
  grill: { zh: '烤制中', en: 'On the grill' },
  close: { zh: '收尾', en: 'Closing out' },
} as const
