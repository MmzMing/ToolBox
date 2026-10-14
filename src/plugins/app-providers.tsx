import { ThemeProvider } from '@/modules/theme/theme-provider'
import { RouterProvider } from 'react-router'

import { Toaster } from '@/components/ui/sonner'
import { RouterInstanceContext } from '@/composable/use-pending-navigation'
import { router } from '@/plugins/router'

/** 应用级 Provider 装配：主题（class 策略）→ 路由 → 全局 Toast */
export function AppProviders() {
  return (
    <ThemeProvider>
      <RouterInstanceContext.Provider value={router}>
        <RouterProvider router={router} />
      </RouterInstanceContext.Provider>
      <Toaster position="top-center" />
    </ThemeProvider>
  )
}
