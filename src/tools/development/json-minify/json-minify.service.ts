/** 压缩 JSON：parse 后无空格 stringify；空输入原样返回，非法输入抛带原因的 Error */
export function minify(input: string): string {
  if (input.trim() === '') {
    return ''
  }
  let data: unknown
  try {
    data = JSON.parse(input)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid JSON: ${reason}`, { cause: err })
  }
  return JSON.stringify(data)
}
