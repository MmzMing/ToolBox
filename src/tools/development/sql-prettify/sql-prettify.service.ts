import { format } from 'sql-formatter'

/** 美化 SQL 语句（标准 sql 方言，2 空格缩进）；空输入原样返回，解析失败抛 Error */
export function formatSql(input: string): string {
  if (input.trim() === '') {
    return ''
  }
  try {
    return format(input, { language: 'sql', tabWidth: 2 })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid SQL: ${reason}`, { cause: err })
  }
}
