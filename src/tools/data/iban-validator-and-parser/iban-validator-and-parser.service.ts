import { electronicFormatIBAN, extractIBAN, friendlyFormatIBAN, validateIBAN } from 'ibantools'

export interface IbanParseResult {
  valid: boolean
  countryCode: string | null
  checkDigits: string | null
  bban: string | null
  /** 每 4 位分组的友好格式，如 'DE89 3704 0044 0532 0130 00' */
  formatted: string | null
}

const INVALID_RESULT: IbanParseResult = {
  valid: false,
  countryCode: null,
  checkDigits: null,
  bban: null,
  formatted: null,
}

/** IBAN 形状：2 位字母国家码 + 2 位数字校验位 + 至少 5 位 BBAN（字母数字） */
const IBAN_SHAPE = /^[A-Z]{2}\d{2}[A-Z0-9]{5,30}$/

/** 解析并校验 IBAN。空输入或形状不合法时返回全空结果；校验位错误时 valid=false 但保留拆解字段。 */
export function parseIban(input: string): IbanParseResult {
  const normalized = electronicFormatIBAN(input) ?? ''
  if (!IBAN_SHAPE.test(normalized)) {
    return INVALID_RESULT
  }

  const extracted = extractIBAN(normalized)
  const validation = validateIBAN(normalized)

  return {
    valid: validation.valid,
    countryCode: normalized.slice(0, 2),
    checkDigits: normalized.slice(2, 4),
    // 国家 BBAN 结构校验失败时 extractIBAN 不产出 bban（undefined），按固定位置切分兜底
    bban: extracted.bban || normalized.slice(4),
    formatted: friendlyFormatIBAN(normalized) ?? null,
  }
}
