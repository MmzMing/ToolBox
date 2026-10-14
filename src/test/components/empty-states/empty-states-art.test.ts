import { describe, expect, it } from 'vitest'

import { FRAMES, KINDS, VIEW, shapePath } from '@/components/empty-states/empty-states-art'
import type { SceneId } from '@/components/empty-states/empty-states-art'

const SCENES: SceneId[] = ['search', 'offline', 'inbox', 'map']
const PHASES = ['idle', 'loading', 'done'] as const

const numbers = (values: ArrayLike<number>) => Array.from(values, Number)

describe('empty states art', () => {
  it('ships four scenes with all three phases, ten primitives each', () => {
    for (const scene of SCENES) {
      for (const phase of PHASES) {
        const prims = FRAMES[scene][phase].prims
        expect(prims).toHaveLength(KINDS.length)
        prims.forEach((prim, index) => expect(prim.kind).toBe(KINDS[index]))
      }
    }
  })

  it('keeps every primitive on the same vector length across frames', () => {
    // 弹簧按整条向量插值，长度对不上就会在换场景时把上一个场景的尾巴留在数组里
    for (const scene of SCENES) {
      const widths = FRAMES[scene].idle.prims.map((prim) => prim.geo.length)
      for (const phase of PHASES) {
        expect(FRAMES[scene][phase].prims.map((prim) => prim.geo.length)).toEqual(widths)
      }
    }
  })

  it('holds opacity and draw inside 0..1 and every coordinate finite', () => {
    for (const scene of SCENES) {
      for (const phase of PHASES) {
        for (const prim of FRAMES[scene][phase].prims) {
          expect(prim.fx[0]).toBeGreaterThanOrEqual(0)
          expect(prim.fx[0]).toBeLessThanOrEqual(1)
          expect(prim.fx[1]).toBeGreaterThanOrEqual(0)
          expect(prim.fx[1]).toBeLessThanOrEqual(1)
          expect(numbers(prim.geo).every(Number.isFinite)).toBe(true)
        }
      }
    }
  })

  it('centers each scene in the view box', () => {
    for (const scene of SCENES) {
      const body = FRAMES[scene].idle.prims[2]!
      const xs: number[] = []
      const ys: number[] = []
      for (let i = 0; i < body.geo.length - 1; i += 2) {
        xs.push(body.geo[i]!)
        ys.push(body.geo[i + 1]!)
      }
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(0)
      expect(Math.max(...xs)).toBeLessThanOrEqual(VIEW.width)
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(0)
      expect(Math.max(...ys)).toBeLessThanOrEqual(VIEW.height)
    }
  })

  it('closes tiles and skips degenerate ones', () => {
    const tile = FRAMES.inbox.idle.prims[0]!
    const { d, dash } = shapePath('tile', tile.geo, tile.fx[1], 0, 0)
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(dash).toBe('none')
    // park() 出来的图元收成 4×4 以下就不该再画，免得留下一个亮点
    expect(shapePath('tile', [0, 0, 0.01, 0.01, 0, 0, 0, 1], 1, 0, 0).d).toBe('')
  })

  it('keeps the map route dashed and everything else solid', () => {
    const route = FRAMES.map.idle.prims[7]!
    const wire = FRAMES.offline.idle.prims[7]!
    expect(shapePath('stroke', route.geo, route.fx[1], 0, 0).dash).toMatch(/^3 /)
    expect(shapePath('stroke', wire.geo, wire.fx[1], 0, 0).dash).toBe('none')
  })

  it('draws a stroke in only as far as its progress says', () => {
    const route = FRAMES.map.loading.prims[7]!
    expect(route.fx[1]).toBe(0)
    expect(shapePath('mark', FRAMES.map.loading.prims[9]!.geo, 0, 0, 0).d).toBe('')
    const full = shapePath('mark', FRAMES.map.idle.prims[9]!.geo, 1, 0, 0).d
    expect(full.split('M').length - 1).toBe(2) // 叉是两条独立笔画
  })

  it('swaps the offline mark from warning slashes to a success check', () => {
    expect(FRAMES.offline.idle.prims[9]!.tone).toBe('warning')
    expect(FRAMES.offline.done.prims[9]!.tone).toBe('success')
    expect(FRAMES.offline.idle.prims[6]!.tone).toBe('outline')
    expect(FRAMES.offline.done.prims[6]!.tone).toBe('success')
  })
})
