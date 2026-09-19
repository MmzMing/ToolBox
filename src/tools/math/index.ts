import type { DefinedTool } from '../define-tool'

import { tool as mathEvaluator } from './math-evaluator'
import { tool as etaCalculator } from './eta-calculator'
import { tool as percentageCalculator } from './percentage-calculator'
import { tool as chronometer } from './chronometer'
import { tool as temperatureConverter } from './temperature-converter'
import { tool as benchmarkBuilder } from './benchmark-builder'

export const mathTools: readonly DefinedTool[] = [
  mathEvaluator,
  etaCalculator,
  percentageCalculator,
  chronometer,
  temperatureConverter,
  benchmarkBuilder,
]
