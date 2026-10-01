import { ResumeIcon } from '@/components/icons/resume-icon'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'resume',
  path: '/resume',
  keywords: ['resume', 'cv', 'curriculum vitae', '简历', '履历', '求职', '模板', 'pdf', '导出'],
  icon: ResumeIcon,
  component: () => import('./Resume'),
  createdAt: '2026-09-19',
})
