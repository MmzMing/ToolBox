/**
 * 表单状态模型：所有数值输入存字符串（空串表示「跟随城市默认」），
 * 与 CalcInput 的转换是纯函数，便于单测与「复制链接」的参数编解码。
 */

import {
  DEFAULT_CITY_ID,
  cityPresetOf,
  fundDefaultsOfCity,
  livingCostDefaultsOf,
  type RentDeductTier,
} from './salary-data'
import {
  defaultRatesOfCity,
  type BonusMode,
  type CalcInput,
  type ContinuingEducation,
  type ContributionRates,
} from './salary-calculator.service'

export type FormMode = 'forward' | 'reverse'

/** 租金档选择：auto = 按所选城市的档位 */
export type RentTierChoice = 'auto' | '0' | '800' | '1100' | '1500'

export type FormState = {
  mode: FormMode
  cityId: string
  grossMonthly: string
  targetNet: string
  socialBase: string
  fundBase: string
  /** 百分数，如 12 表示 12%；空串跟随城市 */
  fundRate: string
  startMonth: string
  firstSalaryInYear: boolean
  deductions: {
    childEducationChildren: string
    infantCareChildren: string
    continuingEducation: ContinuingEducation
    mortgageInterest: boolean
    rentTier: RentTierChoice
    elderSupportMonthly: string
    seriousIllnessSelfPaid: string
  }
  other: {
    personalPensionAnnual: string
    taxPreferredInsuranceAnnual: string
  }
  bonus: { amount: string; mode: BonusMode }
  living: { rent: string; commute: string; food: string; misc: string }
  rates: Record<keyof ContributionRates, string>
}

const EMPTY_RATES: Record<keyof ContributionRates, string> = {
  pension: '',
  medical: '',
  unemployment: '',
  employerPension: '',
  employerMedical: '',
  employerUnemployment: '',
  employerInjury: '',
  employerMaternity: '',
  extraMedicalMonthly: '',
}

export function initialForm(cityId: string = DEFAULT_CITY_ID): FormState {
  return {
    mode: 'forward',
    cityId,
    grossMonthly: '20000',
    targetNet: '15000',
    socialBase: '',
    fundBase: '',
    fundRate: '',
    startMonth: '1',
    firstSalaryInYear: false,
    deductions: {
      childEducationChildren: '0',
      infantCareChildren: '0',
      continuingEducation: 'none',
      mortgageInterest: false,
      // 默认不享受：城市档位只是可选项，不能让扣除在没有用户意图的情况下自动生效
      rentTier: '0',
      elderSupportMonthly: '0',
      seriousIllnessSelfPaid: '0',
    },
    other: { personalPensionAnnual: '0', taxPreferredInsuranceAnnual: '0' },
    bonus: { amount: '0', mode: 'auto' },
    living: { rent: '', commute: '', food: '', misc: '' },
    rates: EMPTY_RATES,
  }
}

function numOr(raw: string, fallback: number): number {
  if (raw.trim() === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

function optionalNum(raw: string): number | undefined {
  return raw.trim() === '' ? undefined : Number(raw)
}

/** 把「空串跟随城市」的规则解成一份完整的 CalcInput；不做校验，校验在 computeSalary 里 */
export function buildInput(form: FormState): CalcInput {
  const city = cityPresetOf(form.cityId)
  const fundDefaults = fundDefaultsOfCity(city)
  const rateDefaults = defaultRatesOfCity(city)
  const livingDefaults = livingCostDefaultsOf(form.cityId)
  const percent = (raw: string, fallback: number) => numOr(raw, fallback * 100) / 100
  const rentTier =
    form.deductions.rentTier === 'auto'
      ? (city.rentDeductTier ?? 0)
      : Number(form.deductions.rentTier)

  return {
    grossMonthly: numOr(form.grossMonthly, 0),
    cityId: form.cityId,
    socialBase: optionalNum(form.socialBase),
    fundBase: optionalNum(form.fundBase),
    fundRate: percent(form.fundRate, fundDefaults.rate),
    rates: {
      pension: percent(form.rates.pension, rateDefaults.pension),
      medical: percent(form.rates.medical, rateDefaults.medical),
      unemployment: percent(form.rates.unemployment, rateDefaults.unemployment),
      employerPension: percent(form.rates.employerPension, rateDefaults.employerPension),
      employerMedical: percent(form.rates.employerMedical, rateDefaults.employerMedical),
      employerUnemployment: percent(
        form.rates.employerUnemployment,
        rateDefaults.employerUnemployment,
      ),
      employerInjury: percent(form.rates.employerInjury, rateDefaults.employerInjury),
      employerMaternity: percent(form.rates.employerMaternity, rateDefaults.employerMaternity),
      extraMedicalMonthly: numOr(form.rates.extraMedicalMonthly, rateDefaults.extraMedicalMonthly),
    },
    startMonth: Math.round(numOr(form.startMonth, 1)),
    firstSalaryInYear: form.firstSalaryInYear,
    deductions: {
      childEducationChildren: numOr(form.deductions.childEducationChildren, 0),
      infantCareChildren: numOr(form.deductions.infantCareChildren, 0),
      continuingEducation: form.deductions.continuingEducation,
      mortgageInterest: form.deductions.mortgageInterest,
      rentDeductTier: form.deductions.mortgageInterest ? 0 : rentTier,
      elderSupportMonthly: numOr(form.deductions.elderSupportMonthly, 0),
      seriousIllnessSelfPaid: numOr(form.deductions.seriousIllnessSelfPaid, 0),
    },
    other: {
      personalPensionAnnual: numOr(form.other.personalPensionAnnual, 0),
      taxPreferredInsuranceAnnual: numOr(form.other.taxPreferredInsuranceAnnual, 0),
    },
    bonusAmount: numOr(form.bonus.amount, 0),
    bonusMode: form.bonus.mode,
    living: {
      rent: numOr(form.living.rent, livingDefaults.rent),
      commute: numOr(form.living.commute, livingDefaults.commute),
      food: numOr(form.living.food, livingDefaults.food),
      misc: numOr(form.living.misc, livingDefaults.misc),
    },
  }
}

export function formatMoney(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
}

export function formatPercent(ratio: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1, style: 'percent' }).format(ratio)
}

/** 城市档位给 UI 做提示文案用 */
export function cityRentTierOf(cityId: string): RentDeductTier | null {
  return cityPresetOf(cityId).rentDeductTier ?? null
}

/** 输入面板的统一 props：t 由各面板自己 useTranslation，避免层层传递 */
export type PanelProps = {
  form: FormState
  patch: (next: Partial<FormState>) => void
  input: CalcInput
}
