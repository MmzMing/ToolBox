import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * 节点上方浮出的胶囊工具条：悬停即出，选中或正在操作时常驻（可见性由调用方给类名）。
 * 它刻意比节点宽（`w-max` + 居中），所以不能塞进带 overflow-hidden 的节点根里。
 */
export function ActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="bg-card/95 nodrag absolute bottom-full left-1/2 z-20 mb-1.5 flex w-max -translate-x-1/2 items-center gap-1 rounded-full border p-1 shadow-lg backdrop-blur"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  )
}

/**
 * 图标动作按钮。默认吃掉 mousedown：否则按钮先让文本框失焦，失焦即提交，
 * 提交又重挂编辑器，这次点击就打在已被替换的 DOM 上。
 * `iconOnly` 收成纯图标，说明改由 tooltip 给出。
 */
export function ActionButton({
  label,
  icon,
  onClick,
  disabled = false,
  iconOnly = false,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  iconOnly?: boolean
}) {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        'h-6 shrink-0 gap-1 rounded-full text-[10px] font-normal',
        iconOnly ? 'w-6 px-0' : 'px-2',
      )}
      disabled={disabled}
      aria-label={label}
      title={iconOnly ? undefined : label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {icon}
      {iconOnly ? null : <span className="hidden sm:inline">{label}</span>}
    </Button>
  )

  if (!iconOnly) {
    return button
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}
