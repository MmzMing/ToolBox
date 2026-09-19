import { ThemeProvider } from '@/modules/theme/theme-provider'
import { RouterProvider } from 'react-router'

import { Toaster } from '@/components/ui/sonner'
import { router } from '@/plugins/router'

/** 应用级 Provider 装配：主题（class 策略）→ 路由 → 全局 Toast */
export function AppProviders() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
      <Toaster position="top-center" />
    </ThemeProvider>
  )
}
