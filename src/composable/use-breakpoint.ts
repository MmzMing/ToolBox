import { useEffect, useState } from 'react'

/** 响应式断点（与 agent.md §6 约定一致）：手机 <720、平板 720–1279、PC >=1280 */
export const BREAKPOINTS = { tablet: 720, desktop: 1280 } as const

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

function computeBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINTS.desktop) {
    return 'desktop'
  }
  if (width >= BREAKPOINTS.tablet) {
    return 'tablet'
  }
  return 'mobile'
}

function subscribe(callback: () => void): () => void {
  const mediaQueries = [
    window.matchMedia(`(min-width: ${BREAKPOINTS.tablet}px)`),
    window.matchMedia(`(min-width: ${BREAKPOINTS.desktop}px)`),
  ]
  mediaQueries.forEach((query) => query.addEventListener('change', callback))
  return () => mediaQueries.forEach((query) => query.removeEventListener('change', callback))
}

export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() => computeBreakpoint(window.innerWidth))

  useEffect(() => {
    const update = () => setBreakpoint(computeBreakpoint(window.innerWidth))
    update()
    return subscribe(update)
  }, [])

  return breakpoint
}

export function useIsMobile(): boolean {
  return useBreakpoint() === 'mobile'
}
