import { createContext, useContext } from 'react'

export type ThemeValue = 'light' | 'dark' | 'system'

/** 与 index.html 的防闪烁脚本使用同一个存储键与 class 策略 */
export const STORAGE_KEY = 'theme'

export interface ThemeContextValue {
  theme: ThemeValue
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: ThemeValue) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function normalizeTheme(value: string | null): ThemeValue {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

/** 主题键点一下走一档的循环顺序；跟随系统留在环里，否则默认档的用户点一次就再也回不去 */
const NEXT_THEME: Record<ThemeValue, ThemeValue> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
}

export function nextTheme(current: ThemeValue): ThemeValue {
  return NEXT_THEME[current]
}

export function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyTheme(theme: ThemeValue): 'light' | 'dark' {
  const resolved = theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  return resolved
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
