import type { DefinedTool } from '../define-tool'

import { tool as textDiff } from './text-diff'
import { tool as textStatistics } from './text-statistics'
import { tool as caseConverter } from './case-converter'
import { tool as emojiPicker } from './emoji-picker'
import { tool as asciiTextDrawer } from './ascii-text-drawer'
import { tool as loremIpsumGenerator } from './lorem-ipsum-generator'

export const textTools: readonly DefinedTool[] = [
  textDiff,
  textStatistics,
  caseConverter,
  emojiPicker,
  asciiTextDrawer,
  loremIpsumGenerator,
]
