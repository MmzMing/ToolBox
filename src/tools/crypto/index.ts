import type { DefinedTool } from '../define-tool'

import { tool as bcrypt } from './bcrypt'
import { tool as encryption } from './encryption'
import { tool as hashText } from './hash-text'
import { tool as idGenerator } from './id-generator'
import { tool as keyGenerator } from './key-generator'
import { tool as passwordStrengthAnalyser } from './password-strength-analyser'
import { tool as pdfSignatureChecker } from './pdf-signature-checker'

export const cryptoTools: readonly DefinedTool[] = [
  hashText,
  idGenerator,
  bcrypt,
  encryption,
  keyGenerator,
  passwordStrengthAnalyser,
  pdfSignatureChecker,
]
