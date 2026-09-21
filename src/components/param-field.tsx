import type { ReactNode } from 'react'

import { Label } from '@/components/ui/label'

interface ParamFieldProps {
  label: string
  /** 标签行右侧的当前值或说明，如「256 px」「M - 中（15%）」 */
  hint?: string
  htmlFor?: string
  children: ReactNode
}

/** 参数卡片里的一行：标签在左、当前值在右，控件占满下方 */
export function ParamField({ label, hint, htmlFor, children }: ParamFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-muted-foreground text-xs">
          {label}
        </Label>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
