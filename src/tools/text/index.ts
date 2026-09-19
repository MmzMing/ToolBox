import type { DefinedTool } from '../define-tool'

import { tool as loremIpsumGenerator } from './lorem-ipsum-generator'
import { tool as textStatistics } from './text-statistics'
import { tool as emojiPicker } from './emoji-picker'
import { tool as stringObfuscator } from './string-obfuscator'
import { tool as textDiff } from './text-diff'
import { tool as numeronymGenerator } from './numeronym-generator'
import { tool as asciiTextDrawer } from './ascii-text-drawer'

export const textTools: readonly DefinedTool[] = [
  loremIpsumGenerator,
  textStatistics,
  emojiPicker,
  stringObfuscator,
  textDiff,
  numeronymGenerator,
  asciiTextDrawer,
]
