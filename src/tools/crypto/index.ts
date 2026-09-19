import type { DefinedTool } from '../define-tool'

import { tool as bcrypt } from './bcrypt'
import { tool as encryption } from './encryption'
import { tool as hashText } from './hash-text'
import { tool as hmacGenerator } from './hmac-generator'
import { tool as passwordStrengthAnalyser } from './password-strength-analyser'
import { tool as pdfSignatureChecker } from './pdf-signature-checker'
import { tool as rsaKeyPairGenerator } from './rsa-key-pair-generator'
import { tool as tokenGenerator } from './token-generator'
import { tool as ulidGenerator } from './ulid-generator'
import { tool as uuidGenerator } from './uuid-generator'

export const cryptoTools: readonly DefinedTool[] = [
  hashText,
  uuidGenerator,
  tokenGenerator,
  bcrypt,
  ulidGenerator,
  encryption,
  hmacGenerator,
  rsaKeyPairGenerator,
  passwordStrengthAnalyser,
  pdfSignatureChecker,
]
