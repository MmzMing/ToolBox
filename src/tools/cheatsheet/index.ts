import type { DefinedTool } from '../define-tool'

import { tool as dockerMemo } from './docker-memo'
import { tool as httpStatusCodes } from './http-status-codes'
import { tool as regexMemo } from './regex-memo'
import { tool as gitMemo } from './git-memo'
import { tool as mavenMemo } from './maven-memo'
import { tool as nvmMemo } from './nvm-memo'
import { tool as photoCheatsheet } from './photo-cheatsheet'
import { tool as sqlMemo } from './sql-memo'

export const cheatsheetTools: readonly DefinedTool[] = [
  httpStatusCodes,
  regexMemo,
  gitMemo,
  mavenMemo,
  nvmMemo,
  dockerMemo,
  sqlMemo,
  photoCheatsheet,
]
