import { describe, expect, it } from 'vitest'

import {
  EYE_BOX,
  FACE_ANCHOR,
  centroid,
  clampToDisc,
  consumeBlink,
  createEyeRuntime,
  eyeHalfWidth,
  eyeSlice,
  lerpFlat,
  polyPath,
  queueBlink,
  setMood,
  stepEyes,
  type BlinkKey,
} from '@/components/fluid-orb/orb-eyes'
import {
  ORB_EYE_MOODS,
  EYE_PLAYLIST,
  EYE_HOLD_MS,
  BLINK_MS,
  isOrbEyeMood,
} from '@/components/fluid-orb/orb-eye-states'
import { ORB_EYE_POINTS, ORB_EYE_SHAPES } from '@/components/fluid-orb/orb-eye-shapes'

/** 固定随机源，让播放列表与眨眼节奏在测试里可复现 */
function fixedRandom(seed = 1) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 0x100000000
    return s / 0x100000000
  }
}

function translateOf(transform: string): { x: number; y: number; sx: number; sy: number } {
  const m = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+) ([-\d.]+)\)/u.exec(transform)
  if (m === null) {
    throw new Error(`unexpected transform: ${transform}`)
  }
  return { x: Number(m[1]), y: Number(m[2]), sx: Number(m[3]), sy: Number(m[4]) }
}

function run(mood: (typeof ORB_EYE_MOODS)[number], ms: number, pointer = { x: 0, y: 0 }) {
  const random = fixedRandom()
  const rt = createEyeRuntime(mood, 0, random)
  let frame = null
  for (let now = 0; now <= ms; now += 16.7) {
    frame = stepEyes(rt, { now, pointer, random })
  }
  return { rt, frame: frame!, random }
}

describe('geometry data integrity', () => {
  it('ships 25 eye shapes, each a left/right pair of the same point count', () => {
    expect(ORB_EYE_SHAPES).toHaveLength(25)
    for (const shape of ORB_EYE_SHAPES) {
      expect(shape).toHaveLength(ORB_EYE_POINTS * 2 * 2)
    }
  })

  it('splits each shape into two disjoint eyes', () => {
    const shape = ORB_EYE_SHAPES[0]
    const left = eyeSlice(shape, 0)
    const right = eyeSlice(shape, 1)
    expect(left).toHaveLength(ORB_EYE_POINTS * 2)
    expect(right).toHaveLength(ORB_EYE_POINTS * 2)
    expect(centroid(left)).not.toEqual(centroid(right))
  })

  it('covers all 39 moods with the three parallel tables', () => {
    expect(ORB_EYE_MOODS).toHaveLength(39)
    for (const mood of ORB_EYE_MOODS) {
      expect(EYE_PLAYLIST[mood].length).toBeGreaterThan(0)
      expect(EYE_HOLD_MS[mood][0]).toBeLessThanOrEqual(EYE_HOLD_MS[mood][1])
      if (BLINK_MS[mood] !== null) {
        expect(BLINK_MS[mood]![0]).toBeLessThan(BLINK_MS[mood]![1])
      }
    }
  })

  it('never points a playlist at a missing eye shape', () => {
    for (const mood of ORB_EYE_MOODS) {
      for (const index of EYE_PLAYLIST[mood]) {
        expect(index).toBeGreaterThanOrEqual(0)
        expect(index).toBeLessThan(ORB_EYE_SHAPES.length)
      }
    }
  })

  it('narrows the mood union only to the 39 known names', () => {
    expect(isOrbEyeMood('thinking')).toBe(true)
    expect(isOrbEyeMood('powering-down')).toBe(true)
    expect(isOrbEyeMood('sleepwalking')).toBe(false)
  })
})

describe('poly helpers', () => {
  it('builds a closed path with one command per point', () => {
    const d = polyPath([10, 20, 30, 40, 50, 60])
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(d.split('L')).toHaveLength(3)
  })

  it('reports the widest horizontal reach from the centroid', () => {
    expect(eyeHalfWidth([0, 0, 10, 0, 20, 0])).toBe(10)
  })

  it('interpolates between two shapes and pins the endpoints', () => {
    const a = [0, 0, 10, 10]
    const b = [20, 20, 30, 30]
    expect(lerpFlat(a, b, 0)).toEqual(a)
    expect(lerpFlat(a, b, 1)).toEqual(b)
    expect(lerpFlat(a, b, 0.5)).toEqual([10, 10, 20, 20])
  })
})

describe('blink queue', () => {
  it('closes then reopens the lid, overshooting once on the way back', () => {
    const q: BlinkKey[] = []
    queueBlink(q, 1000, () => 0.99)
    expect(q.map((k) => k.v)).toEqual([0.05, 0.05, 1.08, 1])
    expect(consumeBlink(q, 1000)).toBe(0.05)
    expect(consumeBlink(q, 1400)).toBe(1)
    expect(q).toHaveLength(0)
  })

  it('appends a second blink when the roll comes up', () => {
    const q: BlinkKey[] = []
    queueBlink(q, 0, () => 0.01)
    expect(q).toHaveLength(6)
    expect(consumeBlink(q, 500)).toBe(1)
  })

  it('returns null when nothing is due', () => {
    const q: BlinkKey[] = [{ at: 500, v: 0.05 }]
    expect(consumeBlink(q, 100)).toBeNull()
    expect(q).toHaveLength(1)
  })
})

