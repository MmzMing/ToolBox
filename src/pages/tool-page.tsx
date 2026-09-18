import { Suspense, useEffect, useRef } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
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
    <ToolLayout tool={tool}>
      <Suspense fallback={<ToolSkeleton />}>
        <ToolComponent />
      </Suspense>
    </ToolLayout>
  )
}

function ToolSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
