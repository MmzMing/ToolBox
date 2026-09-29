import { Fragment, memo } from 'react'

import { cn } from '@/lib/utils'
import type { Rect } from '../image-stack.service'
import {
  blurRadiusOf,
  captionAnchor,
  captionText,
  CAPTION_FONT,
  longFillBox,
  shadowAlpha,
  type LongBand,
  type LongLayout,
  type LongStyle,
} from '../long-stack.service'

/** imageId → 缩略图与原文件名；角标要用名字 */
export type LongBandSource = { url: string; name: string }

/**
 * 按 displayScale 把整条长图画成一列绝对定位的裁切带，视口与右侧缩览共用这一个组件。
 *
 * 带子里那张 `<img>` 的位移全是百分比 —— 整图多高、往上挪多少都相对带子自身，
 * 所以 scale 怎么变都不需要重算裁切。模糊补白、圆角、阴影、角标也都按同一份
 * `resolveLongLayout` 摆位：预览与导出只在渲染手段上不同，几何一模一样。
 */
export const LongBands = memo(function LongBands({
  layout,
  style,
  scale,
  sources,
  selection = null,
  onPick,
}: {
  layout: LongLayout
  style: LongStyle
  scale: number
  sources: ReadonlyMap<string, LongBandSource>
  selection?: string | null
  onPick?: (imageId: string) => void
}) {
  const radius = Math.min(style.canvasRadius * scale, Math.min(layout.width, layout.height))

  return (
    <div
      className="relative shrink-0 overflow-hidden"
      style={{
        width: layout.width * scale,
        height: layout.height * scale,
        borderRadius: radius > 0 ? radius : undefined,
        backgroundColor: style.background.type === 'color' ? style.background.value : undefined,
      }}
    >
      {layout.bands.map((band, index) => {
        const source = sources.get(band.imageId)
        // 补白要先进 DOM 才有压在下面的层序
        const fill = style.narrowFill === 'blur' ? longFillBox(band, layout) : null
        return (
          <Fragment key={band.imageId}>
            {fill && source ? <BlurFill box={fill} url={source.url} scale={scale} /> : null}
            <Band
              band={band}
              index={index}
              layout={layout}
              style={style}
              scale={scale}
              source={source}
              selected={selection === band.imageId}
              onPick={onPick}
            />
          </Fragment>
        )
      })}
    </div>
  )
})

/** 窄图两侧的补白：这张图自己放大裁切、模糊、铺满整条内容区 */
function BlurFill({ box, url, scale }: { box: Rect; url: string; scale: number }) {
  const blur = blurRadiusOf(box.width)
  // 模糊会把边缘羽化掉，所以往外多铺两倍半径再裁回盒子（与 canvas 那份同参数）
  const bleed = blur * 2 * scale
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute overflow-hidden"
      style={{
        left: box.x * scale,
        top: box.y * scale,
        width: box.width * scale,
        height: box.height * scale,
      }}
    >
      <img
        src={url}
        alt=""
        draggable={false}
        className="absolute object-cover"
        style={{
          left: -bleed,
          top: -bleed,
          width: `calc(100% + ${bleed * 2}px)`,
          height: `calc(100% + ${bleed * 2}px)`,
          filter: `blur(${blur * scale}px)`,
        }}
      />
    </div>
  )
}

function Band({
  band,
  index,
  layout,
  style,
  scale,
  source,
  selected,
  onPick,
}: {
  band: LongBand
  index: number
  layout: LongLayout
  style: LongStyle
  scale: number
  source: LongBandSource | undefined
  selected: boolean
  onPick?: (imageId: string) => void
}) {
  const { rect } = band
  const bandRadius = Math.min(style.bandRadius * scale, Math.min(rect.width, rect.height) / 2)
  const caption = style.caption.enabled ? style.caption : null
  const text =
    caption && source ? captionText(caption.text, index, layout.bands.length, source.name) : ''
  const anchor = caption ? captionAnchor(band, caption) : null

  return (
    <div
      role={onPick ? 'button' : undefined}
      tabIndex={onPick ? 0 : undefined}
      aria-pressed={onPick ? selected : undefined}
      onClick={onPick ? () => onPick(band.imageId) : undefined}
      onKeyDown={
        onPick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onPick(band.imageId)
              }
            }
          : undefined
      }
      className={cn(
        'bg-muted/60 absolute overflow-hidden',
        onPick && 'cursor-pointer',
        selected && 'ring-primary ring-2 ring-inset',
      )}
      style={{
        left: rect.x * scale,
        top: rect.y * scale,
        width: rect.width * scale,
        height: rect.height * scale,
        borderRadius: bandRadius > 0 ? bandRadius : undefined,
        boxShadow:
          style.shadow.blur > 0
            ? `0 ${style.shadow.offsetY * scale}px ${style.shadow.blur * scale}px rgba(15, 23, 42, ${shadowAlpha(style.shadow)})`
            : undefined,
      }}
    >
      {source ? (
        <img
          src={source.url}
          alt=""
          draggable={false}
          className="pointer-events-none absolute left-0 w-full select-none"
          style={{
            height: `${(band.sourceImageHeight / band.sourceHeight) * 100}%`,
            top: `-${(band.sourceTop / band.sourceHeight) * 100}%`,
          }}
        />
      ) : null}
      {caption && anchor && text ? (
        <span
          className="pointer-events-none absolute font-semibold"
          style={{
            left: anchor.align === 'left' ? anchor.x * scale : undefined,
            right: anchor.align === 'right' ? (layout.width - anchor.x) * scale : undefined,
            top: anchor.baseline === 'top' ? anchor.y * scale : undefined,
            bottom: anchor.baseline === 'bottom' ? (layout.height - anchor.y) * scale : undefined,
            fontSize: caption.size * scale,
            color: caption.color,
            fontFamily: CAPTION_FONT,
            textShadow: `0 0 ${Math.max(2, caption.size * scale * 0.2)}px rgba(0, 0, 0, 0.6)`,
          }}
        >
          {text}
        </span>
      ) : null}
    </div>
  )
}
