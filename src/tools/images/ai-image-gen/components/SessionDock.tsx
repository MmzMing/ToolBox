import { useReactFlow, useViewport } from '@xyflow/react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Archive,
  Hand,
  Layers,
  Maximize,
  Minus,
  MousePointer2,
  Plus,
  SquarePlus,
  Trash2,
  Upload,
} from 'lucide-react'

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
import { useIsMobile } from '@/composable/use-breakpoint'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import {
  CANVAS_MAX_ZOOM,
  CANVAS_MIN_ZOOM,
  CANVAS_ZOOM_STEP,
  REFERENCE_MIMES,
} from '../ai-image-gen.service'
import type { CanvasInteraction } from '../canvas/ImageCanvas'

type SessionDockProps = {
  hasSelection: boolean
  interaction: CanvasInteraction
  onToggleInteraction: () => void
  onAddPrompt: () => void
  onExport: () => void
  onRelayout: () => void
  onClearAll: () => void
  onImportFiles: (files: File[], position: { x: number; y: number }) => void
}

/** 画布右侧悬浮 dock：左键模式切换 + 画布任务操作 + 缩放（返回工作区在左上角） */
export function SessionDock({
  hasSelection,
  interaction,
  onToggleInteraction,
  onAddPrompt,
  onExport,
  onRelayout,
  onClearAll,
  onImportFiles,
}: SessionDockProps) {
  const { t } = useTranslation('tools-images')
  const isMobile = useIsMobile()
  const instance = useReactFlow()
  const { zoom } = useViewport()
  const fileRef = useRef<HTMLInputElement>(null)

  const upload = () => {
    const rect = document.querySelector('.react-flow')?.getBoundingClientRect()
    const center = instance.screenToFlowPosition({
      x: (rect?.left ?? 0) + (rect?.width ?? window.innerWidth) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? window.innerHeight) / 2,
    })
    const files = Array.from(fileRef.current?.files ?? [])
    if (files.length) {
      onImportFiles(files, center)
    }
    if (fileRef.current) {
      fileRef.current.value = ''
    }
  }

  return (
    <div className="bg-card/90 fixed top-1/2 right-3 z-50 flex -translate-y-1/2 flex-col items-center gap-1 rounded-xl border p-1.5 shadow-lg backdrop-blur">
      <input
        ref={fileRef}
        type="file"
        accept={REFERENCE_MIMES.join(',')}
        multiple
        className="hidden"
        onChange={upload}
      />
      <DockButton
        label={t(
          interaction === 'select'
            ? 'ai-image-gen.canvas.modeSelect'
            : 'ai-image-gen.canvas.modePan',
        )}
        active={interaction === 'select'}
        onClick={onToggleInteraction}
      >
        {interaction === 'select' ? (
          <MousePointer2 className="size-4" />
        ) : (
          <Hand className="size-4" />
        )}
      </DockButton>
      {/* 触屏没有右键菜单，落点类操作只能靠 dock；桌面端走右键与拖拽 */}
      {isMobile ? (
        <>
          <DockButton
            label={t('ai-image-gen.canvas.upload')}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-4" />
          </DockButton>
          <DockButton label={t('ai-image-gen.canvas.newPrompt')} onClick={onAddPrompt}>
            <SquarePlus className="size-4" />
          </DockButton>
        </>
      ) : null}
      <DockButton
        label={
          hasSelection
            ? t('ai-image-gen.toolbar.exportSelected')
            : t('ai-image-gen.toolbar.exportZip')
        }
        onClick={onExport}
      >
        <Archive className="size-4" />
      </DockButton>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <DockButton label={t('ai-image-gen.canvas.relayout')}>
            <Layers className="size-4" />
          </DockButton>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('ai-image-gen.canvas.relayoutConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('ai-image-gen.canvas.relayoutConfirmDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('ai-image-gen.toolbar.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={onRelayout}>
              {t('ai-image-gen.canvas.relayoutConfirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <DockButton label={t('ai-image-gen.toolbar.clear')} destructive>
            <Trash2 className="size-4" />
          </DockButton>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('ai-image-gen.toolbar.clearConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('ai-image-gen.toolbar.clearConfirmDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('ai-image-gen.toolbar.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onClearAll}>
              {t('ai-image-gen.toolbar.clearConfirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="bg-border mx-1 my-0.5 h-px w-6" />
      <DockButton
        label={t('ai-image-gen.canvas.zoomOut')}
        disabled={zoom <= CANVAS_MIN_ZOOM}
        onClick={() => void instance.zoomTo(Math.max(CANVAS_MIN_ZOOM, zoom / CANVAS_ZOOM_STEP))}
      >
        <Minus className="size-4" />
      </DockButton>
      <span className="text-muted-foreground text-[10px] tabular-nums">
        {Math.round(zoom * 100)}
      </span>
      <DockButton
        label={t('ai-image-gen.canvas.zoomIn')}
        disabled={zoom >= CANVAS_MAX_ZOOM}
        onClick={() => void instance.zoomTo(Math.min(CANVAS_MAX_ZOOM, zoom * CANVAS_ZOOM_STEP))}
      >
        <Plus className="size-4" />
      </DockButton>
      <DockButton
        label={t('ai-image-gen.canvas.fitView')}
        onClick={() => void instance.fitView({ padding: 0.15, duration: 600 })}
      >
        <Maximize className="size-4" />
      </DockButton>
    </div>
  )
}

function DockButton({
  label,
  onClick,
  destructive = false,
  disabled = false,
  active = false,
  children,
}: {
  label: string
  onClick?: () => void
  destructive?: boolean
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
          className={cn('size-8', destructive && 'text-destructive')}
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left" align="center" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
