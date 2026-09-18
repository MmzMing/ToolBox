import type { DefinedTool } from '../define-tool'

import { tool as base64StringConverter } from './base64-string-converter'

export const converterTools: readonly DefinedTool[] = [base64StringConverter]
