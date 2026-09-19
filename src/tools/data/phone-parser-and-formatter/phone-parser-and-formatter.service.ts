import { parsePhoneNumberWithError, type CountryCode } from 'libphonenumber-js'

export const phoneCountries = ['CN', 'US', 'GB', 'JP', 'DE', 'FR', 'BR', 'IN'] as const

export type PhoneCountry = (typeof phoneCountries)[number]

export interface ParsedPhone {
  valid: boolean
  e164: string | null
  international: string | null
  national: string | null
  countryCode: number | null
  type: string | null
  /** 解析失败原因（libphonenumber 错误码，如 NOT_A_NUMBER），UI 负责翻译 */
  error: string | null
}

const IDLE_RESULT: ParsedPhone = {
  valid: false,
  e164: null,
  international: null,
  national: null,
  countryCode: null,
  type: null,
  error: null,
}

/**
 * 解析电话号码（以 country 作为默认国家/地区）。
 * 解析成功时返回格式化结果与有效性；输入为空返回全空结果；
 * 解析失败（非号码、国家不匹配、长度异常等）时 valid=false 并携带错误码。
 */
export function parsePhone(raw: string, country: PhoneCountry): ParsedPhone {
  if (raw.trim() === '') {
    return IDLE_RESULT
  }

  try {
    const phoneNumber = parsePhoneNumberWithError(raw, country as CountryCode)
    return {
      valid: phoneNumber.isValid(),
      e164: phoneNumber.number,
      international: phoneNumber.formatInternational(),
      national: phoneNumber.formatNational(),
      countryCode: Number(phoneNumber.countryCallingCode),
      type: phoneNumber.getType() ?? null,
      error: null,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : null
    return { ...IDLE_RESULT, error }
  }
}
