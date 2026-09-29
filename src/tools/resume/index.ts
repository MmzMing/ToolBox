import type { DefinedTool } from '../define-tool'

import { tool as resume } from './resume'
import { tool as salaryCalculator } from './salary-calculator'

export const resumeTools: readonly DefinedTool[] = [resume, salaryCalculator]
