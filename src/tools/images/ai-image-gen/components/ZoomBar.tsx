import { useReactFlow, useViewport } from '@xyflow/react'
import { Crosshair, Maximize, Minus, Plus, Redo2, Ruler, Undo2, Waypoints } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import { CANVAS_MAX_ZOOM, CANVAS_MIN_ZOOM, CANVAS_ZOOM_STEP } from '../ai-image-gen.service'
import { redoCanvas, undoCanvas } from '../orchestrator'
import { useAiImageGenStore } from '../store'

/** 全览两次点击之间的最短间隔：小于它会被吞掉，避免 fitView 动画互相打断 */
const FIT_VIEW_COOLDOWN_MS = 3000

/**
 * 画布的缩放与视图工具条。
 * 桌面贴在左下角（那里既没有工作区卡片也没有右侧 dock），窄屏改挂右上角，
 * 因为左下角会被画布边缘与滚动的手势挤在一起。
 */
export function ZoomBar() {
  const { t } = useTranslation('tools-images')
  const instance = useReactFlow()
  const { zoom } = useViewport()
  const rulersOn = useAiImageGenStore((state) => state.rulersOn)
  const guidesOn = useAiImageGenStore((state) => state.guidesOn)
  const alignOn = useAiImageGenStore((state) => state.alignOn)
  const toggleRulers = useAiImageGenStore((state) => state.toggleRulers)
  const toggleGuides = useAiImageGenStore((state) => state.toggleGuides)
  const toggleAlign = useAiImageGenStore((state) => state.toggleAlign)
  const canUndo = useAiImageGenStore((state) => state.past.length > 0)
  const canRedo = useAiImageGenStore((state) => state.future.length > 0)
  const lastFitAt = useRef(0)

  const fitView = () => {
    const now = Date.now()
    if (now - lastFitAt.current < FIT_VIEW_COOLDOWN_MS) {
      return
    }
    lastFitAt.current = now
    void instance.fitView({ padding: 0.15, duration: 600 })
  }

  return (
    <div className="bg-card/90 absolute top-3 right-3 z-30 flex items-center gap-1 rounded-xl border p-1.5 shadow-lg backdrop-blur md:top-auto md:right-auto md:bottom-3 md:left-3">
      <BarButton
        label={t('ai-image-gen.toolbar.undo')}
        onClick={() => void undoCanvas()}
        disabled={!canUndo}
      >
        <Undo2 className="size-4" />
      </BarButton>
      <BarButton
        label={t('ai-image-gen.toolbar.redo')}
        onClick={() => void redoCanvas()}
        disabled={!canRedo}
      >
        <Redo2 className="size-4" />
      </BarButton>
      <Divider />
      <BarButton label={t('ai-image-gen.toolbar.rulers')} active={rulersOn} onClick={toggleRulers}>
        <Ruler className="size-4" />
      </BarButton>
      <BarButton label={t('ai-image-gen.toolbar.guides')} active={guidesOn} onClick={toggleGuides}>
        <Waypoints className="size-4" />
      </BarButton>
      <BarButton label={t('ai-image-gen.toolbar.align')} active={alignOn} onClick={toggleAlign}>
        <Crosshair className="size-4" />
      </BarButton>
      <Divider />
      <BarButton
        label={t('ai-image-gen.canvas.zoomOut')}
        disabled={zoom <= CANVAS_MIN_ZOOM}
        onClick={() => void instance.zoomTo(Math.max(CANVAS_MIN_ZOOM, zoom / CANVAS_ZOOM_STEP))}
      >
        <Minus className="size-4" />
      </BarButton>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground h-8 min-w-11 rounded-md text-[10px] tabular-nums"
        aria-label={t('ai-image-gen.canvas.fitView')}
        onClick={fitView}
      >
        {Math.round(zoom * 100)}%
      </button>
      <BarButton
        label={t('ai-image-gen.canvas.zoomIn')}
        disabled={zoom >= CANVAS_MAX_ZOOM}
        onClick={() => void instance.zoomTo(Math.min(CANVAS_MAX_ZOOM, zoom * CANVAS_ZOOM_STEP))}
      >
        <Plus className="size-4" />
      </BarButton>
      <BarButton label={t('ai-image-gen.canvas.fitView')} onClick={fitView}>
        <Maximize className="size-4" />
      </BarButton>
    </div>
  )
}

function Divider() {
  return <span className="bg-border mx-0.5 h-6 w-px" />
}

function BarButton({
  label,
  onClick,
  disabled = false,
  active = false,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? 'secondary' : 'ghost'}
          size="icon"
          className="size-8"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}
