import {
  camelCase,
  constantCase,
  kebabCase,
  pascalCase,
  sentenceCase,
  snakeCase,
  split,
  trainCase,
} from 'change-case'

export type CaseResults = Record<string, string>

/** Title Case：每个分词首字母大写（change-case v5 未内置 titleCase） */
function toTitleCase(input: string): string {
  return split(input)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * 一次性产出常见命名风格。支持空格 / 下划线 / 中划线 / 驼峰边界分词。
 * 空输入返回全部空字符串。
 */
export function toCaseAll(input: string): CaseResults {
  return {
    camel: camelCase(input),
    pascal: pascalCase(input),
    snake: snakeCase(input),
    constant: constantCase(input),
    kebab: kebabCase(input),
    train: trainCase(input),
    title: toTitleCase(input),
    sentence: sentenceCase(input),
  }
}
