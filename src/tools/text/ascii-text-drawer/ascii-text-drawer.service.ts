import figlet from 'figlet'
import bigFont from 'figlet/importable-fonts/Big.js'
import smallFont from 'figlet/importable-fonts/Small.js'
import slantFont from 'figlet/importable-fonts/Slant.js'
import standardFont from 'figlet/importable-fonts/Standard.js'

// 浏览器端没有文件系统，预先注册内置字体数据（Node 端 parseFont 同样生效）
figlet.parseFont('Standard', standardFont)
figlet.parseFont('Big', bigFont)
figlet.parseFont('Slant', slantFont)
figlet.parseFont('Small', smallFont)

export const availableFonts = ['Standard', 'Big', 'Slant', 'Small'] as const

export type AsciiFont = (typeof availableFonts)[number]

/** 可打印 ASCII 区间（含空格） */
const PRINTABLE_ASCII = /^[ -~]+$/

/**
 * 将文本绘制为 ASCII 字符画。
 * 空文本、含非可打印 ASCII 字符或字体不在 availableFonts 内时抛出 Error。
 */
export async function drawAscii(text: string, font: string): Promise<string> {
  if (text.trim() === '') {
    throw new Error('Text must not be empty')
  }
  if (!availableFonts.includes(font as AsciiFont)) {
    throw new Error(`Unsupported font: ${font}`)
  }
  if (!PRINTABLE_ASCII.test(text)) {
    throw new Error('Text contains characters outside the printable ASCII range')
  }
  return figlet.textSync(text, { font })
}
