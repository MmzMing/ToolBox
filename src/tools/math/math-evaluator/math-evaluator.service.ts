/**
 * 数学表达式求值（基于 mathjs）。
 */
import { evaluate, format, isResultSet } from 'mathjs'

/** 数字/布尔结果统一保留 14 位有效数字，消除浮点尾巴（0.1+0.2 → 0.3） */
function stringifyResult(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return format(value, { precision: 14 })
  }
  if (value === null || value === undefined) {
    return ''
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value)
  }
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value) as { toString?: unknown } | null
    // mathjs 类型（Unit/Complex/Matrix/BigNumber…）与 Date 都带可读的自定义 toString
    if (prototype?.toString !== Object.prototype.toString) {
      return String(value)
    }
    return JSON.stringify(value)
  }
  return String(value)
}

/**
 * 求值数学表达式（mathjs 全语法：四则与幂运算、sqrt/sin/cos/log 等函数、
 * pi/e 等常量、变量赋值、单位换算）。多行整段求值，返回最后一个表达式的结果。
 * 空输入返回空串；语法错误抛 Error。
 */
export function evaluateMath(expression: string): string {
  const trimmed = expression.trim()
  if (trimmed === '') {
    return ''
  }
  const result: unknown = evaluate(trimmed)
  if (isResultSet(result)) {
    const entries = result.entries
    if (entries.length === 0) {
      return ''
    }
    return stringifyResult(entries.at(-1))
  }
  return stringifyResult(result)
}
