import { describe, expect, it } from 'vitest'

import { analysePdf } from '@/tools/crypto/pdf-signature-checker/pdf-signature-checker.service'

function toBytes(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff)
}

/** 构造带签名的最小 PDF 结构，并用填充字节把文件长度补齐到 byteRange 覆盖的末尾 */
function buildSignedPdf(targetLength: number): Uint8Array {
  const base =
    '%PDF-1.7\n' +
    '1 0 obj\n<< /Type /Catalog /AcroForm << /Fields [2 0 R] >> >>\nendobj\n' +
    '2 0 obj\n<< /FT /Sig /V << /ByteRange [0 100 200 50] /Contents <> >> >>\nendobj\n' +
    'trailer\n<< /Root 1 0 R >>\n%%EOF'
  if (base.length > targetLength) {
    throw new Error('fixture body longer than target length')
  }
  return toBytes(base + 'A'.repeat(targetLength - base.length))
}

describe('analysePdf', () => {
  it('detects AcroForm in an unsigned minimal PDF', () => {
    const analysis = analysePdf(
      toBytes('%PDF-1.7\n1 0 obj\n<< /AcroForm << /Fields [] >> >>\nendobj\n%%EOF'),
    )
    expect(analysis.hasAcroForm).toBe(true)
    expect(analysis.hasSignatureField).toBe(false)
    expect(analysis.signatureCount).toBe(0)
    expect(analysis.byteRanges).toEqual([])
    expect(analysis.warnings).toEqual(['no-signature'])
  })

  it('detects signatures in an intact signed PDF', () => {
    const analysis = analysePdf(buildSignedPdf(250))
    expect(analysis.hasAcroForm).toBe(true)
    expect(analysis.hasSignatureField).toBe(true)
    expect(analysis.signatureCount).toBe(1)
    expect(analysis.byteRanges).toEqual([[0, 100, 200, 50]])
    expect(analysis.warnings).toEqual([])
  })

  it('warns when data was appended after the signed range', () => {
    const analysis = analysePdf(buildSignedPdf(320))
    expect(analysis.signatureCount).toBe(1)
    expect(analysis.warnings).toEqual(['modified-after-signing'])
  })

  it('parses multiple byte ranges', () => {
    const analysis = analysePdf(
      toBytes(
        '%PDF-1.7\n' +
          '<< /FT /Sig /ByteRange [0 100 200 50] >>\n' +
          '<< /FT /Sig /ByteRange [0 200 300 100] >>\n' +
          '%%EOF',
      ),
    )
    expect(analysis.signatureCount).toBe(2)
    expect(analysis.byteRanges).toEqual([
      [0, 100, 200, 50],
      [0, 200, 300, 100],
    ])
  })

  it('flags a placeholder ByteRange with star padding as unsigned', () => {
    const analysis = analysePdf(
      toBytes('%PDF-1.7\n<< /FT /Sig /ByteRange [0 /********** 0 /**********] >>\n%%EOF'),
    )
    expect(analysis.hasSignatureField).toBe(true)
    expect(analysis.signatureCount).toBe(0)
    expect(analysis.warnings).toEqual(['unsigned-signature-field'])
  })

  it('flags malformed byte range arrays', () => {
    const analysis = analysePdf(toBytes('%PDF-1.7\n<< /ByteRange [0 100] >>\n%%EOF'))
    expect(analysis.signatureCount).toBe(0)
    expect(analysis.warnings).toEqual(['invalid-byte-range'])
  })

  it('throws on empty input', () => {
    expect(() => analysePdf(new Uint8Array())).toThrowError(/empty/i)
  })

  it('throws on non-PDF input', () => {
    expect(() => analysePdf(toBytes('hello world'))).toThrowError(/not a valid pdf/i)
  })
})
