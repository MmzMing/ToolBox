/** 常见跳转包装参数名（小写匹配，与 it-tools/常见营销与 SSO 跳转参数对齐） */
export const redirectParamNames = [
  'url',
  'target',
  'link',
  'to',
  'u',
  'redirect',
  'rurl',
  'q',
  'http',
] as const

/** 单层跳转的最大递归深度（同时限制参数值内 decodeURIComponent 的次数），防止死循环 */
export const maxDecodeDepth = 5

export interface SafelinkResult {
  /** 每一层解出的中间跳转地址（按顺序） */
  steps: string[]
  /** 最终目标地址；无跳转参数时为原 URL */
  target: string
}

const urlSchemePattern = /^https?:\/\//i

/** 对参数值做渐进式 decodeURIComponent，返回原始值与逐层解码结果（去重、最多 maxDecodeDepth 层） */
function progressiveDecode(value: string): string[] {
  const decoded: string[] = [value]
  let current = value
  for (let depth = 0; depth < maxDecodeDepth; depth += 1) {
    let next: string
    try {
      next = decodeURIComponent(current)
    } catch {
      // 非法百分号序列：保留已解码的部分
      break
    }
    if (next === current) {
      break
    }
    decoded.push(next)
    current = next
  }
  return decoded
}

/** 在 URL 的查询参数里按已知参数名寻找下一个跳转目标；找不到返回 null */
function nextHop(current: string): string | null {
  let url: URL
  try {
    url = new URL(current)
  } catch {
    return null
  }
  for (const name of redirectParamNames) {
    const raw = url.searchParams.get(name)
    if (raw === null || raw === '') {
      continue
    }
    for (const candidate of progressiveDecode(raw)) {
      if (urlSchemePattern.test(candidate) && candidate !== current) {
        return candidate
      }
    }
  }
  return null
}

/**
 * 逐层解码被包装的跳转链接：每轮在查询参数中找已知跳转参数，
 * 解码出下一层 URL，直到没有跳转参数或达到最大层数。
 * 无跳转参数时 target 为原 URL、steps 为空；非法 URL 抛 Error
 */
export function decodeSafelink(input: string): SafelinkResult {
  const trimmed = input.trim()
  try {
    new URL(trimmed)
  } catch {
    throw new Error(`Invalid URL: ${trimmed === '' ? '(empty)' : trimmed}`)
  }

  const steps: string[] = []
  let current = trimmed
  for (let depth = 0; depth < maxDecodeDepth; depth += 1) {
    const hop = nextHop(current)
    if (hop === null) {
      break
    }
    steps.push(hop)
    current = hop
  }
  return { steps, target: current }
}
