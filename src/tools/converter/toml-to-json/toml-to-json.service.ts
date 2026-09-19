import { parse as parseToml } from 'smol-toml'

/** TOML → JSON（2 空格缩进）；TOML 非法时抛 Error 由 UI 展示 */
export function tomlToJson(input: string): string {
  if (input.trim() === '') {
    return ''
  }

  return JSON.stringify(parseToml(input), null, 2)
}
