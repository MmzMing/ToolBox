import type { DefinedTool } from '../define-tool'

import { tool as urlEncoder } from './url-encoder'
import { tool as htmlEntities } from './html-entities'
import { tool as urlParser } from './url-parser'
import { tool as deviceInformation } from './device-information'
import { tool as basicAuthGenerator } from './basic-auth-generator'
import { tool as metaTagGenerator } from './meta-tag-generator'
import { tool as otpCodeGeneratorAndValidator } from './otp-code-generator-and-validator'
import { tool as jwtParser } from './jwt-parser'
import { tool as slugifyString } from './slugify-string'
import { tool as htmlWysiwygEditor } from './html-wysiwyg-editor'
import { tool as userAgentParser } from './user-agent-parser'
import { tool as safelinkDecoder } from './safelink-decoder'
import { tool as ipLookup } from './ip-lookup'

export const webTools: readonly DefinedTool[] = [
  urlEncoder,
  htmlEntities,
  urlParser,
  deviceInformation,
  basicAuthGenerator,
  metaTagGenerator,
  otpCodeGeneratorAndValidator,
  jwtParser,
  slugifyString,
  htmlWysiwygEditor,
  userAgentParser,
  safelinkDecoder,
  ipLookup,
]