describe('clampToDisc', () => {
  it('leaves an eye that already fits alone', () => {
    expect(clampToDisc(120, 110, 10)).toEqual({ x: 120, y: 110 })
  })

  it('pulls an overflowing eye back onto the radius it can occupy', () => {
    const spot = clampToDisc(500, 114.2705, 10)
    expect(spot.x).toBeLessThan(EYE_BOX)
    expect(spot.y).toBeCloseTo(114.2705, 3)
    expect(Math.hypot(spot.x - 114.2705, spot.y - 114.2705)).toBeCloseTo(104.27, 1)
  })

  it('collapses to the centre when the eye is bigger than the disc', () => {
    expect(clampToDisc(300, 300, 1000).x).toBeCloseTo(114.2705, 3)
  })
})

describe('stepEyes', () => {
  it('centres the eye pair on the face anchor for every mood', () => {
    // 回归：源数据把表情连位置一起烘进几何，不减掉每组自带的双眼中点，
    // 换表情时整张脸会歪到球边上去
    for (const mood of ORB_EYE_MOODS) {
      const { frame } = run(mood, 60)
      const [l, r] = frame.eyes.map((e) => translateOf(e.transform))
      expect((l.x + r.x) / 2).toBeCloseTo(FACE_ANCHOR.x, 1)
      expect((l.y + r.y) / 2).toBeCloseTo(FACE_ANCHOR.y, 1)
    }
  })

  it('moves the gaze toward the pointer and keeps both eyes together', () => {
    const neutral = run('idle', 60, { x: 0, y: 0 })
    const looking = run('idle', 600, { x: 1, y: 1 })
    const a = translateOf(neutral.frame.eyes[0].transform)
    const b = translateOf(looking.frame.eyes[0].transform)
    expect(b.x).toBeGreaterThan(a.x)
    expect(b.y).toBeGreaterThan(a.y)
  })

  it('advances the playlist so the shape index changes over time', () => {
    const seen = new Set<number>()
    const random = fixedRandom(7)
    const rt = createEyeRuntime('thinking', 0, random)
    for (let now = 0; now < 40000; now += 16.7) {
      seen.add(stepEyes(rt, { now, pointer: null, random }).shape)
    }
    expect(seen.size).toBe(EYE_PLAYLIST.thinking.length)
  })

  it('stays put on a single-shape mood', () => {
    const { frame } = run('waking', 8000)
    expect(frame.shape).toBe(EYE_PLAYLIST.waking[0])
  })

  it('closes the lid during a blink and reopens it', () => {
    const random = fixedRandom(3)
    const rt = createEyeRuntime('listening', 0, random)
    let minLid = 1
    let maxLid = 0
    for (let now = 0; now < 20000; now += 16.7) {
      const frame = stepEyes(rt, { now, pointer: null, random })
      minLid = Math.min(minLid, frame.lid)
      maxLid = Math.max(maxLid, frame.lid)
    }
    expect(minLid).toBeLessThan(0.3)
    expect(maxLid).toBeGreaterThan(0.9)
  })

  it('never blinks in a mood that has no blink range', () => {
    const random = fixedRandom(5)
    const rt = createEyeRuntime('sleeping', 0, random)
    for (let now = 0; now < 60000; now += 16.7) {
      stepEyes(rt, { now, pointer: null, random })
    }
    expect(rt.lid.x).toBeGreaterThan(0.9)
  })

  it('keeps the lid scale inside a drawable range', () => {
    const { frame } = run('surprised', 5000)
    for (const eye of frame.eyes) {
      const t = translateOf(eye.transform)
      expect(t.sx).toBeGreaterThan(0)
      expect(t.sy).toBeGreaterThan(0)
      expect(t.sx).toBeLessThan(2)
    }
  })

  it('switches mood without throwing and re-anchors immediately', () => {
    const random = fixedRandom(11)
    const rt = createEyeRuntime('idle', 0, random)
    stepEyes(rt, { now: 0, pointer: null, random })
    setMood(rt, 'angry', 100, random)
    expect(rt.mood).toBe('angry')
    expect(rt.cursor).toBe(0)
    const frame = stepEyes(rt, { now: 120, pointer: null, random })
    expect(frame.shape).toBe(EYE_PLAYLIST.angry[0])
  })

  it('is a no-op when re-applying the current mood', () => {
    const random = fixedRandom(13)
    const rt = createEyeRuntime('curious', 0, random)
    stepEyes(rt, { now: 0, pointer: null, random })
    const before = rt.cursor
    setMood(rt, 'curious', 5000, random)
    expect(rt.cursor).toBe(before)
  })

  it('survives a huge frame gap without producing NaN', () => {
    const random = fixedRandom(17)
    const rt = createEyeRuntime('excited', 0, random)
    stepEyes(rt, { now: 0, pointer: { x: 0.5, y: -0.5 }, random })
    const frame = stepEyes(rt, { now: 90000, pointer: { x: -1, y: 1 }, random })
    for (const eye of frame.eyes) {
      expect(eye.transform).not.toContain('NaN')
      expect(eye.d).not.toContain('NaN')
    }
  })
})
