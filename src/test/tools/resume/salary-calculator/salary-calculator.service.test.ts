import { describe, expect, it } from 'vitest'

import {
  EMPTY_OTHER_DEDUCTIONS,
  EMPTY_SPECIAL_DEDUCTIONS,
  bonusTrapZoneOf,
  bonusTrapZones,
  bonusTaxSeparate,
  clampSocialBase,
  computeSalary,
  defaultRatesOfCity,
  monthlyOtherDeduction,
  monthlySpecialDeduction,
  seriousIllnessDeduction,
  solveGrossForTargetTakeHome,
  taxForCumulative,
  type CalcInput,
} from '@/tools/resume/salary-calculator/salary-calculator.service'
import {
  cityPresetOf,
  fundDefaultsOfCity,
  type CityPreset,
} from '@/tools/resume/salary-calculator/salary-data'

describe('taxForCumulative', () => {
  it('applies the 3% bracket up to the first annual threshold', () => {
    const slice = taxForCumulative(36000)
    expect(slice.rate).toBe(0.03)
    expect(slice.quickDeduction).toBe(0)
    expect(slice.tax).toBe(1080)
  })

  it('keeps the tax amount continuous across bracket boundaries', () => {
    expect(taxForCumulative(36000.01).rate).toBe(0.1)
    expect(taxForCumulative(36000.01).tax).toBe(1080)
  })

  it.each([
    [36000, 1080],
    [144000, 11880],
    [300000, 43080],
    [420000, 73080],
    [660000, 145080],
    [960000, 250080],
  ])('reproduces the progressive sum at each bracket ceiling (%s)', (taxable, expected) => {
    expect(taxForCumulative(taxable).tax).toBe(expected)
  })

  it('uses the top marginal rate above 960000', () => {
    const slice = taxForCumulative(2000000)
    expect(slice.rate).toBe(0.45)
    expect(slice.tax).toBe(718080)
  })

  it('returns zero tax for non-positive taxable income', () => {
    expect(taxForCumulative(0)).toEqual({ rate: 0, quickDeduction: 0, tax: 0 })
    expect(taxForCumulative(-12000)).toEqual({ rate: 0, quickDeduction: 0, tax: 0 })
  })

  it('rejects non-finite input', () => {
    expect(() => taxForCumulative(Number.NaN)).toThrowError(/finite/)
    expect(() => taxForCumulative(Number.POSITIVE_INFINITY)).toThrowError(/finite/)
  })
})

describe('bonusTaxSeparate', () => {
  it('taxes 36000 in the bottom monthly bracket', () => {
    expect(bonusTaxSeparate(36000)).toBe(1080)
  })

  it('exposes the known cliff just above a monthly boundary', () => {
    const crossed = bonusTaxSeparate(36001)
    expect(crossed).toBe(3390.1)
    expect(Math.round((crossed - 1080) * 100) / 100).toBe(2310.1)
  })

  it('handles the 144000 boundary the same way', () => {
    expect(bonusTaxSeparate(144000)).toBe(14190)
    expect(bonusTaxSeparate(144001)).toBe(27390.2)
  })

  it('derives the monthly quick deduction from the annual table', () => {
    // 660000 / 12 = 55000，仍属 30% 档，速算扣除数应为年度 52920 / 12 = 4410
    expect(bonusTaxSeparate(660000)).toBe(193590)
  })

  it('returns zero for an absent bonus', () => {
    expect(bonusTaxSeparate(0)).toBe(0)
  })

  it('rejects negative and non-finite bonuses', () => {
    expect(() => bonusTaxSeparate(-1)).toThrowError(/non-negative/)
    expect(() => bonusTaxSeparate(Number.NaN)).toThrowError(/non-negative/)
  })
})

const LIVING = { rent: 3500, commute: 400, food: 1600, misc: 600 }

