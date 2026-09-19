import type { DefinedTool } from '../define-tool'

import { tool as jsonViewer } from './json-viewer'
import { tool as jsonMinify } from './json-minify'
import { tool as jsonToCsv } from './json-to-csv'
import { tool as sqlPrettify } from './sql-prettify'
import { tool as xmlFormatter } from './xml-formatter'
import { tool as yamlViewer } from './yaml-viewer'
import { tool as crontabGenerator } from './crontab-generator'
import { tool as chmodCalculator } from './chmod-calculator'
import { tool as dockerRunToDockerComposeConverter } from './docker-run-to-docker-compose-converter'
import { tool as emailNormalizer } from './email-normalizer'
import { tool as regexTester } from './regex-tester'
import { tool as regexMemo } from './regex-memo'
import { tool as gitMemo } from './git-memo'
import { tool as randomPortGenerator } from './random-port-generator'

export const developmentTools: readonly DefinedTool[] = [
  jsonViewer,
  jsonMinify,
  jsonToCsv,
  sqlPrettify,
  xmlFormatter,
  yamlViewer,
  crontabGenerator,
  chmodCalculator,
  dockerRunToDockerComposeConverter,
  emailNormalizer,
  regexTester,
  regexMemo,
  gitMemo,
  randomPortGenerator,
]
