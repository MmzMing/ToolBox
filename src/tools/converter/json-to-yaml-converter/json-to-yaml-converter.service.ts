import { stringify } from 'yaml'

/** JSON → YAML（缩进 2）；JSON 非法时抛 Error 由 UI 展示 */
export function jsonToYaml(input: string): string {
  if (input.trim() === '') {
    return ''
  }

  let value: unknown
  try {
    value = JSON.parse(input)
  } catch (err) {
    throw new Error(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    })
  }

  return stringify(value, { indent: 2 })
}
