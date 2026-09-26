import type { DefinedTool } from '../define-tool'

import { tool as markdownEditor } from './markdown-editor'
import { tool as textDiff } from './text-diff'
import { tool as textFormatter } from './text-formatter'
import { tool as asciiTextDrawer } from './ascii-text-drawer'

export const textTools: readonly DefinedTool[] = [
  markdownEditor,
  textDiff,
  textFormatter,
  asciiTextDrawer,
]
