import { parse as parseToml } from 'smol-toml'
import { stringify as stringifyYaml } from 'yaml'

/** TOML → YAML（缩进 2）；TOML 非法时抛 Error 由 UI 展示 */
export function tomlToYaml(input: string): string {
  if (input.trim() === '') {
    return ''
  }

  return stringifyYaml(parseToml(input), { indent: 2 })
}