function inputOf(overrides: Partial<CalcInput> = {}): CalcInput {
  return {
    grossMonthly: 20000,
    cityId: 'other',
    fundRate: 0.12,
    rates: defaultRatesOfCity(cityPresetOf('other')),
    startMonth: 1,
    firstSalaryInYear: false,
    deductions: EMPTY_SPECIAL_DEDUCTIONS,
    other: EMPTY_OTHER_DEDUCTIONS,
    bonusAmount: 0,
    bonusMode: 'auto',
    living: LIVING,
    ...overrides,
  }
}

const SOLVE_BASE: Omit<CalcInput, 'grossMonthly'> = {
  cityId: 'other',
  fundRate: 0.12,
  rates: defaultRatesOfCity(cityPresetOf('other')),
  startMonth: 1,
  firstSalaryInYear: false,
  deductions: EMPTY_SPECIAL_DEDUCTIONS,
  other: EMPTY_OTHER_DEDUCTIONS,
  bonusAmount: 0,
  bonusMode: 'auto',
  living: LIVING,
}

describe('monthlySpecialDeduction', () => {
  it('is zero when nothing is claimed', () => {
    expect(monthlySpecialDeduction(EMPTY_SPECIAL_DEDUCTIONS)).toBe(0)
  })

  it('adds up per-child, academic, mortgage and elder support', () => {
    expect(
      monthlySpecialDeduction({
        ...EMPTY_SPECIAL_DEDUCTIONS,
        childEducationChildren: 2,
        infantCareChildren: 1,
        continuingEducation: 'academic',
        mortgageInterest: true,
        elderSupportMonthly: 1500,
      }),
    ).toBe(8900)
  })

  it('spreads the one-off qualification credit over twelve months', () => {
    expect(
      monthlySpecialDeduction({
        ...EMPTY_SPECIAL_DEDUCTIONS,
        continuingEducation: 'qualification',
      }),
    ).toBe(300)
  })
})

describe('seriousIllnessDeduction', () => {
  it('ignores self payment below the annual threshold', () => {
    expect(seriousIllnessDeduction(15000)).toBe(0)
  })

  it('deducts the excess above the threshold', () => {
    expect(seriousIllnessDeduction(50000)).toBe(35000)
  })

  it('caps at the annual limit', () => {
    expect(seriousIllnessDeduction(200000)).toBe(80000)
  })
})

describe('clampSocialBase', () => {
  const city: CityPreset = {
    id: 'test',
    livingCostTier: 'tier1',
    socialBaseMin: 6000,
    socialBaseMax: 30000,
  }

  it('caps at the upper bound', () => {
    expect(clampSocialBase(40000, city)).toEqual({ base: 30000, clamped: 'max' })
  })

  it('lifts to the lower bound', () => {
    expect(clampSocialBase(3000, city)).toEqual({ base: 6000, clamped: 'min' })
  })

  it('passes through when the city publishes no bounds', () => {
    expect(clampSocialBase(10000, { id: 'other', livingCostTier: 'other' })).toEqual({
      base: 10000,
      clamped: null,
    })
  })

  it('rejects a negative amount', () => {
    expect(() => clampSocialBase(-1, city)).toThrowError(/non-negative/)
  })
})

