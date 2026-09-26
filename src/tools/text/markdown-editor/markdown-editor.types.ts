/** 视图模式：仅编辑 / 分栏 / 仅预览 */
export type ViewMode = 'edit' | 'split' | 'preview'

/** 可持久化的界面偏好 */
export type EditorUi = {
  viewMode: ViewMode
  syncScroll: boolean
  renderMermaid: boolean
  renderMath: boolean
  lineWrap: boolean
}

/** 一次源码编辑的目标偏移，基于编辑前的原文档坐标 */
export type SourceChange = {
  from: number
  to: number
  insert: string
}

/**
 * 编辑事务：CodeMirror 的 `changes` 数组按原文坐标升序应用，因此一条事务里可以
 * 同时放多个互不重叠的改动（代码围栏需要「行首加 ```、行尾补 ```」两处）。
 */
export type SourceEdit = {
  changes: readonly SourceChange[]
  selFrom: number
  selTo: number
}

export type InlineMarkKind = 'bold' | 'italic' | 'strike' | 'code' | 'math'

export type LineBlockKind =
  'heading1' | 'heading2' | 'heading3' | 'unordered' | 'ordered' | 'task' | 'quote'

/** 图表下拉可插入的 Mermaid 类型，值即围栏内的 lang 首行关键字 */
export type MermaidKind =
  | 'flowchart'
  | 'sequence'
  | 'class'
  | 'state'
  | 'gantt'
  | 'pie'
  | 'mindmap'
  | 'timeline'
  | 'journey'
  | 'gitGraph'

export type MermaidCommand = `mermaid:${MermaidKind}`

/** 工具栏能发出的全部插入命令，i18n 键为 `cmd-<本值>` */
export type InsertCommand =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'link'
  | 'image'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'unordered'
  | 'ordered'
  | 'task'
  | 'quote'
  | 'codeBlock'
  | 'table'
  | 'divider'
  | 'mathInline'
  | 'mathBlock'
  | MermaidCommand

export type ExportKind = 'markdown' | 'html' | 'pdf' | 'copyHtml'

export type SaveStatus = 'saved' | 'saving' | 'error'

/** CodeMirror 光标位置（行与列都从 1 起） */
export type CursorPosition = {
  line: number
  column: number
}

export type TextStats = {
  chars: number
  words: number
  lines: number
}
