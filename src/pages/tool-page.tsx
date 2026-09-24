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
  // 撑到视口六成高，圆环才会落在页面垂直中部。原来只有 min-h-64（256px），
  // 扣掉布局顶栏与工具页头部后，圆环停在描述正下方、看着贴顶。
  // 取值按「顶栏 56 + 工具页头部/描述/留白 ≈ 115」估：60svh 上下时圆心约在视口 49% 处；
  // 用 svh 不用 vh，移动端地址栏伸缩时不会跟着跳。
  return (
    <div className="flex min-h-[60svh] items-center justify-center">
      <RingLoader />
    </div>
  )
}