describe('computeSalary', () => {
  it('withholds month by month and steps into the next bracket in month four', () => {
    const result = computeSalary(inputOf())
    expect(result.insurance.employee.total).toBe(4500)
    expect(result.months.map((row) => row.tax)).toEqual([
      315, 315, 315, 735, 1050, 1050, 1050, 1050, 1050, 1050, 1050, 1050,
    ])
    expect(result.year.annualSalaryTaxPrepaid).toBe(10080)
  })

  it('averages take-home pay below the first month because withholding ramps up', () => {
    const result = computeSalary(inputOf())
    expect(result.monthlyTakeHomeFirst).toBe(15185)
    expect(result.monthlyTakeHomeLast).toBe(14450)
    expect(result.monthlyTakeHomeAverage).toBe(14660)
  })

  it('subtracts living costs into disposable income and a saving rate', () => {
    const result = computeSalary(inputOf())
    expect(result.livingTotal).toBe(6100)
    expect(result.monthlyDisposable).toBe(8560)
    expect(result.annualSaving).toBe(102720)
    expect(result.savingRate).toBeCloseTo(102720 / 175920, 10)
    expect(result.year.effectiveTaxRate).toBeCloseTo(10080 / 240000, 10)
    expect(result.year.takeHomeRate).toBeCloseTo(175920 / 240000, 10)
  })

  it('reports housing fund paid into the personal account on top of cash', () => {
    const result = computeSalary(inputOf())
    expect(result.insurance.employee.housing).toBe(2400)
    expect(result.year.annualHousingFundDeposit).toBe(57600)
  })

  it('honours explicit social and fund bases', () => {
    const result = computeSalary(inputOf({ socialBase: 10000, fundBase: 10000 }))
    expect(result.insurance.socialBase).toBe(10000)
    expect(result.insurance.fundBase).toBe(10000)
    expect(result.months[0].insurance).toBe(2250)
  })

  it('defaults the fund base to the gross salary rather than the capped social base', () => {
    const result = computeSalary(inputOf({ cityId: 'guangzhou', grossMonthly: 40000 }))
    expect(result.insurance.socialBase).toBe(27549)
    expect(result.insurance.fundBase).toBe(40000)
    expect(result.insurance.socialClamped).toBe('max')
    expect(result.insurance.fundClamped).toBeNull()
  })

  it('keeps a negative cumulative taxable income at zero tax', () => {
    const result = computeSalary(
      inputOf({
        deductions: {
          ...EMPTY_SPECIAL_DEDUCTIONS,
          childEducationChildren: 3,
          infantCareChildren: 2,
          continuingEducation: 'academic',
          mortgageInterest: true,
          elderSupportMonthly: 3000,
        },
      }),
    )
    expect(result.months[11].cumulativeTaxable).toBe(-46800)
    expect(result.months[11].tax).toBe(0)
  })

  it('applies the annual serious illness deduction only at settlement', () => {
    const result = computeSalary(
      inputOf({ deductions: { ...EMPTY_SPECIAL_DEDUCTIONS, seriousIllnessSelfPaid: 50000 } }),
    )
    expect(result.year.annualSalaryTaxPrepaid).toBe(10080)
    expect(result.year.annualSalaryTaxPayable).toBe(6580)
    expect(result.year.settlementRefund).toBe(3500)
    expect(result.monthlyTakeHomeAverage).toBe(14660)
  })
})

describe('computeSalary year-end bonus', () => {
  it('keeps the bonus separate when that pays less', () => {
    const result = computeSalary(inputOf({ bonusAmount: 36000 }))
    expect(result.year.bonusMode).toBe('separate')
    expect(result.year.bonusTax).toBe(1080)
    expect(result.year.annualTaxTotal).toBe(11160)
  })

  it('merges the bonus when the salary leaves no taxable room', () => {
    const result = computeSalary(
      inputOf({ grossMonthly: 6000, socialBase: 6000, bonusAmount: 100000 }),
    )
    expect(result.year.bonusMode).toBe('merged')
    expect(result.year.bonusTax).toBe(7480)
    expect(result.year.annualTaxTotal).toBe(7480)
  })

  it('respects an explicit mode even when it costs more', () => {
    const mergedFirst = computeSalary(inputOf({ bonusAmount: 36000 }))
    const forced = computeSalary(inputOf({ bonusAmount: 36000, bonusMode: 'merged' }))
    expect(mergedFirst.year.bonusTax).toBe(1080)
    expect(forced.year.bonusTax).toBe(5400)
    expect(forced.year.bonusMode).toBe('merged')
  })
})

