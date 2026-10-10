import { Suspense, useEffect, useRef } from 'react'

import { ToolLayout } from '@/layouts/tool-layout'
import { useToolsStore } from '@/stores/tools.store'
import type { Tool } from '@/tools/define-tool'

/** 工具路由统一入口：记录最近使用（常用工具）+ 懒加载工具组件 */
export default function ToolPage({ tool }: { tool: Tool }) {
  const recordVisit = useToolsStore((state) => state.recordVisit)
  const lastRecordedPath = useRef<string | null>(null)

  useEffect(() => {
    if (lastRecordedPath.current !== tool.path) {
      lastRecordedPath.current = tool.path
      recordVisit(tool.path)
    }
  }, [tool.path, recordVisit])

  const ToolComponent = tool.lazyComponent

  // fallback 留空：切页手感交给 AppShell 的显影层，这里不再插一块转圈占位
  return (
    <ToolLayout tool={tool} fill={tool.immersive} wide={tool.wide}>
      <Suspense fallback={null}>
        <ToolComponent />
      </Suspense>
    </ToolLayout>
  )
}
