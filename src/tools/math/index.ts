import type { DefinedTool } from '../define-tool'

import { tool as mathEvaluator } from './math-evaluator'
import { tool as etaCalculator } from './eta-calculator'
import { tool as percentageCalculator } from './percentage-calculator'

export const mathTools: readonly DefinedTool[] = [
  mathEvaluator,
  etaCalculator,
  percentageCalculator,
]