describe('bonusTrapZones', () => {
  it('derives the six cliff ranges from the rate table', () => {
    const zones = bonusTrapZones()
    expect(zones).toHaveLength(6)
    expect(zones[0]).toEqual({ from: 36001, to: 38566.67 })
    expect(zones[1]).toEqual({ from: 144001, to: 160500 })
    expect(zones[5]).toEqual({ from: 960001, to: 1120000 })
  })

  it('flags a bonus that nets less than the smaller bonus below the cliff', () => {
    const netAt = (amount: number) => amount - bonusTaxSeparate(amount)
    expect(bonusTrapZoneOf(37000)?.from).toBe(36001)
    expect(netAt(37000)).toBeLessThan(netAt(36000))
    expect(netAt(38566.67)).toBeCloseTo(netAt(36000), 2)
  })

  it('leaves bonuses on the safe side of a cliff alone', () => {
    expect(bonusTrapZoneOf(36000)).toBeNull()
    expect(bonusTrapZoneOf(39000)).toBeNull()
    expect(bonusTrapZoneOf(0)).toBeNull()
  })
})

describe('solveGrossForTargetTakeHome', () => {
  const base = SOLVE_BASE

  it('solves a pre-tax salary that reproduces the requested take-home pay', () => {
    const solved = solveGrossForTargetTakeHome(15000, base)
    expect(solved.grossMonthly).toBeGreaterThan(20400)
    expect(solved.grossMonthly).toBeLessThan(20600)
    const result = computeSalary({ ...base, grossMonthly: solved.grossMonthly })
    expect(result.monthlyTakeHomeAverage).toBeGreaterThanOrEqual(15000)
    expect(result.monthlyTakeHomeAverage).toBeLessThanOrEqual(15000.5)
  })

  it('returns the concrete bonus mode it solved with', () => {
    const solved = solveGrossForTargetTakeHome(15000, { ...base, bonusAmount: 36000 })
    expect(solved.bonusMode).toBe('separate')
  })

  it('refuses a target beyond the searchable ceiling', () => {
    expect(() => solveGrossForTargetTakeHome(10000000, base)).toThrowError(/searchable range/)
  })

  it('rejects a negative target', () => {
    expect(() => solveGrossForTargetTakeHome(-100, base)).toThrowError(/non-negative/)
  })
})

describe('computeSalary input validation', () => {
  it('rejects a negative salary and negative living costs', () => {
    expect(() => computeSalary(inputOf({ grossMonthly: -1 }))).toThrowError(/non-negative/)
    expect(() => computeSalary(inputOf({ living: { ...LIVING, rent: -1 } }))).toThrowError(
      /Living cost rent/,
    )
  })

  it('rejects an out-of-range housing fund rate', () => {
    expect(() => computeSalary(inputOf({ fundRate: 1.5 }))).toThrowError(/housing fund rate/)
  })

  it('rejects an unknown rent deduction tier', () => {
    expect(() =>
      computeSalary(inputOf({ deductions: { ...EMPTY_SPECIAL_DEDUCTIONS, rentDeductTier: 999 } })),
    ).toThrowError(/rent deduction tier/)
  })

  it('rejects elder support above the cap', () => {
    expect(() =>
      computeSalary(
        inputOf({ deductions: { ...EMPTY_SPECIAL_DEDUCTIONS, elderSupportMonthly: 4000 } }),
      ),
    ).toThrowError(/exceeds the monthly cap/)
  })

  it('rejects claiming mortgage interest and rent together', () => {
    expect(() =>
      computeSalary(
        inputOf({
          deductions: { ...EMPTY_SPECIAL_DEDUCTIONS, mortgageInterest: true, rentDeductTier: 1500 },
        }),
      ),
    ).toThrowError(/cannot both be deducted/)
  })
})

describe('result precision', () => {
  it('keeps every money field at two decimals', () => {
    const result = computeSalary(inputOf({ bonusAmount: 36000 }))
    const money = [
      result.insurance.socialBase,
      result.insurance.fundBase,
      result.insurance.housingExcess,
      ...Object.values(result.insurance.employee),
      ...Object.values(result.insurance.employer),
      result.livingTotal,
      result.monthlyTakeHomeAverage,
      result.monthlyTakeHomeFirst,
      result.monthlyTakeHomeLast,
      result.monthlyDisposable,
      result.annualSaving,
      ...Object.entries(result.year)
        .filter(
          (entry): entry is [string, number] =>
            typeof entry[1] === 'number' && !entry[0].toLowerCase().includes('rate'),
        )
        .map((entry) => entry[1]),
      ...result.months.flatMap((row) => [
        row.cumulativeTaxable,
        row.tax,
        row.insurance,
        row.takeHome,
      ]),
    ]
    for (const value of money) {
      expect(value).toBe(Math.round(value * 100) / 100)
    }
  })
})

