import { compareSync, hashSync } from 'bcryptjs'

export const SALT_ROUNDS_RANGE = { min: 4, max: 15 } as const

/** 生成 bcrypt 哈希，空密码或 saltRounds 越界时抛出 Error */
export function hashPassword(password: string, saltRounds: number): string {
  if (password === '') {
    throw new Error('Password must not be empty')
  }
  const { min, max } = SALT_ROUNDS_RANGE
  if (!Number.isInteger(saltRounds) || saltRounds < min || saltRounds > max) {
    throw new Error(`Salt rounds must be an integer between ${min} and ${max}`)
  }
  return hashSync(password, saltRounds)
}

/** 校验密码与哈希是否匹配，密码/哈希为空或哈希格式非法时返回 false */
export function comparePassword(password: string, hash: string): boolean {
  if (password === '' || hash === '') {
    return false
  }
  try {
    return compareSync(password, hash)
  } catch {
    return false
  }
}
