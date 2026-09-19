import { Container } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'docker-run-to-docker-compose-converter',
  path: '/docker-run-to-docker-compose-converter',
  keywords: [
    'docker',
    'compose',
    'docker-compose',
    'container',
    'yaml',
    'run',
    '容器',
    '编排',
    '转换',
  ],
  icon: Container,
  component: () => import('./DockerRunToDockerComposeConverter'),
  createdAt: '2026-09-19',
})
