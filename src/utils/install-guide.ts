/** 安装引导中的一段素材：下载链接 / 命令 / 配置文件 / 键值 / 向导选项 */
export type InstallGuideBlock =
  | { kind: 'link'; labelKey: string; url: string }
  | { kind: 'code'; value: string; noteKey?: string }
  | { kind: 'file'; nameKey: string; content: string; noteKey?: string }
  | { kind: 'kv'; rows: readonly { labelKey: string; value: string }[] }
  | { kind: 'choice'; rows: readonly { labelKey: string; valueKey: string }[] }

export interface InstallGuideStep {
  /** 标题键固定为 guide.<id>.title */
  id: string
  /** 说明键，如 guide.<id>.detail */
  detailKey?: string
  blocks?: readonly InstallGuideBlock[]
}

/** 引导数据用到的全部 i18n 键后缀，供单测校验双语齐全 */
export function installGuideKeys(steps: readonly InstallGuideStep[]): string[] {
  const keys: string[] = []
  for (const step of steps) {
    keys.push(`guide.${step.id}.title`)
    if (step.detailKey) {
      keys.push(step.detailKey)
    }
    for (const block of step.blocks ?? []) {
      if (block.kind === 'link') {
        keys.push(block.labelKey)
      } else if (block.kind === 'code') {
        if (block.noteKey) keys.push(block.noteKey)
      } else if (block.kind === 'file') {
        keys.push(block.nameKey)
        if (block.noteKey) keys.push(block.noteKey)
      } else if (block.kind === 'kv') {
        for (const row of block.rows) keys.push(row.labelKey)
      } else {
        for (const row of block.rows) keys.push(row.labelKey, row.valueKey)
      }
    }
  }
  return keys
}
