/**
 *
 * 原算法核心（generate_image_sync 前半段）：
 * 1. 固定模式下用 `random.Random(f"{user_id}-{yyyy-mm-dd}")` 播种 —— 同一天同一用户结果固定；
 * 2. 分值档分三档：good（>70）/ normal（56–70）/ bad（<56），按当日爆率分配档内均摊权重
 *    （日常 good/normal/bad = 40/40/20，节假日 85/15/0，节假日见 HOLIDAYS）；
 * 3. 权重和为 0 时退化为均匀随机（防抖）；
 * 4. 先按权重抽分值档，再在档内等概率抽一条签文。
 *
 * 与 Python 版的差异仅为播种方式：JS 无字符串种子，改用 cyrb53 哈希 + mulberry32，
 * 确定性语义完全一致（同种子同序列）。
 */
import { FORTUNE_POOL, type FortuneEntry } from './fortune-data'

export type FortuneLevel = 'good' | 'normal' | 'bad'

export type DrawOptions = {
  /** 抽签人名字，固定模式下作为种子的一部分 */
  name: string
  /** 抽签日期，默认取当前时间 */
  now?: Date
  /** true = 同日同名结果固定（默认）；false = 完全随机 */
  fixed?: boolean
  /** 测试用：显式注入随机种子，覆盖固定/随机模式的种子计算 */
  seed?: number
}

export type DrawResult = FortuneEntry & {
  level: FortuneLevel
  isHolidayBoost: boolean
  /** YYYY/MM/DD */
  dateLabel: string
}

/** 节假日（MM-DD）：当天吉签爆率提升 */
export const HOLIDAYS = ['01-01', '02-14', '05-01', '10-01', '12-25'] as const

export const NORMAL_RATES = { good: 40, normal: 40, bad: 20 } as const
export const HOLIDAY_RATES = { good: 85, normal: 15, bad: 0 } as const

const GOOD_THRESHOLD = 70
const BAD_THRESHOLD = 56

/** cyrb53 字符串哈希：把「名字-日期」折叠成 53 位种子 */
export function hashSeed(text: string): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0) * 4294967296 + (h1 >>> 0)
}

/** mulberry32：32 位种子 → [0, 1) 均匀序列，对应 Python random.Random 的角色 */
export function createRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 分值 → 档位：>70 吉，56–70 平，<56 凶（与上游分档一致） */
export function getLevel(luckValue: number): FortuneLevel {
  if (luckValue > GOOD_THRESHOLD) return 'good'
  if (luckValue >= BAD_THRESHOLD) return 'normal'
  return 'bad'
}

export function isHoliday(monthDay: string): boolean {
  return (HOLIDAYS as readonly string[]).includes(monthDay)
}

/** 按权重抽一项：等价于 Python random.choices(items, weights, k=1) */
function weightedPick(rng: () => number, items: string[], weights: number[]): string {
  const total = weights.reduce((sum, w) => sum + w, 0)
  let roll = rng() * total
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i]
    if (roll < 0) return items[i]
  }
  return items[items.length - 1]
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 抽一支签：先按当日爆率加权抽分值档，再在档内等概率抽一条签文 */
export function drawFortune(options: DrawOptions): DrawResult {
  const now = options.now ?? new Date()
  const fixed = options.fixed ?? true
  const name = options.name.trim() || 'anonymous'

  const dateKey = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
  const seed =
    options.seed ?? (fixed ? hashSeed(`${name}-${dateKey}`) : (Math.random() * 2 ** 32) >>> 0)
  const rng = createRng(seed)

  const monthDay = `${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
  const isHolidayBoost = isHoliday(monthDay)
  const rates = isHolidayBoost ? HOLIDAY_RATES : NORMAL_RATES

  const keys = Object.keys(FORTUNE_POOL)
  const goodKeys = keys.filter((k) => getLevel(Number(k)) === 'good')
  const normalKeys = keys.filter((k) => getLevel(Number(k)) === 'normal')
  const badKeys = keys.filter((k) => getLevel(Number(k)) === 'bad')

  // 每档总权重在档内各 key 间均摊（对应 painter.py 的 weights 计算）
  let weights = keys.map((k) => {
    const level = getLevel(Number(k))
    if (level === 'good') return rates.good / Math.max(goodKeys.length, 1)
    if (level === 'normal') return rates.normal / Math.max(normalKeys.length, 1)
    return rates.bad / Math.max(badKeys.length, 1)
  })

  // 防抖：权重全被调成 0 时退化为均匀随机
  if (weights.reduce((sum, w) => sum + w, 0) <= 0) {
    weights = keys.map(() => 1)
  }

  const pickedKey = weightedPick(rng, keys, weights)
  const bucket = FORTUNE_POOL[pickedKey]
  const entry = bucket[Math.floor(rng() * bucket.length)]

  return {
    ...entry,
    level: getLevel(entry.luckValue),
    isHolidayBoost,
    dateLabel: `${now.getFullYear()}/${pad2(now.getMonth() + 1)}/${pad2(now.getDate())}`,
  }
}
