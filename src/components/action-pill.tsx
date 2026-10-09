import type { ButtonHTMLAttributes, ComponentType, ReactNode, Ref, SVGProps } from 'react'
import { Link } from 'react-router'

import { pillClass } from '@/components/pill-styles'
import { cn } from '@/lib/utils'

/**
 * 文字段用 0fr → 1fr 的 grid 轨道做展开：能过渡到 auto 宽度，
 * 于是相邻胶囊会被真实地挤开、而不是叠在一起。
 *
 * 轨道收起时必须真的到 0，所以被裁切的这一层不能带 padding——
 * border-box 下 padding 是宽度的下限，会让胶囊收起态右侧多出 8px、圆不成圆。
 * 间距写在更里面一层，跟着文字一起被裁掉。
 */
const expandingClass = cn(
  'grid shrink-0 [grid-template-columns:0fr] transition-[grid-template-columns] duration-300 ease-out',
  'group-hover:[grid-template-columns:1fr] group-focus-visible:[grid-template-columns:1fr]',
  'group-data-[state=open]:[grid-template-columns:1fr] group-data-[state=checked]:[grid-template-columns:1fr]',
  'motion-reduce:transition-none',
)

type PillOwnProps = {
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  /** 常驻在图标右侧、不参与展开的内容（如 ⌘K 键帽） */
  persistent?: ReactNode
  /** 手机底部 dock：只留图标，触屏没有 hover，展开会卡在文字态 */
  iconOnly?: boolean
}

/**
 * 顶栏操作胶囊按钮：平时只露图标，悬停 / 聚焦 / 菜单展开时在图标右侧长出文字，
 * 并把相邻胶囊往两边推开。取代了原来的 Tooltip。
 *
 * 必须把没声明的 props 原样转发到 `<button>` 上：语言与主题下拉是用
 * `DropdownMenuTrigger asChild` 套它的，Radix 注入的 onPointerDown / aria-haspopup /
 * data-state 一旦在这里被丢掉，菜单就再也打不开了。
 */
type ActionPillProps = PillOwnProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
    ref?: Ref<HTMLButtonElement>
  }

export function ActionPill({
  label,
  icon: Icon,
  persistent,
  iconOnly = false,
  className,
  ...rest
}: ActionPillProps) {
  return (
    <button type="button" aria-label={label} {...rest} className={cn(pillClass, className)}>
      <PillInner label={label} Icon={Icon} persistent={persistent} iconOnly={iconOnly} />
    </button>
  )
}

/** 站外链用 href、站内路由用 to，二者必居其一，所以做成判别联合而不是两个可选字段 */
type PillLinkProps = PillOwnProps & {
  className?: string
  onNavigate?: () => void
} & ({ href: string; to?: undefined } | { to: string; href?: undefined })

/** 同款外观的链接版（博客 / 关于 / GitHub），不需要 Radix 注入所以与按钮分开 */
export function PillLink({
  label,
  icon: Icon,
  persistent,
  iconOnly = false,
  href,
  to,
  className,
  onNavigate,
}: PillLinkProps) {
  const classes = cn(pillClass, className)
  const inner = <PillInner label={label} Icon={Icon} persistent={persistent} iconOnly={iconOnly} />

  return href === undefined ? (
    <Link to={to} aria-label={label} className={classes} onClick={onNavigate}>
      {inner}
    </Link>
  ) : (
    <a href={href} target="_blank" rel="noreferrer" aria-label={label} className={classes}>
      {inner}
    </a>
  )
}

function PillInner({
  label,
  Icon,
  persistent,
  iconOnly,
}: {
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  persistent?: ReactNode
  iconOnly: boolean
}) {
  return (
    <>
      <Icon className="size-5 shrink-0" />
      {persistent !== undefined && (
        <span className="flex shrink-0 items-center ps-2">{persistent}</span>
      )}
      {!iconOnly && (
        <span className={expandingClass}>
          <span className="min-w-0 overflow-hidden">
            <span className="ps-2 pe-1 whitespace-nowrap">{label}</span>
          </span>
        </span>
      )}
    </>
  )
}
