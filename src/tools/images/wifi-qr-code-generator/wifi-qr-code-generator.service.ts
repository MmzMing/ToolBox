import QRCode from 'qrcode'

export const wifiEncryptionTypes = ['WPA', 'WEP', 'nopass'] as const

export type WifiEncryption = (typeof wifiEncryptionTypes)[number]

export interface WifiQrOptions {
  ssid: string
  password: string
  encryption: WifiEncryption
  hidden: boolean
}

/**
 * 转义 WiFi 配置字符串中的特殊字符（\ ; , : "），
 * 见 ZXing "WIFI:" 二维码规范，反斜杠需最先处理（单趟替换天然满足）。
 */
export function escapeWifiValue(value: string): string {
  return value.replace(/[\\;,:"]/g, '\\$&')
}

/** 构造 `WIFI:T:WPA;S:<ssid>;P:<pass>;H:true;;` 标准字符串，空 SSID 抛 Error */
export function buildWifiString(options: WifiQrOptions): string {
  if (options.ssid === '') {
    throw new Error('SSID is required to build a WiFi QR string')
  }
  const parts = [`T:${options.encryption}`, `S:${escapeWifiValue(options.ssid)}`]
  if (options.encryption !== 'nopass') {
    parts.push(`P:${escapeWifiValue(options.password)}`)
  }
  if (options.hidden) {
    parts.push('H:true')
  }
  return `WIFI:${parts.join(';')};;`
}

/** 用 qrcode 库渲染 WiFi 配置字符串为 PNG Data URL */
export async function generateWifiQrDataUrl(text: string): Promise<string> {
  if (text === '') {
    throw new Error('Text is required to generate a QR code')
  }
  return QRCode.toDataURL(text, { errorCorrectionLevel: 'M', width: 256, margin: 2 })
}
