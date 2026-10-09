import type { ComponentType, KeyboardEvent, SVGProps } from 'react'
import { Link } from 'react-router'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { dockItemClass } from '@/components/pill-styles'

type DockButtonProps = {
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  active: boolean
  /** 有 href 时渲染真链接（首页键），否则渲染按钮（分类键开的是浮层，没有 URL） */
  href?: string
  /** disclosure 模式播报展开态；不传表示这个键不控制任何浮层 */
  expanded?: boolean
  /** 分类键悬停就出浮层，再叠一层 tooltip 是重复信息；只有首页键还需要提示 */
  withTooltip?: boolean
  tabIndex?: number
  tooltipSide?: 'right' | 'top'
  onActivate?: () => void
  onHover?: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void
  /** 链接与按钮两种宿主元素共用一个回调，省掉一次 Ref 类型体操 */
  onNode?: (node: HTMLElement | null) => void
}

/**
 * dock 上的单个图标键：44px 圆形触控目标 + 悬停灰底。
 *
 * 选中背板是每颗键自己的静态背景，不用 motion 的 layoutId 共享元素——
 * 共享元素在 activeKey 跳变时会先把旧背板投影回原位再飞过来，表现为一下抖动。
 */
export function DockButton({
  label,
  icon: Icon,
  active,
  href,
  expanded = false,
  withTooltip = false,
  tabIndex,
  tooltipSide = 'right',
  onActivate,
  onHover,
  onKeyDown,
  onNode,
}: DockButtonProps) {
  const shared = {
    className: dockItemClass(active),
    'aria-label': label,
    tabIndex,
    onPointerEnter: onHover,
    onKeyDown,
    ref: (node: HTMLElement | null) => onNode?.(node),
  }
  const item =
    href === undefined ? (
      <button type="button" onClick={onActivate} aria-expanded={expanded} {...shared}>
        <Icon className="size-5" />
      </button>
    ) : (
      <Link to={href} onClick={onActivate} {...shared}>
        <Icon className="size-5" />
      </Link>
    )

  if (!withTooltip) {
    return item
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{item}</TooltipTrigger>
      <TooltipContent side={tooltipSide}>{label}</TooltipContent>
    </Tooltip>
  )
}
