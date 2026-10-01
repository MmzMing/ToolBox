import { num } from '../measure'
import type { CoreTemp, SafetyNotice } from '../types'

/**
 * 最低中心温度（USDA/FSIS 口径）。
 * 肉串属于「切割穿刺后表面积增大 + 接近绞碎形态」，因此禽串与猪牛串按绞肉档判定，比整块更严。
 */
export const CORE_TEMPS: CoreTemp[] = [
  {
    id: 'poultry',
    meat: { zh: '禽肉（鸡／鸭／鸽）', en: 'Poultry' },
    form: { zh: '一切形态', en: 'All forms' },
    tempC: 74,
    restMin: 0,
  },
  {
    id: 'ground-skewer',
    meat: { zh: '牛／羊／猪 肉串与绞肉', en: 'Beef / lamb / pork skewers & mince' },
    form: { zh: '绞碎或穿刺成串', en: 'Ground or skewered' },
    tempC: 71,
    restMin: 0,
  },
  {
    id: 'ground-pork',
    meat: { zh: '猪肉（绞肉／香肠）', en: 'Pork (mince / sausage)' },
    form: { zh: '绞碎', en: 'Ground' },
    tempC: 71,
    restMin: 0,
  },
  {
    id: 'whole-pork',
    meat: { zh: '猪肉', en: 'Pork' },
    form: { zh: '整块（排／烤肉）', en: 'Whole cut' },
    tempC: 63,
    restMin: 3,
  },
  {
    id: 'whole-beef',
    meat: { zh: '牛肉／羊肉／小牛肉', en: 'Beef / lamb / veal' },
    form: { zh: '整块', en: 'Whole cut' },
    tempC: 63,
    restMin: 3,
  },
  {
    id: 'seafood',
    meat: { zh: '鱼类与海鲜', en: 'Fish & seafood' },
    form: { zh: '一切形态', en: 'All forms' },
    tempC: 63,
    restMin: 0,
  },
  {
    id: 'eggs',
    meat: { zh: '蛋类', en: 'Eggs' },
    form: { zh: '打散或整颗加热', en: 'Beaten or whole' },
    tempC: 71,
    restMin: 0,
  },
]

/**
 * 安全提醒常量。这里只放有来源支撑的条目；
 * 亚硝酸盐与"剩肉可放几天"两项未能取到可溯源定量数据，因此不做数值承诺。
 */
