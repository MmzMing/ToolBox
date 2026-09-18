import type { DefinedTool } from '../define-tool'

import { tool as hashText } from './hash-text'
import { tool as uuidGenerator } from './uuid-generator'

export const cryptoTools: readonly DefinedTool[] = [hashText, uuidGenerator]