describe('other deductions', () => {
  it('spreads the annual personal pension over twelve months', () => {
    expect(monthlyOtherDeduction({ ...EMPTY_OTHER_DEDUCTIONS, personalPensionAnnual: 12000 })).toBe(
      1000,
    )
  })

  it('caps the pension and the tax-preferred insurance at their annual limits', () => {
    expect(
      monthlyOtherDeduction({ personalPensionAnnual: 90000, taxPreferredInsuranceAnnual: 9000 }),
    ).toBe(1200)
  })

  it('lowers withheld tax by the marginal rate', () => {
    const result = computeSalary(
      inputOf({ other: { ...EMPTY_OTHER_DEDUCTIONS, personalPensionAnnual: 12000 } }),
    )
    expect(result.year.annualSalaryTaxPrepaid).toBe(8880)
  })
})

describe('over-contributed housing fund', () => {
  it('adds back the part above the employee gross salary', () => {
    const result = computeSalary(inputOf({ fundBase: 30000 }))
    expect(result.insurance.employee.housing).toBe(3600)
    expect(result.insurance.housingExcess).toBe(1200)
    expect(result.months[0].insurance).toBe(5700)
    expect(result.months[0].takeHome).toBe(13985)
    expect(result.year.annualSalaryTaxPrepaid).toBe(10080)
  })
})

describe('mid-year start', () => {
  it('counts only the months actually worked', () => {
    const result = computeSalary(inputOf({ startMonth: 7 }))
    expect(result.months).toHaveLength(6)
    expect(result.year.monthsWorked).toBe(6)
    expect(result.year.annualSalary).toBe(120000)
    expect(result.year.annualSalaryTaxPrepaid).toBe(3780)
    expect(result.monthlyTakeHomeAverage).toBe(14870)
  })

  it('uses calendar months for the basic deduction on a first job that year', () => {
    const result = computeSalary(inputOf({ startMonth: 7, firstSalaryInYear: true }))
    expect(result.months[0].tax).toBe(0)
    expect(result.months[5].cumulativeTaxable).toBe(33000)
    expect(result.year.annualSalaryTaxPrepaid).toBe(990)
  })
})

describe('city presets', () => {
  it('carries the researched current-year numbers', () => {
    const beijing = cityPresetOf('beijing')
    expect(beijing.socialBaseMax).toBe(36348)
    expect(beijing.socialBasePeriod).toBe('2026-07')
    expect(beijing.rentDeductTier).toBe(1500)
    expect(cityPresetOf('suzhou').rentDeductTier).toBe(1100)
    expect(cityPresetOf('guangzhou').fundBaseMax ?? 0).toBeGreaterThan(
      cityPresetOf('guangzhou').socialBaseMax ?? 0,
    )
  })

  it('takes rates from the city where it publishes them', () => {
    expect(defaultRatesOfCity(cityPresetOf('beijing')).employerMedical).toBe(0.098)
    expect(defaultRatesOfCity(cityPresetOf('beijing')).extraMedicalMonthly).toBe(3)
    expect(defaultRatesOfCity(cityPresetOf('other')).extraMedicalMonthly).toBe(0)
    expect(fundDefaultsOfCity(cityPresetOf('shanghai'))).toEqual({ rate: 0.07, rateMax: 0.07 })
  })

  it('folds the fixed major-illness mutual aid fee into the medical line', () => {
    const result = computeSalary(
      inputOf({ cityId: 'nanjing', rates: defaultRatesOfCity(cityPresetOf('nanjing')) }),
    )
    expect(result.insurance.employee.medical).toBe(410)
    expect(result.insurance.employee.total).toBe(4510)
  })

  it('falls back to the neutral preset for an unknown city id', () => {
    expect(cityPresetOf('nowhere').id).toBe('other')
  })
})
