import type { DefinedTool } from '../define-tool'

import { tool as crontabGenerator } from './crontab-generator'
import { tool as chmodCalculator } from './chmod-calculator'
import { tool as dockerRunToDockerComposeConverter } from './docker-run-to-docker-compose-converter'
import { tool as codeFormatter } from './code-formatter'

export const developmentTools: readonly DefinedTool[] = [
  codeFormatter,
  crontabGenerator,
  chmodCalculator,
  dockerRunToDockerComposeConverter,
]
