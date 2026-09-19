import { parse, stringify } from 'yaml'

/** 美化与校验 YAML：parse 后以 2 空格缩进、100 列行宽重新序列化；空输入返回空串，非法输入抛 Error */
export function formatYaml(input: string): string {
  if (input.trim() === '') {
    return ''
  }
  let data: unknown
  try {
    data = parse(input)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid YAML: ${reason}`, { cause: err })
  }
  return stringify(data, { indent: 2, lineWidth: 100 }).trimEnd()
}
