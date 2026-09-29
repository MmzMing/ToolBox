/** 到手工资计算器的常量表：全国统一口径来自现行法规，城市差异项按「有可靠来源才写」收录。 */

/** 综合所得年度累计应纳税所得额级距。累计预扣与年度汇算共用这一张表，不是月度表。 */
export const TAX_BRACKETS = [
  { upTo: 36000, rate: 0.03, quickDeduction: 0 },
  { upTo: 144000, rate: 0.1, quickDeduction: 2520 },
  { upTo: 300000, rate: 0.2, quickDeduction: 16920 },
  { upTo: 420000, rate: 0.25, quickDeduction: 31920 },
  { upTo: 660000, rate: 0.3, quickDeduction: 52920 },
  { upTo: 960000, rate: 0.35, quickDeduction: 85920 },
  { upTo: Infinity, rate: 0.45, quickDeduction: 181920 },
] as const

/** 月度对照表由年度表除以 12 推导，年终奖单独计税按它找税率；不另抄一份常量以防两处漂移。 */
export const MONTHLY_TAX_BRACKETS = TAX_BRACKETS.map((bracket) => ({
  upTo: bracket.upTo / 12,
  rate: bracket.rate,
  quickDeduction: bracket.quickDeduction / 12,
}))

/** 基本减除费用（起征点），按月。国家税务总局公告 2018 年第 61 号 */
export const BASIC_DEDUCTION_MONTHLY = 5000

/** 全年一次性奖金单独计税政策有效期截止日（财政部 税务总局公告 2023 年第 30 号） */
export const BONUS_SEPARATE_TAX_EXPIRY = '2027-12-31'

/** 专项附加扣除标准（国发〔2018〕41 号设定，国发〔2023〕13 号提标后的现行值） */
export const SPECIAL_DEDUCTIONS = {
  childEducationMonthlyPerChild: 2000,
  infantCareMonthlyPerChild: 2000,
  /** 学历（学位）继续教育未被 2023 年提标覆盖，仍是 400/月，最长 48 个月 */
  continuingEducationAcademicMonthly: 400,
  continuingEducationAcademicMaxMonths: 48,
  continuingEducationQualificationAnnual: 3600,
  mortgageInterestMonthly: 1000,
  elderSupportOnlyChildMonthly: 3000,
  elderSupportMaxSharePerSiblingMonthly: 1500,
  seriousIllnessThresholdAnnual: 15000,
  seriousIllnessLimitAnnual: 80000,
} as const

/**
 * 住房租金扣除档位（国发〔2018〕41 号第 17 条）。
 * 直辖市、省会、计划单列市及国务院确定的其他城市 1500；其余城市按市辖区户籍人口分 1100（超过 100 万）与 800。
 * 分档依据是城市身份与户籍人口，与 GDP、房价无关。
 */
export type RentDeductTier = 1500 | 1100 | 800

/** 租金扣除档位的 UI 可选值，0 表示不享受该项扣除 */
export const RENT_DEDUCT_CHOICES = [0, 800, 1100, 1500] as const

/**
 * 其他扣除项年限额：个人养老金按年缴存额据实扣除（上限 12000），
 * 税优商业健康险 2400/年。两者都按年均摊到月参与累计预扣。
 */
export const OTHER_DEDUCTION_LIMITS = {
  personalPensionAnnual: 12000,
  taxPreferredInsuranceAnnual: 2400,
} as const

/** 个人缴费比例基准值（养老 8% 全国统一；医疗 2% 全国统一；失业阶段性降费，城市与年度有差异） */
export const DEFAULT_EMPLOYEE_RATES = {
  pension: 0.08,
  medical: 0.02,
  unemployment: 0.005,
} as const

/** 单位缴费比例基准值（医疗 6%–10.5%、工伤 0.16%–1.9% 均为城市与行业差异，可在 UI 覆盖） */
export const DEFAULT_EMPLOYER_RATES = {
  pension: 0.16,
  medical: 0.09,
  unemployment: 0.005,
  injury: 0.004,
  maternity: 0.008,
} as const

/**
 * 住房公积金个人缴存比例区间。2026-08 国务院修改《住房公积金管理条例》后下限为 5%，
 * 上限表述改为「不得高于国家规定的最高缴存比例」，实务仍执行 12%；上海基本公积金上限为 7%。
 */
export const FUND_RATE_RANGE = { min: 0.05, max: 0.12, fallback: 0.12 } as const

export type LivingCostTier = 'tier1' | 'newTier1' | 'tier2' | 'other'

export type LivingCost = {
  /** 房租 */
  rent: number
  /** 通勤 */
  commute: number
  /** 餐饮 */
  food: number
  /** 其他固定支出 */
  misc: number
}

/**
 * 生活成本月度默认值，按城市能级分档。取「单身、合租或郊区整租」口径，落在 2025 年统计局城镇居民
 * 人均消费支出与 2026 年 50 城租金指数的交叉区间内；全部字段可覆盖，UI 标注「估算参考」。
 */
