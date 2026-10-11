import { describe, expect, it } from 'vitest'

import {
  ANGRY_AFTER_CLICKS,
  ANGRY_HOLD_MS,
  ANNOY_GAP_MS,
  MOOD_CYCLE,
  createMoodCycler,
  tapMood,
  type MoodCycler,
} from '@/components/fluid-orb/orb-mood'
import { ORB_EYE_MOODS } from '@/components/fluid-orb/orb-eye-states'

/** 按给定间隔连点 n 次，返回每次得到的情绪 */
function clicks(gapMs: number, count: number, startAt = 0) {
  let cycler: MoodCycler = createMoodCycler()
  const seen: string[] = []
  for (let i = 0; i < count; i += 1) {
    const out = tapMood(cycler, startAt + i * gapMs)
    cycler = out.next
    seen.push(out.mood)
  }
  return { seen, cycler }
}

describe('mood cycle', () => {
  it('walks the 39 states in table order, starting from the top', () => {
    expect(MOOD_CYCLE).toHaveLength(39)
    expect(MOOD_CYCLE).toEqual([...ORB_EYE_MOODS])
    expect(clicks(5000, 3).seen).toEqual([ORB_EYE_MOODS[0], ORB_EYE_MOODS[1], ORB_EYE_MOODS[2]])
  })

  it('wraps around instead of running off the list', () => {
    const { seen } = clicks(5000, 40, 0)
    expect(seen[38]).toBe(ORB_EYE_MOODS[38])
    expect(seen[39]).toBe(ORB_EYE_MOODS[0])
    expect(new Set(seen).size).toBe(39)
  })

  it('turns angry after enough rapid clicks', () => {
    const { seen } = clicks(100, ANGRY_AFTER_CLICKS)
    expect(seen.slice(0, -1)).not.toContain('angry')
    expect(seen.at(-1)).toBe('angry')
  })

  it('stays angry while the clicking continues', () => {
    const { seen } = clicks(100, ANGRY_AFTER_CLICKS + 6)
    const firstAngry = seen.indexOf('angry')
    expect(seen.slice(firstAngry)).toEqual(Array(7).fill('angry'))
  })

  it('recovers once the hold has elapsed and the user has stopped', () => {
    const warmed = clicks(100, ANGRY_AFTER_CLICKS)
    const later = tapMood(warmed.cycler, ANGRY_AFTER_CLICKS * 100 + ANGRY_HOLD_MS + 10)
    expect(later.mood).not.toBe('angry')
  })

  it('does not hold a grudge across a long pause', () => {
    let cycler = createMoodCycler()
    const seen: string[] = []
    for (let second = 0; second < 10; second += 1) {
      // 每秒只点一下，永远慢于 ANNOY_GAP_MS，所以不该攒出怒气
      const out = tapMood(cycler, second * (ANNOY_GAP_MS + 500))
      cycler = out.next
      seen.push(out.mood)
    }
    expect(seen).not.toContain('angry')
    expect(new Set(seen).size).toBe(10)
  })

  it('counts a click that lands exactly on the gap boundary as rapid', () => {
    const first = tapMood(createMoodCycler(), 0)
    const second = tapMood(first.next, ANNOY_GAP_MS)
    expect(second.next.irritation).toBe(2)
  })
})
