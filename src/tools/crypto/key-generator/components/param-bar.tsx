import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * 参数栏：控件按内容取宽、从左到右排，装不下就整块换行。
 * 不用等分网格——网格会让窄控件（位数、开关）撑出大片空白，长控件（滑杆）又被压到没法推准。
 */
export function ParamBar({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-wrap items-end gap-x-6 gap-y-4">{children}</div>
}

/** 参数栏里的一个槽位：`className` 负责取宽（w-56 / grow / min-w-64），不写就是内容自然宽 */
export function ParamSlot({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('min-w-0', className)}>{children}</div>
}

/** 把动作按钮顶到行尾，与参数之间留白，读起来才是「参数 …… 执行」 */
export function BarAction({ children }: { children: ReactNode }) {
  return <div className="ml-auto flex shrink-0 items-center gap-2 self-end">{children}</div>
}
