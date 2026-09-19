import type { DefinedTool } from '../define-tool'

import { tool as httpStatusCodes } from './http-status-codes'
import { tool as regexMemo } from './regex-memo'
import { tool as gitMemo } from './git-memo'
import { tool as photoCheatsheet } from './photo-cheatsheet'

export const cheatsheetTools: readonly DefinedTool[] = [
  httpStatusCodes,
  regexMemo,
  gitMemo,
  photoCheatsheet,
]
