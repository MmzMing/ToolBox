import { describe, expect, it } from 'vitest'

import {
  EYE_BOX,
  EYE_CENTER,
  FACE_ANCHOR,
  centroid,
  clampToDisc,
  consumeBlink,
  createEyeRuntime,
  eyeReach,
  eyeSlice,
  polyPath,
  queueBlink,
  setMood,
  stepEyes,
  type BlinkKey,
  type EyeRhythm,
} from '@/components/fluid-orb/orb-eyes'
import {
  BLINK_KEYS,
  DOUBLE_BLINK_KEYS,
  EYE_PLAYLIST,
  NO_BLINK_MOODS,
  ORB_EYE_MOODS,
  WINK_MOODS,
  isOrbEyeMood,
} from '@/components/fluid-orb/orb-eye-states'
import {
  ORB_EYE_POINTS,
  ORB_EYE_SHAPES,
  barAt,
  lerpBar,
  morphedEye,
} from '@/components/fluid-orb/orb-eye-shapes'

/** 固定随机源，让播放列表与眨眼节奏在测试里可复现 */
function fixedRandom(seed = 1) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 0x100000000
    return s / 0x100000000
  }
}

/**
 * 用例专用的快节奏。产品默认是一分钟换一张脸（config 里那两档），
 * 测试要跑的是"换得过来"这件事，不能真等一分钟，所以自己声明节奏而不是依赖默认值。
 */
const FAST_RHYTHM: EyeRhythm = { hold: [700, 1200], blink: [900, 1500] }

function translateOf(transform: string): { x: number; y: number; sx: number; sy: number } {
  const m = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+) ([-\d.]+)\)/u.exec(transform)
  if (m === null) {
    throw new Error(`unexpected transform: ${transform}`)
  }
  return { x: Number(m[1]), y: Number(m[2]), sx: Number(m[3]), sy: Number(m[4]) }
}

function run(mood: (typeof ORB_EYE_MOODS)[number], ms: number, pointer = { x: 0, y: 0 }) {
  const random = fixedRandom()
  const rt = createEyeRuntime(mood, 0, random, FAST_RHYTHM)
  let frame = null
  for (let now = 0; now <= ms; now += 16.7) {
    frame = stepEyes(rt, { now, pointer, random })
  }
  return { rt, frame: frame!, random }
}

