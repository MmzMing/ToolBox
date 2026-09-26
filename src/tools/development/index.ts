import type { DefinedTool } from '../define-tool'

import { tool as crontabGenerator } from './crontab-generator'
import { tool as curlGenerator } from './curl-generator'
import { tool as chmodCalculator } from './chmod-calculator'
import { tool as dockerRunToDockerComposeConverter } from './docker-run-to-docker-compose-converter'
import { tool as formatStudio } from './format-studio'
import { tool as githubAccelerator } from './github-accelerator'
import { tool as encoderDecoder } from './encoder-decoder'
import { tool as colorConverter } from './color-converter'
import { tool as dateTimeConverter } from './date-time-converter'

export const developmentTools: readonly DefinedTool[] = [
  formatStudio,
  encoderDecoder,
  crontabGenerator,
  curlGenerator,
  chmodCalculator,
  dockerRunToDockerComposeConverter,
  githubAccelerator,
  colorConverter,
  dateTimeConverter,
]
