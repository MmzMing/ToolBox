import { createContext, useCallback, useContext, useSyncExternalStore } from 'react'
import { useLocation, type DataRouter } from 'react-router'

// 由 AppProviders 注入：布局直接 import plugins/router 会与路由表成环，dev 热更新退化成整页刷新
export const RouterInstanceContext = createContext<DataRouter | null>(null)

function useRouterInstance(): DataRouter {
  const router = useContext(RouterInstanceContext)
  if (!router) {
    throw new Error('useRouterInstance must be used within RouterInstanceContext')
  }
  return router
}

/** 路由器已切到新地址、页面还停在旧页（切页 transition 挂起）时返回新地址的 key，否则 null */
export function usePendingNavigationKey(): string | null {
  const router = useRouterInstance()
  const committedKey = useLocation().key
  const subscribe = useCallback((onChange: () => void) => router.subscribe(onChange), [router])
  const latestKey = useSyncExternalStore(subscribe, () => router.state.location.key)
  return latestKey === committedKey ? null : latestKey
}
