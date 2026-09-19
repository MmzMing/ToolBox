export interface EditorCommand {
  /** document.execCommand 的经典命令名 */
  command: string
  /** 命令参数（如 formatBlock 的目标标签） */
  argument?: string
  /** i18n 标签键（稳定），映射 <name>.cmd-<labelKey> */
  labelKey: string
}

/** 工具栏命令表（经典 document.execCommand 命令，labelKey 稳定供 i18n 使用） */
export const editorCommands: readonly EditorCommand[] = [
  { command: 'bold', labelKey: 'bold' },
  { command: 'italic', labelKey: 'italic' },
  { command: 'underline', labelKey: 'underline' },
  { command: 'strikeThrough', labelKey: 'strikeThrough' },
  { command: 'formatBlock', argument: '<h1>', labelKey: 'heading1' },
  { command: 'formatBlock', argument: '<h2>', labelKey: 'heading2' },
  { command: 'formatBlock', argument: '<h3>', labelKey: 'heading3' },
  { command: 'insertUnorderedList', labelKey: 'unorderedList' },
  { command: 'insertOrderedList', labelKey: 'orderedList' },
  { command: 'createLink', labelKey: 'link' },
  { command: 'removeFormat', labelKey: 'removeFormat' },
]

/** 需要高亮“按下”状态的命令（与 getSelectedCommandState 的键一致） */
export const statefulCommands = ['bold', 'italic', 'underline', 'strikeThrough'] as const

export type StatefulCommand = (typeof statefulCommands)[number]

export type CommandState = Record<StatefulCommand, boolean>

/** 查询当前选区的命令状态（仅浏览器环境使用；node 测试跳过） */
export function getSelectedCommandState(doc: Document): CommandState {
  const query = (command: StatefulCommand): boolean => {
    try {
      return doc.queryCommandState(command)
    } catch {
      return false
    }
  }
  return {
    bold: query('bold'),
    italic: query('italic'),
    underline: query('underline'),
    strikeThrough: query('strikeThrough'),
  }
}
