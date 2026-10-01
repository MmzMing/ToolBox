import type { DefinedTool } from '../define-tool'

import { tool as barbecuePlanner } from './barbecue-planner'
import { tool as chineseKinshipCalculator } from './chinese-kinship-calculator'
import { tool as fortuneDraw } from './fortune-draw'
import { tool as unitConverter } from './unit-converter'

export const lifeTools: readonly DefinedTool[] = [
  barbecuePlanner,
  chineseKinshipCalculator,
  fortuneDraw,
  unitConverter,
]
