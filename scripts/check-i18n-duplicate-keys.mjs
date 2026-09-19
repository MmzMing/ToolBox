#!/usr/bin/env node
// 检查 i18n 语言包 JSON 中同一对象层级的重复键（JSON.parse 会静默取最后一个）
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

let dupFound = 0

function detect(file) {
  const text = readFileSync(file, 'utf8')
  const stack = [new Set()]
  let inStr = false
  let esc = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') {
      inStr = true
      continue
    }
    if (c === '{') {
      stack.push(new Set())
      continue
    }
    if (c === '}') {
      stack.pop()
      continue
    }
    if (c === ':') {
      let j = i - 1
      while (j >= 0 && /\s/.test(text[j])) j--
      if (text[j] === '"') {
        let k = j - 1
        let key = ''
        while (k >= 0 && text[k] !== '"') {
          key = text[k] + key
          k--
        }
        const cur = stack[stack.length - 1]
        if (cur.has(key)) {
          console.log('DUP', file, JSON.stringify(key))
          dupFound++
        }
        cur.add(key)
      }
    }
  }
}

const localesDir = path.resolve(import.meta.dirname, '../src/modules/i18n/locales')
for (const lang of readdirSync(localesDir)) {
  const dir = path.join(localesDir, lang)
  for (const f of readdirSync(dir)) detect(path.join(dir, f))
}
console.log(dupFound === 0 ? 'OK: no duplicate keys' : `${dupFound} duplicates found`)
process.exit(dupFound === 0 ? 0 : 1)
