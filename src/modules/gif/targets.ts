export type PlatformTargetId = 'wechat' | 'slack' | 'discord' | 'github' | 'telegram'

export type PlatformTarget = {
  id: PlatformTargetId
  /** 仅作 UI 兜底显示，正式文案走 i18n */
  label: string
  maxBytes: number
  maxWidth?: number
  maxFrames?: number
  maxSeconds?: number
  /** 数值来自第三方工具而非官方文档，UI 必须标「参考值」 */
  referenceOnly: boolean
  source: string
}

export const PLATFORM_TARGETS: readonly PlatformTarget[] = [
  {
    id: 'slack',
    label: 'Slack emoji',
    maxBytes: 128 * 1024,
    maxWidth: 128,
    maxFrames: 50,
    referenceOnly: false,
    source: 'https://slack.com/intl/zh-sg/help/articles/206870177-',
  },
  {
    id: 'discord',
    label: 'Discord sticker',
    maxBytes: 500 * 1024,
    maxWidth: 320,
    referenceOnly: false,
    source:
      'https://eu.esotericsoftware.com/blog/How-to-create-your-own-Telegram-and-Discord-stickers',
  },
  {
    id: 'telegram',
    label: 'Telegram video sticker',
    maxBytes: 256 * 1024,
    maxWidth: 512,
    maxSeconds: 3,
    referenceOnly: false,
    source: 'https://core.telegram.org/stickers',
  },
  {
    id: 'wechat',
    label: '微信表情',
    maxBytes: 200 * 1024,
    maxWidth: 240,
    maxSeconds: 3,
    referenceOnly: true,
    source: 'https://www.gif.cn/help/8348',
  },
  {
    id: 'github',
    label: 'GitHub',
    maxBytes: 10 * 1024 * 1024,
    referenceOnly: false,
    source:
      'https://docs.github.com/zh/get-started/writing-on-github/working-with-advanced-formatting/attaching-files',
  },
]

export function targetOf(id: PlatformTargetId): PlatformTarget {
  const target = PLATFORM_TARGETS.find((item) => item.id === id)
  if (!target) {
    throw new Error(`unknown platform target: ${id}`)
  }
  return target
}

/** 一轮「编码 + 优化」的完整参数；width/fps 由上层负责落到帧序列上 */
export type EncodeParams = {
  width: number
  fps: number
  maxColors: number
  lossy: number
}

type Level = { scale: number; fpsDrop: number; maxColors: number; lossy: number }

/**
 * 单调收紧的 7 级阶梯：每一级都比上一级更小，所以第一个达标的级别就是破坏性最小的方案。
 * 组合而非单杠杆是实测结论 —— 照片型内容只有「缩尺寸 + 降色 + lossy」同时上才进得了 128KB。
 */
const LEVELS: readonly Level[] = [
  { scale: 1, fpsDrop: 0, maxColors: 256, lossy: 0 },
  { scale: 1, fpsDrop: 2, maxColors: 256, lossy: 40 },
  { scale: 0.85, fpsDrop: 2, maxColors: 128, lossy: 60 },
  { scale: 0.75, fpsDrop: 4, maxColors: 128, lossy: 80 },
  { scale: 0.65, fpsDrop: 4, maxColors: 64, lossy: 120 },
  { scale: 0.55, fpsDrop: 6, maxColors: 64, lossy: 160 },
  { scale: 0.45, fpsDrop: 6, maxColors: 48, lossy: 200 },
]

export const MAX_LEVEL = LEVELS.length - 1
const MIN_WIDTH = 96
const MIN_FPS = 5

export function stepAt(start: EncodeParams, level: number): EncodeParams {
  const clamped = Math.max(0, Math.min(MAX_LEVEL, Math.trunc(level)))
  const spec = LEVELS[clamped]
  return {
    width: Math.max(MIN_WIDTH, Math.round(start.width * spec.scale)),
    fps: Math.max(MIN_FPS, start.fps - spec.fpsDrop),
    // 阶梯是相对起点的「再收紧一点」，所以取两者的更保守侧，不覆盖调用方的选择
    maxColors: Math.min(start.maxColors, spec.maxColors),
    lossy: Math.max(start.lossy, spec.lossy),
  }
}

export type SearchResult = {
  ok: boolean
  params: EncodeParams
  /** 最后一次实测的字节数；ok 时为达标那一轮 */
  bytes: number
  rounds: number
}

export type SearchInput = {
  start: EncodeParams
  targetBytes: number
  /** 注入真实编码成本，便于单测 */
  measure: (params: EncodeParams) => Promise<number>
  maxRounds?: number
}

/**
 * 阶梯搜索：达标即停（第一个满足条件的级别必然最温和）；超标时按超出倍数一次跳几级，
 * 避免「5 轮预算花在只会省 3% 的小步上」。
 */
export async function searchUnderTarget(input: SearchInput): Promise<SearchResult> {
  const { start, targetBytes, measure } = input
  const maxRounds = input.maxRounds ?? 5
  if (targetBytes < 1) {
    throw new Error(`targetBytes must be positive, got ${targetBytes}`)
  }
  if (!Number.isInteger(maxRounds) || maxRounds < 1) {
    throw new Error(`maxRounds must be a positive integer, got ${maxRounds}`)
  }

  let level = 0
  let lastParams = start
  let lastBytes = 0
  let attempts = 0

  for (let round = 0; round < maxRounds; round += 1) {
    const params = stepAt(start, level)
    const bytes = await measure(params)
    lastParams = params
    lastBytes = bytes
    attempts = round + 1
    if (bytes <= targetBytes) {
      return { ok: true, params, bytes, rounds: attempts }
    }
    // 已经收到最狠的一级还超标，再跑一轮也只是浪费用户的时间
    if (level === MAX_LEVEL) {
      break
    }
    const ratio = bytes / targetBytes
    level = Math.min(MAX_LEVEL, level + 1 + Math.min(2, Math.floor(Math.log2(ratio))))
  }

  return { ok: false, params: lastParams, bytes: lastBytes, rounds: attempts }
}
