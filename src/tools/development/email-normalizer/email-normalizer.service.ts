export interface EmailNormalizeOptions {
  /** 去除 Gmail 用户名中的点（user.name → username） */
  gmailDots: boolean
  /** 去除 Gmail 用户名中的 +tag 后缀（user+tag → user） */
  plusTag: boolean
  /** 全部转为小写 */
  lowercase: boolean
}

/** 宽松邮箱校验：local@domain.tld，不含空格，domain 至少含一个点 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 规范化单个邮箱：Gmail 规则（去点、去 +tag）只作用于 gmail.com / googlemail.com；非法邮箱抛 Error */
export function normalizeEmail(email: string, options: EmailNormalizeOptions): string {
  const trimmed = email.trim()
  if (!EMAIL_PATTERN.test(trimmed)) {
    throw new Error(`Invalid email address: ${trimmed}`)
  }

  const separator = trimmed.lastIndexOf('@')
  let local = trimmed.slice(0, separator)
  let domain = trimmed.slice(separator + 1)

  if (options.lowercase) {
    local = local.toLowerCase()
    domain = domain.toLowerCase()
  }

  const isGmail = domain === 'gmail.com' || domain === 'googlemail.com'
  if (isGmail) {
    if (options.plusTag) {
      local = local.replace(/\+.*$/, '')
    }
    if (options.gmailDots) {
      local = local.replaceAll('.', '')
    }
  }

  return `${local}@${domain}`
}

/** 批量规范化：按行拆分（自动去空行），dedupe 时结果去重；任一行非法抛 Error */
export function normalizeEmailList(
  input: string,
  options: EmailNormalizeOptions,
  dedupe: boolean,
): string[] {
  const emails = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')

  const normalized = emails.map((email) => normalizeEmail(email, options))
  if (!dedupe) {
    return normalized
  }
  return [...new Set(normalized)]
}
