import type { ReactNode } from 'react'

/** dock 浮层的统一外壳：小标题 + 内容，宽度由外层 PopoverContent 决定 */
export function PanelShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs font-medium">{title}</p>
      {children}
    </div>
  )
}
