/** 每个主体（所有者/组/其他）的 [读, 写, 执行] 权限位 */
export type PermissionTriad = [boolean, boolean, boolean]

const OCTAL_PATTERN = /^[0-7]{3}$/

const BIT_TO_FLAGS: Record<string, [boolean, boolean, boolean]> = {
  '0': [false, false, false],
  '1': [false, false, true],
  '2': [false, true, false],
  '3': [false, true, true],
  '4': [true, false, false],
  '5': [true, false, true],
  '6': [true, true, false],
  '7': [true, true, true],
}

/** 解析三位八进制数字模式（如 '755'）为三组 [r, w, x]；非法输入抛 Error */
export function parseChmod(digits: string): PermissionTriad[] {
  if (!OCTAL_PATTERN.test(digits)) {
    throw new Error(`Invalid chmod digits: ${digits} (expected 3 octal digits, e.g. 755)`)
  }
  return [...digits].map((digit) => [...BIT_TO_FLAGS[digit]] as PermissionTriad)
}

/** 由三组 [r, w, x] 生成数字模式与符号模式（如 755 / rwxr-xr-x） */
export function formatChmod(perms: readonly PermissionTriad[]): {
  digits: string
  symbolic: string
} {
  let digits = ''
  let symbolic = ''
  for (const [read, write, execute] of perms) {
    let value = 0
    if (read) value += 4
    if (write) value += 2
    if (execute) value += 1
    digits += String(value)
    symbolic += `${read ? 'r' : '-'}${write ? 'w' : '-'}${execute ? 'x' : '-'}`
  }
  return { digits, symbolic }
}
