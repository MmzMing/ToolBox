/**
 * 到手工资计算引擎：五险一金 → 个税累计预扣 → 年终奖 → 生活成本 → 可储蓄。
 * 全部纯函数，零 DOM / React 依赖；非法输入抛英文 Error，翻译与降级由 UI 负责。
 */

import {
  BASIC_DEDUCTION_MONTHLY,
  DEFAULT_EMPLOYEE_RATES,
  DEFAULT_EMPLOYER_RATES,
  MONTHLY_TAX_BRACKETS,
  OTHER_DEDUCTION_LIMITS,
  RENT_DEDUCT_CHOICES,
  SPECIAL_DEDUCTIONS,
  TAX_BRACKETS,
  cityPresetOf,
  type CityPreset,
  type LivingCost,
} from './salary-data'

type TaxBracket = {
  readonly upTo: number
  readonly rate: number
  readonly quickDeduction: number
}

export type TaxSlice = {
  /** 适用税率（0–1） */
  rate: number
  quickDeduction: number
  tax: number
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** 级距表末档上限为 Infinity，查找必然命中；兜底写法同时满足「禁非空断言」 */
function pickBracket(brackets: readonly TaxBracket[], amount: number): TaxBracket {
  return brackets.find((bracket) => amount <= bracket.upTo) ?? brackets[brackets.length - 1]
}

/**
 * 按累计应纳税所得额算出累计应预扣税额。
 * 传入的是「累计」数（含此前所有月份），返回值也是累计税额，当月税额由调用方相减得到。
 */
export function taxForCumulative(cumulativeTaxable: number): TaxSlice {
  if (!Number.isFinite(cumulativeTaxable)) {
    throw new Error('Cumulative taxable income must be a finite number')
  }
  if (cumulativeTaxable <= 0) {
    return { rate: 0, quickDeduction: 0, tax: 0 }
  }
  const bracket = pickBracket(TAX_BRACKETS, cumulativeTaxable)
  return {
    rate: bracket.rate,
    quickDeduction: bracket.quickDeduction,
    tax: round2(cumulativeTaxable * bracket.rate - bracket.quickDeduction),
  }
}

/**
 * 年终奖单独计税：以「奖金 ÷ 12」的商对照月度税率表确定税率与速算扣除数，
 * 税额 = 奖金全额 × 税率 − 速算扣除数。
 */
export function bonusTaxSeparate(bonus: number): number {
  if (!Number.isFinite(bonus) || bonus < 0) {
    throw new Error('Year-end bonus must be a non-negative number')
  }
  if (bonus === 0) return 0
  const bracket = pickBracket(MONTHLY_TAX_BRACKETS, bonus / 12)
  return round2(bonus * bracket.rate - bracket.quickDeduction)
}

/** 年终奖「多发 1 元、到手反而少」的临界区间，由税率表严格推导而非抄来的常量 */
export type BonusTrapZone = { from: number; to: number }

export function bonusTrapZones(): BonusTrapZone[] {
  return TAX_BRACKETS.slice(0, -1).map((bracket, index) => {
    const next = MONTHLY_TAX_BRACKETS[index + 1]
    const netAtBoundary = bracket.upTo - bonusTaxSeparate(bracket.upTo)
    return {
      from: bracket.upTo + 1,
      to: round2((netAtBoundary - next.quickDeduction) / (1 - next.rate)),
    }
  })
}

/** 奖金落在陷阱区间时返回该区间，供 UI 提示「减到下限反而到手更多」 */
export function bonusTrapZoneOf(bonus: number): BonusTrapZone | null {
  if (!Number.isFinite(bonus) || bonus < 0) {
    throw new Error('Year-end bonus must be a non-negative number')
  }
  return bonusTrapZones().find((zone) => bonus >= zone.from && bonus <= zone.to) ?? null
}

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number`)
}

function requireNonNegative(value: number, label: string): void {
  requireFinite(value, label)
  if (value < 0) throw new Error(`${label} must be a non-negative number`)
}

function requireRate(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`Invalid ${label} rate`)
}

/** 缴费基数按城市上下限封顶；城市未收录上下限时原样透传 */
export function clampToCityBounds(
  amount: number,
  min: number | undefined,
  max: number | undefined,
  label: string,
): { base: number; clamped: 'min' | 'max' | null } {
  requireNonNegative(amount, label)
  if (max !== undefined && amount > max) return { base: round2(max), clamped: 'max' }
  if (min !== undefined && amount < min) return { base: round2(min), clamped: 'min' }
  return { base: amount, clamped: null }
}

export function clampSocialBase(amount: number, city: CityPreset) {
  return clampToCityBounds(amount, city.socialBaseMin, city.socialBaseMax, 'Social insurance base')
}

export function clampFundBase(amount: number, city: CityPreset) {
  return clampToCityBounds(amount, city.fundBaseMin, city.fundBaseMax, 'Housing fund base')
}

/** 个人四项 + 单位五项 + 定额大病互助，全部可由 UI 覆盖（阶段性降费率城市每年不同） */
export type ContributionRates = {
  pension: number
  medical: number
  unemployment: number
  employerPension: number
  employerMedical: number
  employerUnemployment: number
  employerInjury: number
  employerMaternity: number
  /** 个人负担的定额大额/大病医疗互助，元/月 */
  extraMedicalMonthly: number
}

export function defaultRatesOfCity(city: CityPreset): ContributionRates {
  return {
    pension: DEFAULT_EMPLOYEE_RATES.pension,
    medical: DEFAULT_EMPLOYEE_RATES.medical,
    unemployment: DEFAULT_EMPLOYEE_RATES.unemployment,
    employerPension: DEFAULT_EMPLOYER_RATES.pension,
    employerMedical: city.employerMedicalRate ?? DEFAULT_EMPLOYER_RATES.medical,
    employerUnemployment: DEFAULT_EMPLOYER_RATES.unemployment,
    employerInjury: DEFAULT_EMPLOYER_RATES.injury,
    employerMaternity: DEFAULT_EMPLOYER_RATES.maternity,
    extraMedicalMonthly: city.extraMedicalMonthly ?? 0,
  }
}

export type EmployeeInsurance = {
  pension: number
  medical: number
  unemployment: number
  housing: number
  total: number
}

export type EmployerInsurance = EmployeeInsurance & {
  injury: number
  maternity: number
}

export type InsuranceResult = {
  socialBase: number
  fundBase: number
  socialClamped: 'min' | 'max' | null
  fundClamped: 'min' | 'max' | null
  employee: EmployeeInsurance
  employer: EmployerInsurance
  /**
   * 超出「本人月均工资 × 比例」的公积金缴存额，财税〔2006〕10 号要求并入当期工资薪金计税，
   * 已从可扣减额里剔除，但依然从实发工资中扣走。
   */
  housingExcess: number
}

function sumOf(items: Record<string, number>): number {
  return round2(Object.values(items).reduce((acc, value) => acc + value, 0))
}

function insuranceOf(
  socialBase: number,
  fundBase: number,
  grossMonthly: number,
  fundRate: number,
  rates: ContributionRates,
  socialClamped: 'min' | 'max' | null,
  fundClamped: 'min' | 'max' | null,
): InsuranceResult {
  const employeeParts = {
    pension: round2(socialBase * rates.pension),
    medical: round2(socialBase * rates.medical + rates.extraMedicalMonthly),
    unemployment: round2(socialBase * rates.unemployment),
    housing: round2(fundBase * fundRate),
  }
  const employerParts = {
    pension: round2(socialBase * rates.employerPension),
    medical: round2(socialBase * rates.employerMedical),
    unemployment: round2(socialBase * rates.employerUnemployment),
    injury: round2(socialBase * rates.employerInjury),
    maternity: round2(socialBase * rates.employerMaternity),
    housing: round2(fundBase * fundRate),
  }

  return {
    socialBase,
    fundBase,
    socialClamped,
    fundClamped,
    employee: { ...employeeParts, total: sumOf(employeeParts) },
    employer: { ...employerParts, total: sumOf(employerParts) },
    housingExcess: round2(
      employeeParts.housing - deductibleHousingOf(fundBase, grossMonthly, fundRate),
    ),
  }
}

/** 公积金可税前扣除的上限口径：基数不超过本人月均工资，比例由 UI 限制在 12% 以内 */
function deductibleHousingOf(fundBase: number, grossMonthly: number, fundRate: number): number {
  return round2(Math.min(fundBase, grossMonthly) * fundRate)
}

export type ContinuingEducation = 'none' | 'academic' | 'qualification'

export type SpecialDeductionInput = {
  /** 子女教育：在读子女数，每个 2000/月 */
  childEducationChildren: number
  /** 3 岁以下婴幼儿照护：每个 2000/月 */
  infantCareChildren: number
  continuingEducation: ContinuingEducation
  /** 住房贷款利息 1000/月，与住房租金互斥 */
  mortgageInterest: boolean
  /** 住房租金扣除档：0 不享受，或 800 / 1100 / 1500 */
  rentDeductTier: number
  /** 赡养老人：独生子女 3000/月，非独生各自不超过 1500 */
  elderSupportMonthly: number
  /** 大病医疗：年度自付金额，按年计算，不影响月度预扣 */
  seriousIllnessSelfPaid: number
}

export type OtherDeductions = {
  /** 个人养老金年度缴存额，限额 12000，按年均摊到月 */
  personalPensionAnnual: number
  /** 税优商业健康险，限额 2400/年 */
  taxPreferredInsuranceAnnual: number
}

export const EMPTY_SPECIAL_DEDUCTIONS: SpecialDeductionInput = {
  childEducationChildren: 0,
  infantCareChildren: 0,
  continuingEducation: 'none',
  mortgageInterest: false,
  rentDeductTier: 0,
  elderSupportMonthly: 0,
  seriousIllnessSelfPaid: 0,
}

export const EMPTY_OTHER_DEDUCTIONS: OtherDeductions = {
  personalPensionAnnual: 0,
  taxPreferredInsuranceAnnual: 0,
}

/** 月度专项附加扣除合计（大病医疗按年，不在此列） */
export function monthlySpecialDeduction(input: SpecialDeductionInput): number {
  const continued =
    input.continuingEducation === 'academic'
      ? SPECIAL_DEDUCTIONS.continuingEducationAcademicMonthly
      : input.continuingEducation === 'qualification'
        ? round2(SPECIAL_DEDUCTIONS.continuingEducationQualificationAnnual / 12)
        : 0
  return round2(
    input.childEducationChildren * SPECIAL_DEDUCTIONS.childEducationMonthlyPerChild +
      input.infantCareChildren * SPECIAL_DEDUCTIONS.infantCareMonthlyPerChild +
      continued +
      (input.mortgageInterest ? SPECIAL_DEDUCTIONS.mortgageInterestMonthly : 0) +
      input.rentDeductTier +
      input.elderSupportMonthly,
  )
}

/** 大病医疗：医保目录内自付超 15000 的部分可扣，年度限额 80000 */
export function seriousIllnessDeduction(selfPaid: number): number {
  const deductible = selfPaid - SPECIAL_DEDUCTIONS.seriousIllnessThresholdAnnual
  if (deductible <= 0) return 0
  return round2(Math.min(deductible, SPECIAL_DEDUCTIONS.seriousIllnessLimitAnnual))
}

/** 其他扣除按月均摊，超过年限额的部分按限额计 */
export function monthlyOtherDeduction(input: OtherDeductions): number {
  const pension = Math.min(
    Math.max(0, input.personalPensionAnnual),
    OTHER_DEDUCTION_LIMITS.personalPensionAnnual,
  )
  const insurance = Math.min(
    Math.max(0, input.taxPreferredInsuranceAnnual),
    OTHER_DEDUCTION_LIMITS.taxPreferredInsuranceAnnual,
  )
  return round2((pension + insurance) / 12)
}

export type BonusMode = 'auto' | 'separate' | 'merged'

export type CalcInput = {
  /** 税前月薪 */
  grossMonthly: number
  cityId: string
  /** 社保缴费基数，留空则按月薪并经城市上下限封顶 */
  socialBase?: number
  /** 公积金缴存基数，留空则跟随社保基数 */
  fundBase?: number
  /** 公积金个人缴存比例 */
  fundRate: number
  rates: ContributionRates
  /** 本年度在本单位的首个发薪月份，1–12 */
  startMonth: number
  /** 年度内首次取得工资薪金：累计减除费用按日历月份数计（国家税务总局公告 2020 年第 13 号） */
  firstSalaryInYear: boolean
  deductions: SpecialDeductionInput
  other: OtherDeductions
  bonusAmount: number
  bonusMode: BonusMode
  living: LivingCost
}

export type MonthlyRow = {
  month: number
  /** 累计应纳税所得额，可为负（扣除项超过收入） */
  cumulativeTaxable: number
  rate: number
  /** 当月预扣个税 */
  tax: number
  insurance: number
  takeHome: number
}

export type YearSummary = {
  /** 在职月份数，年中入职时小于 12 */
  monthsWorked: number
  annualSalary: number
  annualGross: number
  annualInsuranceEmployee: number
  /** 个人 + 单位公积金合计，全年进入个人账户 */
  annualHousingFundDeposit: number
  /** 工资部分全年累计预扣 */
  annualSalaryTaxPrepaid: number
  /** 计入大病医疗等年度扣除后的工资部分年度应纳 */
  annualSalaryTaxPayable: number
  /** 预扣 − 应纳，汇算清缴预计可退 */
  settlementRefund: number
  bonusMode: 'separate' | 'merged'
  bonusTax: number
  /** 未被采用的那一种法定算法下的奖金税额 */
  bonusTaxOther: number
  annualTaxTotal: number
  /** 全年到手现金（工资 + 税后奖金） */
  annualNetCash: number
  /** 以下两项为 0–1 原始比值，由 UI 格式化为百分比 */
  effectiveTaxRate: number
  takeHomeRate: number
}

export type CalcResult = {
  insurance: InsuranceResult
  months: MonthlyRow[]
  year: YearSummary
  livingTotal: number
  /** 工资口径的月均到手，奖金不计入，便于与「期望每月到手」对照 */
  monthlyTakeHomeAverage: number
  monthlyTakeHomeFirst: number
  monthlyTakeHomeLast: number
  monthlyDisposable: number
  annualSaving: number
  savingRate: number
}

function validate(input: CalcInput): void {
  requireNonNegative(input.grossMonthly, 'Pre-tax monthly salary')
  requireNonNegative(input.bonusAmount, 'Year-end bonus')
  if (!Number.isInteger(input.startMonth) || input.startMonth < 1 || input.startMonth > 12) {
    throw new Error('Start month must be an integer between 1 and 12')
  }
  // 法定区间 5%–12% 由 UI 的滑块约束；这里放行 0，确有单位不缴公积金
  requireRate(input.fundRate, 'housing fund')
  const allowedRentTiers: readonly number[] = RENT_DEDUCT_CHOICES
  if (!allowedRentTiers.includes(input.deductions.rentDeductTier)) {
    throw new Error('Invalid rent deduction tier')
  }
  const {
    childEducationChildren,
    elderSupportMonthly,
    infantCareChildren,
    seriousIllnessSelfPaid,
  } = input.deductions
  requireNonNegative(elderSupportMonthly, 'Elder support deduction')
  requireNonNegative(childEducationChildren, 'Child count')
  requireNonNegative(infantCareChildren, 'Infant count')
  requireNonNegative(seriousIllnessSelfPaid, 'Serious illness self payment')
  if (elderSupportMonthly > SPECIAL_DEDUCTIONS.elderSupportOnlyChildMonthly) {
    throw new Error('Elder support deduction exceeds the monthly cap')
  }
  if (input.deductions.mortgageInterest && input.deductions.rentDeductTier > 0) {
    throw new Error('Mortgage interest and rent cannot both be deducted')
  }
  requireNonNegative(input.other.personalPensionAnnual, 'Personal pension')
  requireNonNegative(input.other.taxPreferredInsuranceAnnual, 'Tax-preferred health insurance')
  for (const [key, value] of Object.entries(input.rates)) {
    if (key === 'extraMedicalMonthly') requireNonNegative(value, 'Extra medical fee')
    else requireRate(value, key)
  }
  for (const [key, value] of Object.entries(input.living)) {
    requireNonNegative(value, `Living cost ${key}`)
  }
}

/** 正算：给定税前月薪，产出逐月累计预扣明细与年度汇总 */
export function computeSalary(input: CalcInput): CalcResult {
  validate(input)
  const city = cityPresetOf(input.cityId)
  const social = clampSocialBase(input.socialBase ?? input.grossMonthly, city)
  // 公积金基数口径是「本人上年度月均工资」，上限与社保不同源，默认跟月薪而非封顶后的社保基数
  const fund = clampFundBase(input.fundBase ?? input.grossMonthly, city)
  const insurance = insuranceOf(
    social.base,
    fund.base,
    input.grossMonthly,
    input.fundRate,
    input.rates,
    social.clamped,
    fund.clamped,
  )
  const insuranceDeductible = round2(insurance.employee.total - insurance.housingExcess)

  const specialMonthly = monthlySpecialDeduction(input.deductions)
  const otherMonthly = monthlyOtherDeduction(input.other)
  const monthlyNetDelta = round2(
    input.grossMonthly -
      insuranceDeductible -
      BASIC_DEDUCTION_MONTHLY -
      specialMonthly -
      otherMonthly,
  )

  const months: MonthlyRow[] = []
  let previousCumulativeTax = 0
  let cumulativeTaxable = 0
  for (let month = input.startMonth; month <= 12; month += 1) {
    const worked = month - input.startMonth + 1
    // 年中首次取得工资薪金时，累计减除费用按日历月份数而非在职月份数（2020 年第 13 号）
    const deductionMonths = input.firstSalaryInYear ? month : worked
    cumulativeTaxable = round2(
      monthlyNetDelta * worked - BASIC_DEDUCTION_MONTHLY * (deductionMonths - worked),
    )
    const slice = taxForCumulative(cumulativeTaxable)
    const tax = round2(slice.tax - previousCumulativeTax)
    previousCumulativeTax = slice.tax
    months.push({
      month,
      cumulativeTaxable,
      rate: slice.rate,
      tax,
      insurance: insurance.employee.total,
      takeHome: round2(input.grossMonthly - insurance.employee.total - tax),
    })
  }

  const monthsWorked = months.length
  const illness = seriousIllnessDeduction(input.deductions.seriousIllnessSelfPaid)
  const payableBase = Math.max(0, round2(cumulativeTaxable - illness))
  const salaryPayable = taxForCumulative(payableBase).tax
  const separateTotal = round2(salaryPayable + bonusTaxSeparate(input.bonusAmount))
  const mergedTotal = round2(taxForCumulative(payableBase + input.bonusAmount).tax)
  const bonusMode: 'separate' | 'merged' =
    input.bonusMode === 'separate' || (input.bonusMode === 'auto' && separateTotal <= mergedTotal)
      ? 'separate'
      : 'merged'
  const bonusTax =
    bonusMode === 'separate'
      ? bonusTaxSeparate(input.bonusAmount)
      : round2(mergedTotal - salaryPayable)
  /** 未被采用的那一种法定算法下的奖金税额，供 UI 说明「换个方式会多缴/少缴多少」 */
  const bonusTaxOther =
    bonusMode === 'separate'
      ? round2(mergedTotal - salaryPayable)
      : bonusTaxSeparate(input.bonusAmount)

  const annualSalary = round2(input.grossMonthly * monthsWorked)
  const annualInsurance = round2(insurance.employee.total * monthsWorked)
  const annualSalaryTaxPrepaid = round2(previousCumulativeTax)
  const annualTaxTotal = round2(salaryPayable + bonusTax)
  const annualGross = round2(annualSalary + input.bonusAmount)
  const annualNetCash = round2(annualSalary + input.bonusAmount - annualInsurance - annualTaxTotal)
  const livingTotal = round2(
    input.living.rent + input.living.commute + input.living.food + input.living.misc,
  )
  const monthlyTakeHomeAverage = round2(
    (annualSalary - annualInsurance - annualSalaryTaxPrepaid) / monthsWorked,
  )
  const annualSaving = round2(annualNetCash - livingTotal * monthsWorked)

  return {
    insurance,
    months,
    year: {
      monthsWorked,
      annualSalary,
      annualGross,
      annualInsuranceEmployee: annualInsurance,
      annualHousingFundDeposit: round2(
        (insurance.employee.housing + insurance.employer.housing) * monthsWorked,
      ),
      annualSalaryTaxPrepaid,
      annualSalaryTaxPayable: salaryPayable,
      settlementRefund: round2(annualSalaryTaxPrepaid - salaryPayable),
      bonusMode,
      bonusTax,
      bonusTaxOther,
      annualTaxTotal,
      annualNetCash,
      effectiveTaxRate: annualGross > 0 ? annualTaxTotal / annualGross : 0,
      takeHomeRate: annualGross > 0 ? annualNetCash / annualGross : 0,
    },
    livingTotal,
    monthlyTakeHomeAverage,
    monthlyTakeHomeFirst: months[0].takeHome,
    monthlyTakeHomeLast: months[months.length - 1].takeHome,
    monthlyDisposable: round2(monthlyTakeHomeAverage - livingTotal),
    annualSaving,
    savingRate: annualNetCash > 0 ? annualSaving / annualNetCash : 0,
  }
}

const SOLVE_CEILING = 3000000
const SOLVE_STEPS = 60

/**
 * 反算：给出期望的每月到手，二分求出需要谈的税前月薪。
 * 到手关于税前单调递增的前提要求年终奖方式固定，故 `auto` 会分别按两种法定方式各求一次，取需要税前更低的那个。
 */
export function solveGrossForTargetTakeHome(
  targetNetMonthly: number,
  input: Omit<CalcInput, 'grossMonthly'>,
): { grossMonthly: number; bonusMode: 'separate' | 'merged' } {
  requireNonNegative(targetNetMonthly, 'Target monthly take-home pay')
  const modes: readonly ('separate' | 'merged')[] =
    input.bonusMode === 'auto' ? ['separate', 'merged'] : [input.bonusMode]

  let best: { grossMonthly: number; bonusMode: 'separate' | 'merged' } | null = null
  for (const mode of modes) {
    const netAt = (gross: number) =>
      computeSalary({ ...input, grossMonthly: gross, bonusMode: mode }).monthlyTakeHomeAverage
    if (netAt(SOLVE_CEILING) < targetNetMonthly) {
      if (modes.length === 1) throw new Error('Target take-home pay exceeds the searchable range')
      continue
    }
    let low = 0
    let high = SOLVE_CEILING
    for (let step = 0; step < SOLVE_STEPS; step += 1) {
      const middle = (low + high) / 2
      if (netAt(middle) < targetNetMonthly) low = middle
      else high = middle
    }
    // 向上取整到分：反算的语义是「至少到手这么多」，不能因为四舍五入给出刚好不够的税前
    const grossMonthly = Math.ceil(high * 100) / 100
    if (best === null || grossMonthly < best.grossMonthly) best = { grossMonthly, bonusMode: mode }
  }
  if (best === null) throw new Error('Target take-home pay exceeds the searchable range')
  return best
}
