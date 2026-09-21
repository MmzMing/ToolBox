import { lazy, Suspense } from 'react'

import { RingLoader } from '@/components/ring-loader'
import { TooltipProvider } from '@/components/ui/tooltip'

// lazy 必须在模块作用域创建：放进渲染期会让每次重渲染换掉组件类型，导致整树重挂载
const ResumeEditorPage = lazy(() => import('@/pages/resume-editor-page'))

/**
 * 简历编辑器的路由元素。
 *
 * 单独成文件是因为 router.tsx 只导出路由表（非组件），
 * 在此放组件会触发 react-refresh/only-export-components 而断掉热更新。
 */
export function ResumeEditorRoute() {
  return (
    // 编辑器挂在 BaseLayout 之外，外壳提供的 TooltipProvider 要自己补一份，
    // 否则任何 Tooltip 都会在渲染期抛错
    <TooltipProvider delayDuration={200}>
      <Suspense
        fallback={
          <div className="flex h-svh items-center justify-center">
            <RingLoader />
          </div>
        }
      >
        <ResumeEditorPage />
      </Suspense>
    </TooltipProvider>
  )
}
