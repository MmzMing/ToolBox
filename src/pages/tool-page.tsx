import { Suspense, useEffect, useRef } from 'react'

import { RingLoader } from '@/components/ring-loader'
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

  return (
    <ToolLayout tool={tool} fill={tool.immersive}>
      <Suspense fallback={<ToolLoading />}>
        <ToolComponent />
      </Suspense>
    </ToolLayout>
  )
}

function ToolLoading() {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <RingLoader />
    </div>
  )
}