export const LIVING_COST_TIERS: Record<LivingCostTier, LivingCost> = {
  tier1: { rent: 2500, commute: 300, food: 1500, misc: 500 },
  newTier1: { rent: 1600, commute: 250, food: 1200, misc: 450 },
  tier2: { rent: 1100, commute: 200, food: 1000, misc: 400 },
  other: { rent: 800, commute: 180, food: 900, misc: 350 },
}

export type CityPreset = {
  /** 城市标识，同时是 i18n 键 tools-resume:salary-calculator.cities.<id> */
  id: string
  /** 生活成本能级 */
  livingCostTier: LivingCostTier
  /** 住房租金专项附加扣除档；未核实的城市留空 */
  rentDeductTier?: RentDeductTier
  /** 社保缴费基数下限（全省全口径社平工资 60%） */
  socialBaseMin?: number
  /** 社保缴费基数上限（全省全口径社平工资 300%） */
  socialBaseMax?: number
  /** 基数生效起始月；沿用旧年度标准时标注旧年度 */
  socialBasePeriod?: string
  /** 公积金缴存基数下限（多为当地月最低工资） */
  fundBaseMin?: number
  /** 公积金缴存基数上限（当地上年职工月均工资 3 倍，与社保上限不同源） */
  fundBaseMax?: number
  /** 公积金个人缴存比例默认值 */
  fundRateDefault?: number
  /** 公积金个人缴存比例上限（上海基本公积金 7%） */
  fundRateMax?: number
  /** 个人负担的定额大额/大病医疗互助，元/月 */
  extraMedicalMonthly?: number
  /** 单位医疗费率，城市差异明显；未核实留空取基准值 */
  employerMedicalRate?: number
}

