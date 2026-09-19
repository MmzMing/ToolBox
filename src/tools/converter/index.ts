import type { DefinedTool } from '../define-tool'

import { tool as base64StringConverter } from './base64-string-converter'
import { tool as base64FileConverter } from './base64-file-converter'
import { tool as dateTimeConverter } from './date-time-converter'
import { tool as integerBaseConverter } from './integer-base-converter'
import { tool as romanNumeralConverter } from './roman-numeral-converter'
import { tool as colorConverter } from './color-converter'
import { tool as caseConverter } from './case-converter'
import { tool as textToNatoAlphabet } from './text-to-nato-alphabet'
import { tool as textToBinary } from './text-to-binary'
import { tool as textToUnicode } from './text-to-unicode'
import { tool as listConverter } from './list-converter'
import { tool as formatConverter } from './format-converter'

export const converterTools: readonly DefinedTool[] = [
  base64StringConverter,
  base64FileConverter,
  dateTimeConverter,
  integerBaseConverter,
  romanNumeralConverter,
  colorConverter,
  caseConverter,
  textToNatoAlphabet,
  textToBinary,
  textToUnicode,
  listConverter,
  formatConverter,
]
