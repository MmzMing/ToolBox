export interface RegexMatch {
  value: string
  index: number
  groups: (string | null)[]
}

export interface RegexTestResult {
  matches: RegexMatch[]
  error: string | null
}

/** 匹配上限，防御病态输入（如超大文本 + 空匹配） */
const MAX_MATCHES = 10_000

/**
 * 测试正则：返回全部匹配（含分组捕获）；无 g 标志只取第一个匹配。
 * 正则/标志非法时 error 返回错误消息（不抛出）；零宽匹配推进 lastIndex 防死循环。
 */
export function testRegex(pattern: string, flags: string, text: string): RegexTestResult {
  if (pattern === '') {
    return { matches: [], error: null }
  }

  let regex: RegExp
  try {
    regex = new RegExp(pattern, flags)
  } catch (err) {
    return { matches: [], error: err instanceof Error ? err.message : String(err) }
  }

  const matches: RegexMatch[] = []
  const isGlobal = regex.global

  try {
    while (true) {
      const match = regex.exec(text)
      if (match === null) {
        break
      }
      matches.push({
        value: match[0],
        index: match.index,
        groups: match.slice(1).map((group) => group ?? null),
      })
      // 零宽匹配（如 a*）：手动推进 lastIndex 避免死循环
      if (match[0] === '') {
        regex.lastIndex += 1
      }
      if (!isGlobal || matches.length >= MAX_MATCHES) {
        break
      }
    }
  } catch (err) {
    // u 标志下的病态输入可能在迭代中途抛错
    return { matches: [], error: err instanceof Error ? err.message : String(err) }
  }

  return { matches, error: null }
}
