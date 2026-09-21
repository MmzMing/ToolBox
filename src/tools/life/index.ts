import type { DefinedTool } from '../define-tool'

import { tool as chineseKinshipCalculator } from './chinese-kinship-calculator'
import { tool as fortuneDraw } from './fortune-draw'
import { tool as socialInsuranceCalculator } from './social-insurance-calculator'
import { tool as unitConverter } from './unit-converter'

export const lifeTools: readonly DefinedTool[] = [
  chineseKinshipCalculator,
  fortuneDraw,
  socialInsuranceCalculator,
  unitConverter,
]
