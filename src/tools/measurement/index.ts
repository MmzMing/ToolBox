import type { DefinedTool } from '../define-tool'

import { tool as chronometer } from './chronometer'
import { tool as temperatureConverter } from './temperature-converter'
import { tool as benchmarkBuilder } from './benchmark-builder'

export const measurementTools: readonly DefinedTool[] = [
  chronometer,
  temperatureConverter,
  benchmarkBuilder,
]
