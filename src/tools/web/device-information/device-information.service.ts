/** 设备信息字段与展示顺序（固定），键与 getDeviceInfo 返回对象的键一一对应 */
export const deviceInfoFields = [
  'userAgent',
  'platform',
  'language',
  'screenResolution',
  'screenColorDepth',
  'viewport',
  'pixelRatio',
  'cpuCores',
  'memory',
  'online',
  'timezone',
] as const

export type DeviceInfoField = (typeof deviceInfoFields)[number]

/** 字段不可用时的兜底文案 */
export const UNKNOWN_VALUE = 'unknown'

/** 未知/缺失值统一兜底为 unknown，其余转字符串 */
export function toDisplayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return UNKNOWN_VALUE
  }
  return String(value)
}

function getNavigator(): Navigator | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator
}

function getScreen(): Screen | undefined {
  return typeof screen === 'undefined' ? undefined : screen
}

function getTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
  } catch {
    return ''
  }
}

/** 读取浏览器与设备能力信息（只读、无副作用），字段顺序与 deviceInfoFields 一致 */
export function getDeviceInfo(): Record<string, string> {
  const nav = getNavigator()
  const scr = getScreen()
  const hasWindow = typeof window !== 'undefined'
  const deviceMemory = nav ? (nav as unknown as { deviceMemory?: number }).deviceMemory : undefined

  return {
    userAgent: toDisplayValue(nav?.userAgent),
    platform: toDisplayValue(nav?.platform),
    language: toDisplayValue(nav?.language),
    screenResolution: toDisplayValue(scr ? `${scr.width}x${scr.height}` : ''),
    screenColorDepth: toDisplayValue(scr ? `${scr.colorDepth} bit` : ''),
    viewport: toDisplayValue(hasWindow ? `${window.innerWidth}x${window.innerHeight}` : ''),
    pixelRatio: toDisplayValue(hasWindow ? window.devicePixelRatio : ''),
    cpuCores: toDisplayValue(nav?.hardwareConcurrency ? `${nav.hardwareConcurrency} cores` : ''),
    memory: toDisplayValue(deviceMemory !== undefined ? `${deviceMemory} GB` : ''),
    online: toDisplayValue(nav ? (nav.onLine ? 'online' : 'offline') : ''),
    timezone: toDisplayValue(getTimezone()),
  }
}
