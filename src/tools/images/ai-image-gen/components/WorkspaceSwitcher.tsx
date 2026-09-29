import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image as ImageIcon, Plus, X } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { canvasMapBox, type CanvasMapRect, type WorkspaceSummary } from '../ai-image-gen.service'

/** 指针移开后延迟收起：跨过卡片之间那几像素的间隙，不该把刚展开的列表折回去 */
const CLOSE_DELAY_MS = 160

type WorkspaceSwitcherProps = {
  cards: WorkspaceSummary[]
  activeId: string | null
  onActivate: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
}

/**
 * 左上角的工作区地图栈：一个工作区一张卡片，上层是画布布局的缩放地图，下层是工作区名。
 * 悬停（触屏为点击）当前区即向下展开其他区，底部一个带边框的 + 用于新建。
 */
export function WorkspaceSwitcher({
  cards,
  activeId,
  onActivate,
  onCreate,
  onDelete,
}: WorkspaceSwitcherProps) {
  const { t } = useTranslation('tools-images')
  const [expanded, setExpanded] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const current = cards.find((card) => card.id === activeId)
  const others = useMemo(() => cards.filter((card) => card.id !== activeId), [cards, activeId])

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  const hold = () => {
    clearTimeout(closeTimer.current)
    setExpanded(true)
  }
  const release = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setExpanded(false), CLOSE_DELAY_MS)
  }

  if (!current) {
    return null
  }

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex">
      <div
        className="pointer-events-auto relative w-40"
        onPointerEnter={hold}
        onPointerLeave={release}
        onFocus={hold}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setExpanded(false)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setExpanded(false)
          }
        }}
      >
        <WorkspaceTile
          card={current}
          active
          expanded={expanded}
          name={current.name || t('ai-image-gen.workspace.untitled')}
          onActivate={() => {
            onActivate(current.id)
            // 触屏没有悬停，点自己就是展开/收起的开关
            setExpanded((open) => !open)
          }}
          onDelete={onDelete}
        />
        <div
          className={cn(
            'grid transition-all duration-200 ease-out',
            expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
          )}
        >
          <div className="min-h-0 space-y-1.5 overflow-hidden pt-1.5" inert={!expanded}>
            {others.map((card) => (
              <WorkspaceTile
                key={card.id}
                card={card}
                name={card.name || t('ai-image-gen.workspace.untitled')}
                onActivate={() => onActivate(card.id)}
                onDelete={onDelete}
              />
            ))}
            <button
              type="button"
              onClick={onCreate}
              title={t('ai-image-gen.workspace.new')}
              aria-label={t('ai-image-gen.workspace.new')}
              className="bg-card/90 hover:border-primary/60 flex aspect-[3/2] w-full cursor-pointer items-center justify-center rounded-lg border border-dashed shadow-lg backdrop-blur transition-colors"
            >
              <Plus className="text-muted-foreground size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function WorkspaceTile({
  card,
  name,
  active = false,
  expanded = false,
  onActivate,
  onDelete,
}: {
  card: WorkspaceSummary
  name: string
  active?: boolean
  expanded?: boolean
  onActivate: () => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation('tools-images')
  return (
    <div
      className={cn(
        'group/tile bg-card/90 relative rounded-xl border p-1.5 shadow-lg backdrop-blur transition-colors',
        active ? 'border-primary/60' : 'hover:border-primary/50',
      )}
    >
      <button
        type="button"
        onClick={onActivate}
        aria-expanded={expanded}
        className="block w-full cursor-pointer text-left"
      >
        <span className="relative block aspect-[3/2] overflow-hidden rounded-lg">
          <CanvasMap rects={card.map} />
          {card.activeCount > 0 ? (
            <span
              title={t('ai-image-gen.workspace.running', { count: card.activeCount })}
              className="bg-primary absolute top-1 left-1 size-1.5 animate-pulse rounded-full"
            />
          ) : null}
        </span>
        <span className="mt-1.5 flex items-center gap-1.5 px-0.5">
          <span className="min-w-0 flex-1 truncate text-[11px] leading-4 font-medium">{name}</span>
          <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
            {t('ai-image-gen.workspace.imageCount', { count: card.imageCount })}
          </span>
        </span>
      </button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="bg-background/80 absolute top-2.5 right-2.5 z-10 size-6 rounded-md border opacity-0 shadow-sm transition-opacity group-hover/tile:opacity-100 focus-visible:opacity-100"
            aria-label={t('ai-image-gen.workspace.close')}
          >
            <X className="size-3" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('ai-image-gen.workspace.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('ai-image-gen.workspace.deleteConfirmDesc', {
                name,
                count: card.imageCount,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('ai-image-gen.workspace.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => onDelete(card.id)}>
              {t('ai-image-gen.workspace.deleteConfirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** 画布布局的缩放示意图：底色跟画布同源，虚线框圈出节点并集，让一格缩略图读得出「内容在哪」 */
function CanvasMap({ rects }: { rects: CanvasMapRect[] }) {
  const box = useMemo(() => canvasMapBox(rects), [rects])
  if (!box) {
    return (
      <span className="bg-background text-muted-foreground absolute inset-0 flex items-center justify-center rounded-lg">
        <ImageIcon className="size-5 opacity-40" />
      </span>
    )
  }
  // viewBox 是几百到几千的画布坐标，线宽与圆角必须按画幅取单位，写死 1px 会细到看不见
  const unit = Math.max(box.width, box.height) / 100
  // 虚线框落在并集外留半格余量：贴着节点画会把它们咬掉一圈
  const inset = box.pad * 0.6
  return (
    <svg
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="bg-background size-full rounded-lg"
      aria-hidden
    >
      <rect
        x={box.x + inset}
        y={box.y + inset}
        width={box.width - inset * 2}
        height={box.height - inset * 2}
        rx={unit * 1.4}
        className="stroke-foreground/50 fill-none"
        strokeWidth={unit * 0.5}
        strokeDasharray={`${unit * 2.4} ${unit * 1.8}`}
      />
      {rects.map((rect, index) => (
        <rect
          key={`${index}:${rect.x}:${rect.y}`}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          rx={unit * 1.4}
          className="stroke-border fill-muted-foreground/45"
          strokeWidth={unit * 0.5}
        />
      ))}
    </svg>
  )
}
