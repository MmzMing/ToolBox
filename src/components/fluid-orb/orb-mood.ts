import { ORB_EYE_MOODS, type OrbEyeMood } from './orb-eye-states'

/**
 * 「点一下换一个情绪，点多了会生气」的纯逻辑。
 *
 * 生气不靠计时器：只在每次点击时拿「距上次点击多久」做一次惰性判定。
 * 手指停下来就没有事件，也就不需要 setTimeout 去收拾状态——少一个会漏的定时器。
 */

/** 两次点击隔这么久以内算「连着点」 */
export const ANNOY_GAP_MS = 900
/** 连着点这么多次就翻脸 */
export const ANGRY_AFTER_CLICKS = 5
/** 翻脸之后至少保持这么久；期间再点会续上 */
export const ANGRY_HOLD_MS = 3500

export const ANGRY_MOOD: OrbEyeMood = 'angry'

/**
 * 点击轮换的顺序：情绪表本身，但把 `idle` 剔掉。
 *
 * 球停着的默认表情就是 idle，让它进轮换等于「点一下没反应」——而轮换的全部意义是
 * 每点一下换一张脸。走完其余 19 个再循环。
 */
export const MOOD_CYCLE: readonly OrbEyeMood[] = ORB_EYE_MOODS.filter((mood) => mood !== 'idle')

export type MoodCycler = {
  /** 上一次给出的情绪在 MOOD_CYCLE 里的下标；-1 表示还没点过 */
  cursor: number
  /** 连着点的计数 */
  irritation: number
  lastAt: number
  /** 生气状态的截止时间戳 */
  angryUntil: number
}

export function createMoodCycler(): MoodCycler {
  return { cursor: -1, irritation: 0, lastAt: Number.NEGATIVE_INFINITY, angryUntil: 0 }
}

export type MoodTap = { mood: OrbEyeMood; next: MoodCycler }

/**
 * 记一次点击，返回这次该显示什么情绪。
 *
 * 隔得太久的点击不算续仇，计数直接归零；够次数就翻脸并锁住一段时间，
 * 锁定期内继续点会把截止时间往后推——所以「一直狂点」会一直生气，而不是点一下怒、
 * 再点一下又笑嘻嘻。
 */
export function tapMood(
  cycler: MoodCycler,
  now: number,
  cycle: readonly OrbEyeMood[] = MOOD_CYCLE,
): MoodTap {
  const gap = now - cycler.lastAt
  const irritation = gap <= ANNOY_GAP_MS ? cycler.irritation : 0

  if (now < cycler.angryUntil) {
    return {
      mood: ANGRY_MOOD,
      next: {
        ...cycler,
        irritation: cycler.irritation + 1,
        lastAt: now,
        angryUntil: now + ANGRY_HOLD_MS * 0.4,
      },
    }
  }

  if (irritation + 1 >= ANGRY_AFTER_CLICKS) {
    return {
      mood: ANGRY_MOOD,
      next: { cursor: cycler.cursor, irritation: 0, lastAt: now, angryUntil: now + ANGRY_HOLD_MS },
    }
  }

  const cursor = (cycler.cursor + 1) % cycle.length
  return {
    mood: cycle[cursor],
    next: { cursor, irritation: cycler.irritation + 1, lastAt: now, angryUntil: cycler.angryUntil },
  }
}
