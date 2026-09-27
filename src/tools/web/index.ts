import type { DefinedTool } from '../define-tool'

import { tool as htmlEntities } from './html-entities'
import { tool as urlParser } from './url-parser'
import { tool as deviceInformation } from './device-information'
import { tool as otpCodeGeneratorAndValidator } from './otp-code-generator-and-validator'
import { tool as userAgentParser } from './user-agent-parser'
import { tool as safelinkDecoder } from './safelink-decoder'
import { tool as ipLookup } from './ip-lookup'
import { tool as dnsLookup } from './dns-lookup'

export const webTools: readonly DefinedTool[] = [
  htmlEntities,
  urlParser,
  deviceInformation,
  otpCodeGeneratorAndValidator,
  userAgentParser,
  safelinkDecoder,
  ipLookup,
  dnsLookup,
]
