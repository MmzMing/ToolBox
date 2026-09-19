/** 各项比例（占缴费基数的比例）。默认值参考多数城市的常见区间，可在 UI 调整 */

export interface InsuranceRates {
  /** 养老保险 */
  pension: number
  /** 医疗保险 */
  medical: number
  /** 失业保险 */
  unemployment: number
  /** 工伤保险（个人通常不缴） */
  injury: number
  /** 生育保险（个人通常不缴） */
  maternity: number
  /** 住房公积金 */
  housing: number
}

export const defaultEmployeeRates: InsuranceRates = {
  pension: 0.08,
  medical: 0.02,
  unemployment: 0.005,
  injury: 0,
  maternity: 0,
  housing: 0.12,
}

export const defaultEmployerRates: InsuranceRates = {
  pension: 0.16,
  medical: 0.09,
  unemployment: 0.005,
  injury: 0.004,
  maternity: 0.008,
  housing: 0.12,
}

export interface InsuranceBreakdown {
  pension: number
  medical: number
  unemployment: number
  injury: number
  maternity: number
  housing: number
  total: number
}

export interface InsuranceResult {
  base: number
  employee: InsuranceBreakdown
  employer: InsuranceBreakdown
  /** 税前到手（未计个税）= 基数 - 个人合计 */
  takeHome: number
  /** 公司用工成本 = 基数 + 公司合计 */
  employerCost: number
}

const RATE_FIELDS = [
  'pension',
  'medical',
  'unemployment',
  'injury',
  'maternity',
  'housing',
] as const

function computeSide(base: number, rates: InsuranceRates): InsuranceBreakdown {
  const round2 = (n: number) => Math.round(n * 100) / 100
  const pension = round2(base * rates.pension)
  const medical = round2(base * rates.medical)
  const unemployment = round2(base * rates.unemployment)
  const injury = round2(base * rates.injury)
  const maternity = round2(base * rates.maternity)
  const housing = round2(base * rates.housing)
  return {
    pension,
    medical,
    unemployment,
    injury,
    maternity,
    housing,
    total: round2(pension + medical + unemployment + injury + maternity + housing),
  }
}

/** 计算五险一金：基数为月缴费基数，比例可通过 UI 调整 */
export function computeInsurance(
  base: number,
  employeeRates: InsuranceRates = defaultEmployeeRates,
  employerRates: InsuranceRates = defaultEmployerRates,
): InsuranceResult {
  if (!Number.isFinite(base) || base < 0) {
    throw new Error('Base must be a non-negative number')
  }
  for (const rates of [employeeRates, employerRates]) {
    for (const field of RATE_FIELDS) {
      const rate = rates[field]
      if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
        throw new Error(`Invalid rate for ${field}: ${rate}`)
      }
    }
  }
  const employee = computeSide(base, employeeRates)
  const employer = computeSide(base, employerRates)
  return {
    base,
    employee,
    employer,
    takeHome: Math.round((base - employee.total) * 100) / 100,
    employerCost: Math.round((base + employer.total) * 100) / 100,
  }
}
