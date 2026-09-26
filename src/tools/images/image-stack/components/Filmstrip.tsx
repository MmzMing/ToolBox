import { AlertCircle, ImagePlus, Shuffle, Trash2 } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { isReady, type AssetItem } from '../assets'
import { IMAGE_DRAG_MIME, useImageStackStore } from '../store'

/**
 * 素材条：缩略图走原生拖拽 —— 落到画布单元格即落位，落到别的缩略图上即重排。
 * 不用 dnd-kit：它的 PointerSensor 会和「拖去画布」抢同一次指针序列。
 */
export function Filmstrip() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const items = useImageStackStore((state) => state.items)
  const isDecoding = useImageStackStore((state) => state.isDecoding)
  const mode = useImageStackStore((state) => state.mode)
  const brushId = useImageStackStore((state) => state.brushId)
  const splitSourceId = useImageStackStore((state) => state.splitSourceId)
  const addFiles = useImageStackStore((state) => state.addFiles)
  const clearItems = useImageStackStore((state) => state.clearItems)
  const autoFill = useImageStackStore((state) => state.autoFill)
  const inputRef = useRef<HTMLInputElement>(null)

  const readyCount = items.filter(isReady).length

  return (
    <div className="bg-card rounded-xl border p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">
          {t('filmstrip.count', { total: readyCount })}
          {isDecoding ? ` · ${t('filmstrip.decoding')}` : ''}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {mode === 'stitch' ? (
            <Button variant="ghost" size="xs" className="gap-1.5" onClick={autoFill}>
              <Shuffle className="size-4" />
              {t('filmstrip.autoFill')}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="xs"
            className="gap-1.5"
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="size-4" />
            {t('filmstrip.add')}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground gap-1.5"
            onClick={clearItems}
          >
            <Trash2 className="size-4" />
            {t('filmstrip.clear')}
          </Button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          void addFiles(Array.from(event.target.files ?? []))
          event.target.value = ''
        }}
      />

      <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
        {items.map((item, index) => (
          <StackThumb
            key={item.id}
            item={item}
            index={index}
            active={mode === 'stitch' ? brushId === item.id : splitSourceId === item.id}
          />
        ))}
      </div>
    </div>
  )
}

function StackThumb({ item, index, active }: { item: AssetItem; index: number; active: boolean }) {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const mode = useImageStackStore((state) => state.mode)
  const draggingImageId = useImageStackStore((state) => state.draggingImageId)
  const removeItem = useImageStackStore((state) => state.removeItem)
  const setBrush = useImageStackStore((state) => state.setBrush)
  const setSplitSource = useImageStackStore((state) => state.setSplitSource)
  const setDraggingImage = useImageStackStore((state) => state.setDraggingImage)
  const reorderItems = useImageStackStore((state) => state.reorderItems)

  const label =
    item.status === 'ready'
      ? t('filmstrip.useImage', { name: item.name })
      : t(`filmstrip.error.${item.reason}`, { name: item.name })

  return (
    <div
      className={cn('group relative aspect-square', draggingImageId === item.id && 'opacity-50')}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(IMAGE_DRAG_MIME)) {
          return
        }
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => {
        const dragged = event.dataTransfer.getData(IMAGE_DRAG_MIME)
        event.preventDefault()
        if (dragged && dragged !== item.id) {
          reorderItems(dragged, item.id)
        }
      }}
    >
      <button
        type="button"
        draggable={item.status === 'ready'}
        title={label}
        aria-label={label}
        aria-pressed={active}
        onDragStart={(event) => {
          event.dataTransfer.setData(IMAGE_DRAG_MIME, item.id)
          event.dataTransfer.effectAllowed = 'copyMove'
          setDraggingImage(item.id)
        }}
        onDragEnd={() => setDraggingImage(null)}
        onClick={() => (mode === 'stitch' ? setBrush(item.id) : setSplitSource(item.id))}
        className={cn(
          'focus-visible:ring-ring size-full cursor-grab touch-none overflow-hidden rounded-md border-2 transition-colors active:cursor-grabbing',
          active ? 'border-primary' : 'hover:border-primary/40 border-transparent',
          item.status === 'error' && 'border-destructive/50',
        )}
      >
        {item.status === 'ready' ? (
          <img src={item.thumbUrl} alt="" draggable={false} className="size-full object-cover" />
        ) : (
          <span className="bg-muted text-muted-foreground flex size-full flex-col items-center justify-center gap-1 p-1 text-center">
            <AlertCircle className="text-destructive size-4 shrink-0" />
            <span className="line-clamp-2 text-[10px] leading-tight break-all">{item.name}</span>
          </span>
        )}
      </button>

      <span className="bg-background/80 text-muted-foreground pointer-events-none absolute bottom-1 left-1 rounded px-1 font-mono text-[10px] tabular-nums">
        {index + 1}
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t('filmstrip.remove')}
            onClick={() => removeItem(item.id)}
            className="bg-background/85 text-muted-foreground hover:text-destructive absolute top-1 right-1 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{t('filmstrip.remove')}</TooltipContent>
      </Tooltip>
    </div>
  )
}
