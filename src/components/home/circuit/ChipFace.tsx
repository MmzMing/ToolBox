import type { ComponentType, SVGProps } from 'react'

type ChipFaceProps = {
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  /** 分类色（`var(--circuit-N)`），四角支架从它取色 */
  color: string
  /** 图标边长，cqw 或 px 都行——原件与飞行克隆体各按自己的坐标系给 */
  iconSize: string
  fontSize: string
}

/** 四角支架的落位：只画四个角的折线，中间全部留空 */
const CORNERS = [
  'left-0 top-0 border-t-2 border-l-2 rounded-tl-lg',
  'right-0 top-0 border-t-2 border-r-2 rounded-tr-lg',
  'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg',
  'bottom-0 right-0 border-b-2 border-r-2 rounded-br-lg',
] as const

/**
 * 芯片的「脸」：四角一圈折线压着中间的图标与名字，除此之外什么都不画。
 *
 * 底板是宿主自己的事（版图上的 button 与飞行克隆体都铺 `bg-card`，与展开卡片同一张表面），
 * 这样充电背光才压得住底板、又不至于被底板盖掉。
 * 版图上那颗可点的芯片与飞向核心的克隆体共用这一份外观，两边才不会在交接瞬间露馅。
 * 要求宿主是 `relative` 且已铺满目标尺寸，本组件只画内容、不管定位与交互。
 */
export function ChipFace({ label, Icon, color, iconSize, fontSize }: ChipFaceProps) {
  return (
    <>
      {CORNERS.map((corner) => (
        <span
          key={corner}
          aria-hidden="true"
          className={`chip-corner pointer-events-none absolute h-[32%] w-[26%] border-current ${corner}`}
        />
      ))}

      <span className="relative flex size-full flex-col items-center justify-center">
        <span style={{ width: iconSize, height: iconSize, color }}>
          <Icon className="size-full" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span
          className="text-foreground mt-[6%] w-full truncate px-[10%] text-center font-medium"
          style={{ fontSize, lineHeight: 1.25 }}
        >
          {label}
        </span>
      </span>
    </>
  )
}
