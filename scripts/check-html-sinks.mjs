#!/usr/bin/env node
// 检查每一个 HTML 注入出口（dangerouslySetInnerHTML 与裸 innerHTML 写入）：
// 要么过已知消毒器，要么带人工签署的标记注释。
//
// 为什么需要它：AI 密钥明文放在同源 localStorage 里，任何一处 XSS 都能把全部厂商 key
// 读走；而 CSP 的 connect-src 允许任意 https（BYO-key 的必然代价），拦不住外带。
// 所以「模型与导入内容不进未消毒的 HTML 出口」是唯一实质防线，不能只靠人记着。
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(import.meta.dirname, '../src')

/** 名字即承诺：这些函数内部负责消毒，把它们的返回值交给 HTML 出口是允许的 */
const SANITIZERS = [
  'normalizeRichTextContent',
  'sanitizeRichTextHtml',
  'sanitizeMarkdownHtml',
  'sanitizeSvg',
  'markdownToEditorHtml',
  'markdownToPreviewHtml',
  'serializeJsonLd',
  'escapeHtml',
]

/** 逃生口：标记后必须紧跟一句理由，光有标记没有理由同样不过 */
const MARKER = /html-sanitized:\s*(\S.*)/

/** 两种出口形态：React 的 prop，以及裸 DOM 写入（清空成 '' 不算） */
const SINKS = [
  /dangerouslySetInnerHTML/,
  /\.(?:inner|outer)HTML\s*=\s*(?!''|""|`\s*`)/,
  /insertAdjacentHTML\s*\(/,
]

const MARKUP = /\.(ts|tsx)$/
const isComment = (line) => /^\s*(?:\/\/|\/\*|\*)/.test(line)

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'test') walk(full, out)
    } else if (MARKUP.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

const violations = []

for (const file of walk(SRC)) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, index) => {
    if (isComment(line) || !SINKS.some((pattern) => pattern.test(line))) {
      return
    }
    // 表达式常折行，往下多读两行再判
    const expression = lines.slice(index, index + 3).join(' ')
    if (SANITIZERS.some((name) => expression.includes(`${name}(`))) {
      return
    }
    if (lines.slice(Math.max(0, index - 4), index).some((item) => MARKER.test(item))) {
      return
    }
    violations.push(
      `${path.relative(SRC, file)}:${index + 1}\n` +
        `    未经消毒的 HTML 出口。改成走 ${SANITIZERS[0]}(...) 这类消毒器，` +
        `或在上方写 // html-sanitized: <为什么这段内容是安全的>`,
    )
  })
}

console.log(
  violations.length
    ? `${violations.length} unreviewed HTML sink(s):\n${violations.join('\n')}`
    : 'OK: every HTML sink is sanitized or signed off',
)
process.exit(violations.length ? 1 : 0)
