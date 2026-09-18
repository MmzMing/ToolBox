import { ThemeProvider } from 'next-themes'
import { RouterProvider } from 'react-router'

import { Toaster } from '@/components/ui/sonner'
import { router } from '@/plugins/router'

/** 应用级 Provider 装配：主题（class 策略）→ 路由 → 全局 Toast */
export function AppProviders() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <RouterProvider router={router} />
      <Toaster position="top-center" />
    </ThemeProvider>
  )
}
