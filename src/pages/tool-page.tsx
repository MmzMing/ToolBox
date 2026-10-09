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
    <ToolLayout tool={tool} fill={tool.immersive} wide={tool.wide}>
      <Suspense fallback={<ToolLoading />}>
        <ToolComponent />
      </Suspense>
    </ToolLayout>
  )
}

function ToolLoading() {
  // app-shell 下 `<main>` 是唯一的滚动容器，`h-full` 就能铺满一屏；非沉浸页拿不到
  // 确定高度时退回 40svh 兜底，避免占位块把 main 撑出第二条滚动条。
  return (
    <div className="flex h-full min-h-[40svh] items-center justify-center">
      <RingLoader />
    </div>
  )
}
