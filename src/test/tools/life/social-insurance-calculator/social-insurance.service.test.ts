import { describe, expect, it } from 'vitest'

import {
  computeInsurance,
  defaultEmployeeRates,
} from '@/tools/life/social-insurance-calculator/social-insurance.service'

describe('computeInsurance', () => {
  it('computes breakdown with default rates on 10000 base', () => {
    const result = computeInsurance(10000)
    expect(result.employee.pension).toBe(800)
    expect(result.employee.medical).toBe(200)
    expect(result.employee.housing).toBe(1200)
    expect(result.employee.total).toBe(2250)
    expect(result.takeHome).toBe(7750)
    expect(result.employerCost).toBe(10000 + result.employer.total)
  })

  it('respects custom rates', () => {
    const result = computeInsurance(10000, { ...defaultEmployeeRates, housing: 0.05 })
    expect(result.employee.housing).toBe(500)
  })

  it('rounds items to 2 decimals', () => {
    const result = computeInsurance(3333.33)
    for (const value of Object.values(result.employee)) {
      expect(Number(value.toFixed(2))).toBe(value)
    }
  })

  it('throws on negative base or out-of-range rate', () => {
    expect(() => computeInsurance(-1)).toThrowError(/non-negative/)
    expect(() => computeInsurance(100, { ...defaultEmployeeRates, pension: 2 })).toThrowError(
      /Invalid rate/,
    )
  })
})
