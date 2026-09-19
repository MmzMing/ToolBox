import { UAParser } from 'ua-parser-js'

/** 解析结果的展示字段（固定顺序），键与 i18n 的 field-* 对应 */
export const userAgentFields = [
  'browserName',
  'browserVersion',
  'engineName',
  'engineVersion',
  'osName',
  'osVersion',
  'cpuArchitecture',
  'deviceType',
  'deviceVendor',
  'deviceModel',
] as const

export type UserAgentField = (typeof userAgentFields)[number]

/** 字段缺失时的占位符 */
export const UNKNOWN_VALUE = '-'

/** UA 不可解析/字段缺失时统一占位，避免 undefined 直接进 UI */
function toDisplayValue(value: unknown): string {
  return value === undefined || value === null || value === '' ? UNKNOWN_VALUE : String(value)
}

/**
 * 解析 UA：包装 ua-parser-js 的 UAParser(ua).getResult()，
 * 输出固定顺序的可序列化展示对象（浏览器/引擎/OS/CPU/设备）
 */
export function parseUserAgent(ua: string): Record<UserAgentField, string> {
  const result = new UAParser(ua).getResult()
  return {
    browserName: toDisplayValue(result.browser.name),
    browserVersion: toDisplayValue(result.browser.version),
    engineName: toDisplayValue(result.engine.name),
    engineVersion: toDisplayValue(result.engine.version),
    osName: toDisplayValue(result.os.name),
    osVersion: toDisplayValue(result.os.version),
    cpuArchitecture: toDisplayValue(result.cpu.architecture),
    deviceType: toDisplayValue(result.device.type),
    deviceVendor: toDisplayValue(result.device.vendor),
    deviceModel: toDisplayValue(result.device.model),
  }
}
