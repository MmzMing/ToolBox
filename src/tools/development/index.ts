import type { DefinedTool } from '../define-tool'

import { tool as crontabGenerator } from './crontab-generator'
import { tool as chmodCalculator } from './chmod-calculator'
import { tool as dockerRunToDockerComposeConverter } from './docker-run-to-docker-compose-converter'
import { tool as regexTester } from './regex-tester'
import { tool as regexMemo } from './regex-memo'
import { tool as codeFormatter } from './code-formatter'
import { tool as gitMemo } from './git-memo'

export const developmentTools: readonly DefinedTool[] = [
  codeFormatter,
  crontabGenerator,
  chmodCalculator,
  dockerRunToDockerComposeConverter,
  regexTester,
  regexMemo,
  gitMemo,
]