/** 18 城 + 「其他城市」兜底。数值为 2026-09 检索到的现行标准，随年度调基更新。 */
export const CITY_PRESETS = [
  {
    id: 'beijing',
    livingCostTier: 'tier1',
    rentDeductTier: 1500,
    socialBaseMin: 7270,
    socialBaseMax: 36348,
    socialBasePeriod: '2026-07',
    fundBaseMin: 2540,
    fundBaseMax: 36348,
    fundRateDefault: 0.12,
    extraMedicalMonthly: 3,
    employerMedicalRate: 0.098,
  },
  {
    id: 'shanghai',
    livingCostTier: 'tier1',
    rentDeductTier: 1500,
    socialBaseMin: 7546,
    socialBaseMax: 37731,
    socialBasePeriod: '2026-07',
    fundBaseMin: 2740,
    fundBaseMax: 37302,
    fundRateDefault: 0.07,
    fundRateMax: 0.07,
    employerMedicalRate: 0.09,
  },
  {
    id: 'guangzhou',
    livingCostTier: 'tier1',
    rentDeductTier: 1500,
    socialBaseMin: 5510,
    socialBaseMax: 27549,
    socialBasePeriod: '2025-07',
    fundBaseMin: 2680,
    fundBaseMax: 41697,
    fundRateDefault: 0.12,
    employerMedicalRate: 0.06,
  },
  {
    id: 'shenzhen',
    livingCostTier: 'tier1',
    rentDeductTier: 1500,
    socialBaseMin: 4775,
    socialBaseMax: 27549,
    socialBasePeriod: '2025-07',
    fundBaseMin: 2700,
    fundBaseMax: 48471,
    fundRateDefault: 0.12,
    employerMedicalRate: 0.06,
  },
  {
    id: 'hangzhou',
    livingCostTier: 'newTier1',
    rentDeductTier: 1500,
    socialBaseMin: 4986,
    socialBaseMax: 25299,
    socialBasePeriod: '2025-01',
    fundBaseMin: 2660,
    fundBaseMax: 42151,
    fundRateDefault: 0.12,
    employerMedicalRate: 0.095,
  },
  {
    id: 'nanjing',
    livingCostTier: 'newTier1',
    rentDeductTier: 1500,
    socialBaseMin: 4952,
    socialBaseMax: 24762,
    socialBasePeriod: '2025-07',
    fundBaseMin: 2660,
    fundBaseMax: 42400,
    fundRateDefault: 0.12,
    extraMedicalMonthly: 10,
    employerMedicalRate: 0.07,
  },
  {
    id: 'suzhou',
    livingCostTier: 'newTier1',
    rentDeductTier: 1100,
    socialBaseMin: 4952,
    socialBaseMax: 24762,
    socialBasePeriod: '2025-07',
    fundBaseMin: 4952,
    fundBaseMax: 40600,
    fundRateDefault: 0.12,
    employerMedicalRate: 0.07,
  },
  {
    id: 'chengdu',
    livingCostTier: 'newTier1',
    rentDeductTier: 1500,
    socialBaseMin: 4699,
    socialBaseMax: 23493,
    socialBasePeriod: '2026-10',
    fundBaseMin: 2330,
    fundBaseMax: 32969,
    fundRateDefault: 0.12,
    employerMedicalRate: 0.075,
  },
  {
    id: 'wuhan',
    livingCostTier: 'newTier1',
    rentDeductTier: 1500,
    socialBaseMin: 4498,
    socialBaseMax: 22488,
    socialBasePeriod: '2025-01',
    fundBaseMin: 2210,
    fundBaseMax: 34560.25,
    fundRateDefault: 0.12,
    extraMedicalMonthly: 7,
    employerMedicalRate: 0.08,
  },
  {
    id: 'xian',
    livingCostTier: 'newTier1',
    rentDeductTier: 1500,
    socialBaseMin: 4737,
    socialBaseMax: 23685,
    socialBasePeriod: '2026-01',
    fundBaseMin: 2376,
    fundBaseMax: 32726,
    fundRateDefault: 0.12,
    employerMedicalRate: 0.06,
  },
  {
    id: 'tianjin',
    livingCostTier: 'newTier1',
    rentDeductTier: 1500,
    socialBaseMin: 5180,
    socialBaseMax: 25902,
    socialBasePeriod: '2026-09',
    fundBaseMin: 2510,
    fundBaseMax: 28917,
    fundRateDefault: 0.12,
    employerMedicalRate: 0.105,
  },
  {
    id: 'chongqing',
    livingCostTier: 'newTier1',
    rentDeductTier: 1500,
    socialBaseMin: 4553,
    socialBaseMax: 22765,
    socialBasePeriod: '2026-01',
    fundBaseMin: 2330,
    fundBaseMax: 30318,
    fundRateDefault: 0.12,
    extraMedicalMonthly: 5,
    employerMedicalRate: 0.095,
  },
  {
    id: 'changsha',
    livingCostTier: 'newTier1',
    rentDeductTier: 1500,
    socialBaseMin: 4106,
    socialBaseMax: 20529,
    socialBasePeriod: '2026-01',
    fundBaseMin: 2200,
    fundBaseMax: 32744,
    fundRateDefault: 0.12,
  },
  {
    id: 'zhengzhou',
    livingCostTier: 'newTier1',
    rentDeductTier: 1500,
    socialBaseMin: 3831,
    socialBaseMax: 19155,
    socialBasePeriod: '2025-07',
    fundBaseMin: 2350,
    fundBaseMax: 28849,
    fundRateDefault: 0.12,
    employerMedicalRate: 0.07,
  },
  {
    id: 'qingdao',
    livingCostTier: 'newTier1',
    rentDeductTier: 1500,
    socialBaseMin: 4573,
    socialBaseMax: 22863,
    socialBasePeriod: '2026-08',
    fundBaseMin: 2400,
    fundBaseMax: 34342.75,
    fundRateDefault: 0.12,
    employerMedicalRate: 0.08,
  },
  {
    id: 'dongguan',
    livingCostTier: 'tier2',
    rentDeductTier: 1100,
    socialBaseMin: 4775,
    socialBaseMax: 27549,
    socialBasePeriod: '2025-07',
    fundBaseMin: 2300,
    fundBaseMax: 27391,
    fundRateDefault: 0.12,
  },
  {
    id: 'foshan',
    livingCostTier: 'tier2',
    rentDeductTier: 1100,
    socialBaseMin: 4775,
    socialBaseMax: 27549,
    socialBasePeriod: '2025-07',
    fundBaseMin: 2300,
    fundBaseMax: 28959,
    fundRateDefault: 0.12,
  },
  {
    id: 'hefei',
    livingCostTier: 'newTier1',
    rentDeductTier: 1500,
    socialBaseMin: 4354,
    socialBaseMax: 21772,
    socialBasePeriod: '2026-01',
    fundBaseMin: 2320,
    fundBaseMax: 31564,
    fundRateDefault: 0.12,
    employerMedicalRate: 0.064,
  },
  { id: 'other', livingCostTier: 'other' },
] as const satisfies readonly CityPreset[]

export type CityId = (typeof CITY_PRESETS)[number]['id']

export const DEFAULT_CITY_ID: CityId = 'beijing'

/** 按 id 取城市预设；id 来自 Select 值，兜底到「其他城市」避免渲染期崩。 */
export function cityPresetOf(id: string): CityPreset {
  return CITY_PRESETS.find((city) => city.id === id) ?? CITY_PRESETS[CITY_PRESETS.length - 1]
}

/** 生活成本默认值取该城市能级那一档 */
export function livingCostDefaultsOf(id: string): LivingCost {
  return LIVING_COST_TIERS[cityPresetOf(id).livingCostTier]
}

export function fundDefaultsOfCity(city: CityPreset): { rate: number; rateMax: number } {
  return {
    rate: city.fundRateDefault ?? FUND_RATE_RANGE.fallback,
    rateMax: city.fundRateMax ?? FUND_RATE_RANGE.max,
  }
}
