import { useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  applyTheme,
  normalizeTheme,
  STORAGE_KEY,
  systemPrefersDark,
  ThemeContext,
  type ThemeContextValue,
  type ThemeValue,
} from './theme-context'

/**
 * 轻量主题 Provider（替代 next-themes 库）：纯 SPA 里 next-themes 渲染的内联脚本
 * 不会被执行（React 19 会告警），防闪烁脚本改由 index.html 提供，本 Provider 只负责
 * 运行时切换与系统偏好监听。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeValue>(() =>
    normalizeTheme(localStorage.getItem(STORAGE_KEY)),
  )
  const [systemDark, setSystemDark] = useState(() => systemPrefersDark())

  useEffect(() => {
    if (theme !== 'system') {
      return
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])

  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    applyTheme(resolvedTheme)
  }, [resolvedTheme])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme: (next) => {
        localStorage.setItem(STORAGE_KEY, next)
        setThemeState(next)
      },
    }),
    [theme, resolvedTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
