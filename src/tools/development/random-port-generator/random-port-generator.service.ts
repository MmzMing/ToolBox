export interface GeneratePortsOptions {
  count: number
  min: number
  max: number
  exclude: number[]
}

/**
 * 在 [min, max] 内生成 count 个不重复的随机端口（跳过 exclude）。
 * 范围非法（非整数、超出 0-65535、min > max）或数量超出可用端口数时抛 Error。
 */
export function generatePorts(options: GeneratePortsOptions): number[] {
  const { count, min, max, exclude } = options

  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Invalid count: ${count} (expected a positive integer)`)
  }
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max > 65535) {
    throw new Error(`Invalid port range: ${min}-${max} (expected integers within 0-65535)`)
  }
  if (min > max) {
    throw new Error(`Invalid port range: min (${min}) must not exceed max (${max})`)
  }

  const excluded = new Set(exclude)
  const picked = new Set<number>()
  const available =
    max - min + 1 - [...excluded].filter((port) => port >= min && port <= max).length
  if (count > available) {
    throw new Error(`Not enough available ports: requested ${count}, only ${available} available`)
  }

  while (picked.size < count) {
    const port = min + Math.floor(Math.random() * (max - min + 1))
    if (!excluded.has(port)) {
      picked.add(port)
    }
  }
  return [...picked]
}

/** 解析逗号分隔的排除列表（容忍空段与非数字），返回去重后的合法端口号 */
export function parseExcludeList(input: string): number[] {
  const ports = new Set<number>()
  for (const part of input.split(',')) {
    const trimmed = part.trim()
    if (trimmed === '') {
      continue
    }
    const port = Number(trimmed)
    if (Number.isInteger(port)) {
      ports.add(port)
    }
  }
  return [...ports]
}
