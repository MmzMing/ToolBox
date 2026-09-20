import { motion } from 'motion/react'
import { useState, type ComponentType, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export function Dock({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        // 13 个键位约 500px 高，矮屏笔记本会顶出视口，这里滚动而不是压缩键位
        'bg-background/80 border-border/40 flex max-h-[calc(100svh-7rem)] [scrollbar-width:none] flex-col items-center gap-2 overflow-y-auto rounded-xl border p-2 shadow-xl backdrop-blur-md [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function DockDivider() {
  return <div className="bg-border h-px w-6" />
}

const dockShell = (active: boolean | undefined) =>
  cn(
    'rounded-sm shadow-sm transition-transform',
    active
      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
      : 'bg-background text-foreground hover:bg-muted',
  )

type DockIconProps = {
  label: string
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  /** 有 onClick 时这里是图标；否则 children 必须自带可聚焦的触发元素 */
  children: ReactNode
}

/**
 * 单个 dock 键位。
 *
 * 拆成两种形态是因为「切换模板」「导出」本身就是带 Dialog/Sheet 触发器的组件，
 * 再套一层 Button 会渲染出嵌套按钮。那种形态下 children 的根节点是 Sheet/Dialog
 * 本身，TooltipTrigger asChild 透传的指针事件会被它吃掉，所以中间要垫一个真实的
 * DOM 节点接事件（指针事件从内部按钮冒泡上来照样能触发提示）。
 */
export function DockIcon({ label, active, disabled, onClick, children }: DockIconProps) {
  const shell = dockShell(active)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.95 }}>
          {onClick ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label={label}
              onClick={onClick}
              className={cn(shell, 'hover:bg-muted')}
            >
              {children}
            </Button>
          ) : (
            <span className="inline-flex">{children}</span>
          )}
        </motion.div>
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

type DockPopoverKeyProps = {
  label: string
  icon: ComponentType<{ className?: string }>
  /** 受控：dock 用同一个 state 管所有键位，保证同一时刻只开一个浮层 */
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

/**
 * 点开浮层面板的 dock 键位。
 *
 * 不用 motion.div 包按钮：`PopoverTrigger asChild` 要把指针与 aria 透传到真正的
 * 按钮上，中间垫一层 div 会让键盘（Enter / Space）打不开浮层。缩放改用等效的
 * CSS transform，视觉与 DockIcon 的动效一致。
 */
export function DockPopoverKey({
  label,
  icon: Icon,
  open,
  onOpenChange,
  children,
}: DockPopoverKeyProps) {
  const [tooltipOpen, setTooltipOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {/* 浮层开着时把提示压掉，否则提示气泡会和浮层叠在一起。Tooltip 全程受控，
          用 open={open ? false : undefined} 会让它在受控/非受控间切换并告警 */}
      <Tooltip open={tooltipOpen && !open} onOpenChange={(next) => !open && setTooltipOpen(next)}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              className={cn(dockShell(open), 'hover:scale-115 active:scale-95')}
            >
              <Icon className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={10}>
          {label}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        side="left"
        align="end"
        sideOffset={10}
        className="flex w-80 flex-col gap-3 p-4"
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}
