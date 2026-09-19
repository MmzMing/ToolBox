export const PDF_WARNING_IDS = [
  'no-signature',
  'unsigned-signature-field',
  'invalid-byte-range',
  'modified-after-signing',
] as const

export type PdfWarningId = (typeof PDF_WARNING_IDS)[number]

export interface PdfAnalysis {
  /** 是否包含 /AcroForm 表单字典 */
  hasAcroForm: boolean
  /** 是否包含签名字段（/FT /Sig） */
  hasSignatureField: boolean
  /** 检测到的有效 /ByteRange 数字签名数量 */
  signatureCount: number
  /** 每个签名的 ByteRange [a b c d] 区间 */
  byteRanges: number[][]
  /** 稳定的警告标识，UI 层负责翻译 */
  warnings: PdfWarningId[]
}

const BYTE_RANGE_PATTERN = /\/ByteRange\s*\[\s*(\d+(?:\s+\d+)*)\s*\]/g

/** 按 Latin-1 分块解码，保留原始字节值用于关键字扫描 */
function decodeLatin1(bytes: Uint8Array): string {
  let text = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    text += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return text
}

/**
 * 基于字节/关键字扫描的基础 PDF 签名结构分析（不解析对象图、不验证证书，
 * 不构成法律效力验证）。文件为空或缺少 %PDF- 头时抛出 Error。
 */
export function analysePdf(bytes: Uint8Array): PdfAnalysis {
  if (bytes.length === 0) {
    throw new Error('File is empty')
  }
  const text = decodeLatin1(bytes)
  if (!text.startsWith('%PDF-')) {
    throw new Error('Not a valid PDF file')
  }

  const hasAcroForm = text.includes('/AcroForm')
  const hasSignatureField = /\/FT\s+\/Sig\b/.test(text)

  const byteRanges: number[][] = []
  let hasInvalidByteRange = false
  for (const match of text.matchAll(BYTE_RANGE_PATTERN)) {
    const values = match[1].split(/\s+/).map(Number)
    if (values.length === 4 && values.every((value) => Number.isFinite(value) && value >= 0)) {
      byteRanges.push(values)
    } else {
      hasInvalidByteRange = true
    }
  }

  const warnings: PdfWarningId[] = []
  if (byteRanges.length === 0) {
    if (hasInvalidByteRange) {
      warnings.push('invalid-byte-range')
    } else if (hasSignatureField || text.includes('/ByteRange')) {
      warnings.push('unsigned-signature-field')
    } else {
      warnings.push('no-signature')
    }
  } else {
    // ByteRange [a b c d] 覆盖 [a, a+b) 与 [c, c+d) 两段
    const maxEnd = Math.max(...byteRanges.map(([a, b, c, d]) => Math.max(a + b, c + d)))
    if (maxEnd > bytes.length || hasInvalidByteRange) {
      warnings.push('invalid-byte-range')
    }
    if (maxEnd < bytes.length) {
      warnings.push('modified-after-signing')
    }
  }

  return {
    hasAcroForm,
    hasSignatureField,
    signatureCount: byteRanges.length,
    byteRanges,
    warnings,
  }
}
