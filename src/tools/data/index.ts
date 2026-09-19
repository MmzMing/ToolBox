import type { DefinedTool } from '../define-tool'

import { tool as phoneParserAndFormatter } from './phone-parser-and-formatter'
import { tool as ibanValidatorAndParser } from './iban-validator-and-parser'

export const dataTools: readonly DefinedTool[] = [phoneParserAndFormatter, ibanValidatorAndParser]
