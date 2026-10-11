import { describe, expect, it } from 'vitest'

import { clipFor, planFlight, type Rect } from '@/components/home/circuit/flight-plan'

const VIEWPORT = { width: 1440, height: 900 }
const ORIGIN: Rect = { left: 120, top: 300, width: 104, height: 68 }
const CORE: Rect = { left: 620, top: 380, width: 208, height: 168 }

describe('flight-plan: card placement', () => {
  it('centres the card on the core chip', () => {
    const plan = planFlight(ORIGIN, CORE, VIEWPORT)
    const cardCenterX = plan.card.left + plan.card.width / 2
    const cardCenterY = plan.card.top + plan.card.height / 2
    expect(cardCenterX).toBeCloseTo(CORE.left + CORE.width / 2)
    expect(cardCenterY).toBeCloseTo(CORE.top + CORE.height / 2)
  })

  it('caps the card at the maximum size', () => {
    const plan = planFlight(ORIGIN, CORE, { width: 2560, height: 1600 })
    expect(plan.card.width).toBeLessThanOrEqual(880)
    expect(plan.card.height).toBeLessThanOrEqual(620)
  })

  it('shrinks the card to fit a small viewport with a margin', () => {
    const plan = planFlight(ORIGIN, CORE, { width: 390, height: 700 })
    expect(plan.card.width).toBeLessThanOrEqual(390 - 32)
    expect(plan.card.left).toBeGreaterThanOrEqual(16 - 1e-6)
    expect(plan.card.left + plan.card.width).toBeLessThanOrEqual(390 - 16 + 1e-6)
  })

  it('pulls the card back into view when the core is scrolled off screen', () => {
    const offScreen: Rect = { left: 400, top: -1200, width: 208, height: 168 }
    const plan = planFlight(ORIGIN, offScreen, VIEWPORT)
    expect(plan.card.top).toBeGreaterThanOrEqual(16 - 1e-6)
    expect(plan.card.top + plan.card.height).toBeLessThanOrEqual(VIEWPORT.height - 16 + 1e-6)
  })

  it('centres the card when the viewport is smaller than the card margin allows', () => {
    const plan = planFlight(ORIGIN, CORE, { width: 20, height: 20 })
    expect(plan.card.left + plan.card.width / 2).toBeCloseTo(10)
    expect(plan.card.top + plan.card.height / 2).toBeCloseTo(10)
  })
})

describe('flight-plan: unfold geometry', () => {
  it('keeps the core footprint inside the card', () => {
    const plan = planFlight(ORIGIN, CORE, VIEWPORT)
    expect(plan.core.width).toBeLessThanOrEqual(plan.card.width * 0.5 + 1e-6)
    expect(plan.core.height).toBeLessThanOrEqual(plan.card.height * 0.42 + 1e-6)
    expect(plan.core.left).toBeGreaterThan(0)
    expect(plan.core.top).toBeGreaterThan(0)
  })

  it('expresses the unfold start as the gap between footprint and card edge', () => {
    const plan = planFlight(ORIGIN, CORE, VIEWPORT)
    expect(plan.insetX).toBeCloseTo((plan.core.left / plan.card.width) * 100)
    expect(plan.insetY).toBeCloseTo((plan.core.top / plan.card.height) * 100)
    expect(plan.insetX).toBeGreaterThan(0)
    expect(plan.insetX).toBeLessThan(50)
    expect(plan.insetY).toBeGreaterThan(0)
    expect(plan.insetY).toBeLessThan(50)
  })

  it('lands the flying chip dead centre on the card', () => {
    const plan = planFlight(ORIGIN, CORE, VIEWPORT)
    const chipCenterX = ORIGIN.left + ORIGIN.width / 2 + plan.fly.x
    const chipCenterY = ORIGIN.top + ORIGIN.height / 2 + plan.fly.y
    expect(chipCenterX).toBeCloseTo(plan.card.left + plan.card.width / 2)
    expect(chipCenterY).toBeCloseTo(plan.card.top + plan.card.height / 2)
  })

  it('scales the chip uniformly so its icon never distorts', () => {
    const plan = planFlight(ORIGIN, CORE, VIEWPORT)
    expect(plan.fly.scale * ORIGIN.width).toBeLessThanOrEqual(plan.core.width + 1e-6)
    expect(plan.fly.scale * ORIGIN.height).toBeLessThanOrEqual(plan.core.height + 1e-6)
    expect(plan.fly.scale).toBeGreaterThan(1)
  })
})

describe('flight-plan: clip-path shapes', () => {
  it('starts at the core footprint, opens to the full card', () => {
    const plan = planFlight(ORIGIN, CORE, VIEWPORT)
    expect(clipFor('core', plan)).toContain(`inset(${plan.insetY}% ${plan.insetX}%`)
    expect(clipFor('card', plan)).toBe(`inset(0% 0% round ${plan.cornerRadius}px)`)
  })

  it('collapses vertically only — the foil keeps the full width', () => {
    const plan = planFlight(ORIGIN, CORE, VIEWPORT)
    expect(clipFor('foil', plan)).toBe(`inset(50% 0% round ${plan.cornerRadius}px)`)
  })

  it('keeps the corner radius sane on both ends of the size range', () => {
    expect(
      planFlight(ORIGIN, CORE, { width: 320, height: 568 }).cornerRadius,
    ).toBeGreaterThanOrEqual(12)
    expect(planFlight(ORIGIN, CORE, VIEWPORT).cornerRadius).toBeLessThanOrEqual(26)
  })
})