export const SAFETY_NOTICES: SafetyNotice[] = [
  {
    id: 'pork-parasite',
    title: { zh: '猪肉为什么必须全熟', en: 'Why pork must be cooked through' },
    body: {
      zh: '猪肉可能携带猪带绦虫幼虫（囊尾蚴），未熟透食入后会在小肠发育成绦虫；误吞虫卵则幼虫可入脑。禽肉的风险来自沙门氏菌与弯曲杆菌，生鲜鸡肉抽样的阳性率显著更高。',
      en: 'Undercooked pork can carry tapeworm larvae; poultry carries salmonella and campylobacter at far higher sampling rates.',
    },
  },
  {
    id: 'visual-cue',
    title: { zh: '没有温度计时怎么判断', en: 'Judging without a thermometer' },
    body: {
      zh: '国内监管口径不给度数，要求观察中心部位完全变为灰白色或无色（虾蟹变红）、无血丝残留。烤架温度须保持在 200 ℃ 以上，每 10 min 查验一次熟度。',
      en: 'Chinese guidance asks for the centre to turn fully grey with no blood, over a 200 °C+ bed, checked every 10 minutes.',
    },
  },
  {
    id: 'no-counter-thaw',
    title: { zh: '禁止室温解冻', en: 'Never thaw on the counter' },
    body: {
      zh: '4–60 ℃ 是危险温区，表面细菌每 20 min 可翻倍，25 ℃ 以上极易引发中毒。冷藏解冻走 0–4 ℃；冷水解冻要密封并每 30 min 换水。解冻后不得反复冻融，流水解冻后 4 h 内必须烹饪。',
      en: 'Bacteria double every 20 minutes through the 4–60 °C danger zone. Thaw at 0–4 °C, or sealed in cold water changed every 30 min.',
    },
  },
  {
    id: 'char-trim',
    title: { zh: '焦糊部位要剔除', en: 'Trim the charred parts' },
    body: {
      zh: '烤焦烤糊的部位可能产生有害物质，应去除焦糊部分后再食用。油脂滴落引发明火是焦糊的主因，因此五花肉这类高油食材要偏离最旺的炭区；机制炭几乎不窜明火，是更稳的选择。',
      en: 'Scorched sections should be cut away. Dripping fat causes the flare-ups that create them — keep belly off the hottest zone.',
    },
  },
  {
    id: 'sugar-last',
    title: { zh: '含糖料与撒料的时机', en: 'Timing for sugar and dry seasonings' },
    body: {
      zh: '蜂蜜、白糖类（奥尔良、蜜汁、沈阳鸡架的焦糖糖）必须在末段 1–2 min 才刷，否则先焦后生。干撒料要等肉串翻面两次、七八分熟后再撒，否则炭火直接把孜然和五香粉烤焦发苦。',
      en: 'Sugared glazes go on in the last 1–2 minutes; dry rubs after two flips at 70–80 % done, or the cumin scorches bitter.',
    },
  },
  {
    id: 'ventilation',
    title: { zh: '通风与余烬', en: 'Ventilation and embers' },
    body: {
      zh: '即便只烤 10 min 也必须保持空气对流，切忌在封闭空间操作（一氧化碳）。用餐结束后要彻底清除火源、等设备完全冷却再离场 —— 炭火完全熄灭需要约 4 h。',
      en: 'Keep air moving even for a 10-minute cook and never work in a sealed space. Embers take about four hours to die fully.',
    },
  },
  {
    id: 'cross-contam',
    title: { zh: '生熟分开', en: 'Separate raw and cooked' },
    body: {
      zh: '生熟筷子、漏勺、碗碟严格分开防交叉污染；穿串、腌制、储存全流程保持洁净。蘸过生肉的酱料不得回锅二次使用。',
      en: 'Dedicated utensils for raw and cooked; never return a sauce that touched raw meat to the jar.',
    },
  },
  {
    id: 'green-bean',
    title: { zh: '豆角必须烤透', en: 'Green beans need full cooking' },
    body: {
      zh: '未断生的豆角含凝集素，夹生有中毒风险；断生后再转文火焖一会儿。',
      en: 'Underdone beans carry lectins; give them a few more minutes over gentle heat.',
    },
  },
  {
    id: 'tare-ageing',
    title: { zh: '老 tare 酱的安全性', en: 'Why a decades-old tare is safe' },
    body: {
      zh: '店里"只补不换"的老汤之所以不坏，主因是反复高温而非糖盐渗透压 —— 多数细菌在 65 ℃ 左右即被杀灭。家用底线是每次用后煮沸并冷藏，不要常温无限存放。',
      en: 'A tare survives decades of top-ups because repeated 65 °C+ heating kills bacteria, not because of sugar. At home, boil after each use and refrigerate.',
    },
  },
  {
    id: 'gluten-free',
    title: { zh: '无麸质路线', en: 'Gluten-free route' },
    body: {
      zh: '传统酿造酱油含小麦，tare 与所有酱烤配方默认不合格；换成标注 gluten-free 的 tamari 或椰子氨基酱。最稳的做法是直接走盐烤 —— 盐天然无麸质。甜面酱、蚝油、味噌同样含小麦或大麦。',
      en: 'Brewed soy carries wheat, so tare and every glazed recipe fails by default. Use labelled GF tamari or coconut aminos — or simply grill with salt.',
    },
  },
]

/** 危险温区与细菌翻倍周期 */
export const DANGER_ZONE = { tempC: num(4, 60), doublingMin: num(20, 20) }

/** 冷藏解冻：每 500 g 的两种口径（见 CONFLICTS['thaw-time']） */
export const THAW_PER_500G_FAST = num(5, 8)
export const THAW_PER_500G_SLOW = num(12, 24)

/** 炭火完全熄灭所需时间 */
export const EMBER_DEAD_MIN = num(240, 240)
