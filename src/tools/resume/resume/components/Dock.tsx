import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export function Dock({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'bg-background/80 border-border/40 flex flex-col items-center gap-2 rounded-xl border p-2 shadow-xl backdrop-blur-md',
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
  const shell = cn(
    'rounded-sm shadow-sm',
    active
      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
      : 'bg-background text-foreground hover:bg-muted',
  )

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
