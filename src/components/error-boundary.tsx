import { Component } from 'react'
import { useTranslation } from 'react-i18next'
import type { ErrorInfo, ReactNode } from 'react'

import { Button } from '@/components/ui/button'

type ErrorBoundaryProps = { children: ReactNode }

type ErrorBoundaryState = { crashed: boolean }

/**
 * 应用级崩溃兜底。
 *
 * 路由的 errorElement 只覆盖 BaseLayout 之下的后代：布局自身、或工具模块在
 * React 之外抛错时，整棵 SPA 会被卸载成白屏，用户既看不到原因也退不出去。
 * React 没有等价的 hook，边界只能是类组件。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { crashed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { crashed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[app-crash]', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.crashed) {
      return <CrashFallback />
    }

    return this.props.children
  }
}

function CrashFallback() {
  const { t } = useTranslation('common')

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex flex-col gap-2">
        <p className="font-medium">{t('crashTitle')}</p>
        <p className="text-muted-foreground text-sm">{t('crashDescription')}</p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => window.location.reload()}>{t('reload')}</Button>
        {/* 整页跳转而不是 <Link>：崩溃可能正是路由层抛的，客户端导航未必还可用 */}
        <Button variant="outline" onClick={() => window.location.assign('/')}>
          {t('backHome')}
        </Button>
      </div>
    </div>
  )
}