describe('geometry data integrity', () => {
  it('ships 10 eye shapes, each a left/right pair of the same point count', () => {
    expect(ORB_EYE_SHAPES).toHaveLength(10)
    for (const shape of ORB_EYE_SHAPES) {
      expect(shape).toHaveLength(ORB_EYE_POINTS * 2 * 2)
    }
  })

  it('keeps the eye plump while a bar rotates flat', () => {
    // 回归：插点插不出旋转——竖条的第 i 个点与横条的第 i 个点差了 90°，
    // 平均下来中间帧只剩一坨。现在插的是参数，所以中间帧面积必须始终和两端同一量级。
    const areaOf = (flat: readonly number[]) => {
      let sum = 0
      for (let i = 0; i < flat.length; i += 2) {
        const j = (i + 2) % flat.length
        sum += flat[i] * flat[j + 1] - flat[j] * flat[i + 1]
      }
      return Math.abs(sum) / 2
    }
    const UPRIGHT = 0
    const LYING = 7
    const floor =
      Math.min(areaOf(morphedEye(UPRIGHT, LYING, 0, 1)), areaOf(morphedEye(UPRIGHT, LYING, 1, 1))) *
      0.6
    for (const t of [0.25, 0.5, 0.75]) {
      expect(areaOf(morphedEye(UPRIGHT, LYING, t, 1))).toBeGreaterThan(floor)
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

  it('gives every one of the 20 moods a playlist of at least two shapes', () => {
    expect(ORB_EYE_MOODS).toHaveLength(20)
    for (const mood of ORB_EYE_MOODS) {
      // 至少两组：单组会让 stepEyes 每个停留时长到点都原地重放一次换形脉冲
      expect(EYE_PLAYLIST[mood].length).toBeGreaterThanOrEqual(2)
    }
    // 不眨眼的状态也不该被派到单眼眨——stepEyes 里 wink 是挂在眨眼分支下的
    for (const mood of NO_BLINK_MOODS) {
      expect(WINK_MOODS.has(mood)).toBe(false)
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

  it('keeps every shipped eye shape referenced by some mood', () => {
    const referenced = new Set(ORB_EYE_MOODS.flatMap((mood) => [...EYE_PLAYLIST[mood]]))
    expect(referenced.size).toBe(ORB_EYE_SHAPES.length)
  })

  it('narrows the mood union only to the 20 known names', () => {
    expect(isOrbEyeMood('thinking')).toBe(true)
    expect(isOrbEyeMood('celebrate')).toBe(true)
    // 裁剪掉的态必须不再被接受，否则拼错的旧名字会静默落回 undefined 播放列表
    expect(isOrbEyeMood('loading')).toBe(false)
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

  it('measures the diagonal reach, not just the horizontal one', () => {
    // 一条 10×40 的竖条：只按横向余量夹，外接半径少算一半，大眼睛斜着看会戳出球外
    const bar = [0, 0, 10, 0, 10, 40, 0, 40]
    expect(eyeReach(bar)).toBeCloseTo(Math.hypot(5, 20), 6)
  })

  it('interpolates bar parameters, rotation axis included', () => {
    const upright = { h: 40, w: 15 }
    const lying = { h: 30, w: 10, axis: 90 }
    expect(lerpBar(upright, lying, 0)).toBe(upright)
    expect(lerpBar(upright, lying, 1)).toBe(lying)
    const mid = lerpBar(upright, lying, 0.5)
    expect(mid.axis).toBe(45)
    expect(mid.h).toBeCloseTo(35)
    // 没写的字段按 0 补齐，所以插值结果总是全字段，不会因为少写一个键就跳变
    expect(mid.chev).toBe(0)
    expect(mid.lid).toBe(0)
  })

  it('points the caret slot upward, not downward', () => {
    // axis 转 90° 之后 chev 的正负号反直觉，靠肉眼判过一次判错了（^ ^ 画成 v v）。
    // 屏幕 y 越小越靠上：^ 的中间应该比两条臂的端点更高。
    const flat = morphedEye(6, 6, 1, 1)
    const pts: { x: number; y: number }[] = []
    for (let i = 0; i < flat.length; i += 2) {
      pts.push({ x: flat[i], y: flat[i + 1] })
    }
    const byX = [...pts].sort((a, b) => a.x - b.x)
    const tip = byX[0]
    const other = byX.at(-1)!
    const midX = (tip.x + other.x) / 2
    const peak = pts.reduce((a, b) => (Math.abs(b.x - midX) < Math.abs(a.x - midX) ? b : a))
    expect(peak.y).toBeLessThan(tip.y)
    expect(peak.y).toBeLessThan(other.y)
  })

  it('leans the angry pair inward-down and the sad pair inward-up', () => {
    // tilt 的正负极易记反（字段注释就记反过一次），所以钉观感事实而不是钉符号：
    // 生气 = 靠鼻子那一端压低（\ /），委屈 = 靠鼻子那一端抬起（/ \）。
    // 方向看协方差符号：笔画歪向哪边它就在哪边变号，镜像眼自动反。
    // 不能用"极值 x 的端点"——笔画是旋转的，最左/最右落在圆头侧面而不是端头。
    const sxyOf = (slot: number, side: 1 | -1) => {
      const flat = morphedEye(slot, slot, 1, side)
      const pts: [number, number][] = []
      for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]])
      const n = pts.length
      const mx = pts.reduce((a, p) => a + p[0], 0) / n
      const my = pts.reduce((a, p) => a + p[1], 0) / n
      let sxx = 0
      let syy = 0
      let sxy = 0
      for (const [x, y] of pts) {
        sxx += (x - mx) ** 2
        syy += (y - my) ** 2
        sxy += (x - mx) * (y - my)
      }
      return { sxy, lean: 90 - Math.abs((0.5 * Math.atan2(2 * sxy, sxx - syy) * 180) / Math.PI) }
    }
    const ANGRY = 3
    const SAD = 4
    // 右眼（side=1）内角在左边：内角压低 = y 随 x 减小而增大 = sxy 为负
    expect(sxyOf(ANGRY, 1).sxy).toBeLessThan(0)
    expect(sxyOf(ANGRY, -1).sxy).toBeGreaterThan(0)
    expect(sxyOf(SAD, 1).sxy).toBeGreaterThan(0)
    expect(sxyOf(SAD, -1).sxy).toBeLessThan(0)
    // 两只眼歪得不一样多：生气右眼 48° 更平、左眼 40°；委屈反过来。
    // 完全对称会读成一个图标，不像一张脸
    expect(sxyOf(ANGRY, 1).lean).toBeGreaterThan(sxyOf(ANGRY, -1).lean)
    expect(sxyOf(SAD, -1).lean).toBeGreaterThan(sxyOf(SAD, 1).lean)
  })

  it('lets one eye differ from the other', () => {
    // 眨眼格：只有右眼折成 <，左眼保持竖条。chev 是镜像的，写到共享字段上
    // 左眼会跟着折成 >，那一格就从眨眼变成大笑了
    expect(barAt(8, 1).chev).toBeGreaterThan(0)
    expect(barAt(8, -1).chev ?? 0).toBe(0)
    // 疑惑格：一大一小 + 一高一低，但两只都得是正圆（h = w）
    expect(barAt(9, 1).h).toBeLessThan(barAt(9, -1).h)
    expect(barAt(9, 1).h).toBe(barAt(9, 1).w)
    expect(barAt(9, -1).h).toBe(barAt(9, -1).w)
    // 底边对齐：两只圆的下缘差在一两个单位内。中心齐平会读成"一大一小飘着"，
    // 下缘齐平才像抬起一边眉毛打量你
    const bottomOf = (side: 1 | -1) =>
      Math.max(...morphedEye(9, 9, 1, side).filter((_, i) => i % 2 === 1))
    expect(Math.abs(bottomOf(1) - bottomOf(-1))).toBeLessThan(3)
  })
})

describe('blink queue', () => {
  it('closes, holds, then reopens with exactly one overshoot on the way back', () => {
    const q: BlinkKey[] = []
    queueBlink(q, 1000, () => 0.99)
    const lids = q.map((k) => k.v)
    // 数值本身归 BLINK_KEYS 那张表管，这里钉的是"形状"：闭 → 停一下 → 睁过头一次 → 落回全开
    expect(lids[0]).toBeLessThan(0.2)
    expect(lids[1]).toBe(lids[0])
    expect(lids.filter((v) => v > 1)).toHaveLength(1)
    expect(lids.at(-1)).toBe(1)
    expect(q.map((k) => k.at)).toEqual([...q.map((k) => k.at)].sort((a, b) => a - b))
    expect(q[0].at).toBe(1000)
    expect(consumeBlink(q, 1000)).toBe(lids[0])
    expect(consumeBlink(q, 4000)).toBe(1)
    expect(q).toHaveLength(0)
  })

  it('appends a second blink when the roll comes up', () => {
    const q: BlinkKey[] = []
    queueBlink(q, 0, () => 0.01)
    expect(q).toHaveLength(BLINK_KEYS.length + DOUBLE_BLINK_KEYS.length)
    // 二次眨排在第一次落回全开之后，否则两次会叠成一团
    expect(q.at(-2)!.at).toBeGreaterThan(BLINK_KEYS.at(-1)![0])
  })

  it('skips the second blink when the roll does not come up', () => {
    const q: BlinkKey[] = []
    queueBlink(q, 0, () => 0.99)
    expect(q).toHaveLength(BLINK_KEYS.length)
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
    const spot = clampToDisc(500, EYE_CENTER, 10)
    expect(spot.x).toBeLessThan(EYE_BOX)
    expect(spot.y).toBeCloseTo(EYE_CENTER, 3)
    // 拉回到「球半径减掉眼睛自身半径」那一圈上
    expect(Math.hypot(spot.x - EYE_CENTER, spot.y - EYE_CENTER)).toBeCloseTo(EYE_CENTER - 10, 1)
  })

  it('collapses to the centre when the eye is bigger than the disc', () => {
    expect(clampToDisc(300, 300, 1000).x).toBeCloseTo(EYE_CENTER, 3)
  })
})

describe('stepEyes', () => {
  it('centres the eye pair on the face anchor for every mood', () => {
    // 回归：谁把某格眼形整个画偏了（比如给一只眼加了 spread），不减掉双眼中点的话，
    // 换到那个表情时整张脸会歪到球边上去
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
    const rt = createEyeRuntime('thinking', 0, random, FAST_RHYTHM)
    for (let now = 0; now < 40000; now += 16.7) {
      seen.add(stepEyes(rt, { now, pointer: null, random }).shape)
    }
    expect(seen.size).toBe(EYE_PLAYLIST.thinking.length)
  })

  it('paces the playlist by the rhythm it was given, not by the default', () => {
    // 默认一分钟一张脸。用例若偷偷依赖默认值，上面那条就会变成等一分钟才通过
    const random = fixedRandom(7)
    const slow = createEyeRuntime('thinking', 0, random)
    let frame = stepEyes(slow, { now: 0, pointer: null, random })
    for (let now = 16.7; now < 40000; now += 16.7) {
      frame = stepEyes(slow, { now, pointer: null, random })
    }
    expect(frame.shape).toBe(EYE_PLAYLIST.thinking[0])
  })

  it('closes the lid during a blink and reopens it', () => {
    const random = fixedRandom(3)
    const rt = createEyeRuntime('listening', 0, random, FAST_RHYTHM)
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

  it('never blinks in a mood listed in NO_BLINK_MOODS', () => {
    const random = fixedRandom(5)
    const rt = createEyeRuntime('drowsy', 0, random, FAST_RHYTHM)
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
