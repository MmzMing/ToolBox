import type { ReactNode } from 'react'

import { Label } from '@/components/ui/label'

interface ParamFieldProps {
  label: string
  /** 标签行右侧的当前值或说明，如「256 px」「M - 中（15%）」 */
  hint?: string
  htmlFor?: string
  /** 开关、二选一这类窄控件：文字在左、控件在右，挤成一行 */
  inline?: boolean
  children?: ReactNode
}

/** 参数卡片里的一行：标签在左、当前值在右，控件占满下方；inline 时控件直接跟在右侧 */
export function ParamField({ label, hint, htmlFor, inline, children }: ParamFieldProps) {
  if (inline) {
    return (
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-muted-foreground text-xs">
          {label}
        </Label>
        <div className="flex items-center gap-2">
          {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
          {children}
        </div>
      </div>
    )
  }

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
