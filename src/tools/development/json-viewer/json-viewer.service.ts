export const jsonIndents = [2, 4, 'tab'] as const

export type JsonIndent = (typeof jsonIndents)[number]

function indentValue(indent: JsonIndent): number | string {
  return indent === 'tab' ? '\t' : indent
}

/** 美化 JSON：indent 支持 2/4 空格或 Tab，解析失败抛带原因与位置的 Error */
export function formatJson(input: string, indent: JsonIndent = 2): string {
  let data: unknown
  try {
    data = JSON.parse(input)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid JSON: ${reason}`, { cause: err })
  }
  return JSON.stringify(data, null, indentValue(indent))
}

/** 压缩 JSON：去除所有空白与换行，解析失败抛 Error */
export function minifyJson(input: string): string {
  let data: unknown
  try {
    data = JSON.parse(input)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid JSON: ${reason}`, { cause: err })
  }
  return JSON.stringify(data)
}
