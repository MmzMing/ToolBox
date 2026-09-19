import type { DefinedTool } from '../define-tool'

import { tool as crontabGenerator } from './crontab-generator'
import { tool as chmodCalculator } from './chmod-calculator'
import { tool as dockerRunToDockerComposeConverter } from './docker-run-to-docker-compose-converter'
import { tool as codeFormatter } from './code-formatter'
import { tool as githubAccelerator } from './github-accelerator'
import { tool as encoderDecoder } from './encoder-decoder'
import { tool as formatConverter } from './format-converter'
import { tool as caseConverter } from './case-converter'
import { tool as colorConverter } from './color-converter'
import { tool as dateTimeConverter } from './date-time-converter'
import { tool as listConverter } from './list-converter'

export const developmentTools: readonly DefinedTool[] = [
  codeFormatter,
  encoderDecoder,
  formatConverter,
  crontabGenerator,
  chmodCalculator,
  dockerRunToDockerComposeConverter,
  githubAccelerator,
  caseConverter,
  colorConverter,
  dateTimeConverter,
  listConverter,
]
