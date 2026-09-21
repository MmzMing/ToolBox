import jsQR from 'jsqr'
import QRCode from 'qrcode'

export const qrErrorCorrectionLevels = ['L', 'M', 'Q', 'H'] as const

export type QrErrorCorrectionLevel = (typeof qrErrorCorrectionLevels)[number]

export interface QrCodeStyleOptions {
  /** 纠错级别：L 7% / M 15% / Q 25% / H 30% */
  errorCorrectionLevel: QrErrorCorrectionLevel
  /** 输出图片边长（像素），SVG 时为宽度 */
  width: number
  /** 静区边距（模块数） */
  margin: number
  /** 前景色（模块颜色） */
  darkColor: string
  /** 背景色 */
  lightColor: string
}

export const QR_WIDTH_RANGE = { min: 128, max: 1024 } as const
export const QR_MARGIN_RANGE = { min: 0, max: 10 } as const

function toQrCodeOptions(options: QrCodeStyleOptions) {
  return {
    errorCorrectionLevel: options.errorCorrectionLevel,
    width: options.width,
    margin: options.margin,
    color: { dark: options.darkColor, light: options.lightColor },
  }
}

/** 生成二维码 PNG Data URL，空文本抛 Error */
export async function generateQrDataUrl(
  text: string,
  options: QrCodeStyleOptions,
): Promise<string> {
  if (text === '') {
    throw new Error('Text is required to generate a QR code')
  }
  return QRCode.toDataURL(text, toQrCodeOptions(options))
}

/** 生成二维码 SVG 字符串，空文本抛 Error */
export async function generateQrSvg(text: string, options: QrCodeStyleOptions): Promise<string> {
  if (text === '') {
    throw new Error('Text is required to generate a QR code')
  }
  return QRCode.toString(text, { ...toQrCodeOptions(options), type: 'svg' })
}

/** 识别用到的最长边上限：再大的图先等比缩小，避免 canvas 与逐像素扫描吃满内存 */
export const QR_DECODE_MAX_SIDE = 2000

/**
 * 从 RGBA 像素里识别二维码，读不出内容时返回 null。
 * jsQR 自带反色重试（attemptBoth），深色底二维码同样能读。
 */
export function decodeQrFromPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): string | null {
  if (pixels.length !== width * height * 4) {
    throw new Error(`Expected ${width * height * 4} bytes of RGBA data, got ${pixels.length}`)
  }
  return jsQR(pixels, width, height)?.data ?? null
}
