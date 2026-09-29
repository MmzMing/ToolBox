import { useReactFlow } from '@xyflow/react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Archive,
  Hand,
  Layers,
  MousePointer2,
  Settings2,
  SquarePlus,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
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

import { REFERENCE_MIMES, apiConfigured } from '../ai-image-gen.service'
import type { CanvasInteraction } from '../canvas/ImageCanvas'
import { useAiImageGenStore } from '../store'

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

/** 画布右侧悬浮 dock：左键模式切换 + AI 设置 + 画布任务操作（缩放与视图工具在左下角的 ZoomBar） */
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
  const sound = useAiImageGenStore((state) => state.sound)
  const setSound = useAiImageGenStore((state) => state.setSound)
  const setSettingsOpen = useAiImageGenStore((state) => state.setSettingsOpen)
  const genApi = useAiImageGenStore((state) => state.genApi)
  const visionApi = useAiImageGenStore((state) => state.visionApi)
  const fileRef = useRef<HTMLInputElement>(null)

  // 绿即「填全了，点一下就能出图」：识图是画布上的常驻动作，所以它和生图一起算
  const settingsReady = apiConfigured(genApi) && apiConfigured(visionApi)

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
      <DockButton
        label={t('ai-image-gen.toolbar.settings')}
        dot={settingsReady ? 'ok' : 'warn'}
        onClick={() => setSettingsOpen(true)}
      >
        <Settings2 className="size-4" />
      </DockButton>
      {/* 触屏没有右键菜单，落点类操作只能靠 dock；桌面端走右键与拖拽 */}
      {isMobile ? (
        <>
          <DockButton label={t('ai-image-gen.canvas.newPrompt')} onClick={onAddPrompt}>
            <SquarePlus className="size-4" />
          </DockButton>
          <DockButton
            label={t('ai-image-gen.canvas.upload')}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-4" />
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
      <DockButton
        label={t(sound ? 'ai-image-gen.notify.on' : 'ai-image-gen.notify.off')}
        active={sound}
        onClick={() => setSound(!sound)}
      >
        {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
      </DockButton>
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
    </div>
  )
}

function DockButton({
  label,
  onClick,
  destructive = false,
  disabled = false,
  active = false,
  dot,
  children,
}: {
  label: string
  onClick?: () => void
  destructive?: boolean
  disabled?: boolean
  active?: boolean
  /** 右上角状态点：warn 红 = 还没配，ok 绿 = 可以直接用 */
  dot?: 'ok' | 'warn'
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? 'secondary' : 'ghost'}
          size="icon"
          className={cn('size-8', dot && 'relative', destructive && 'text-destructive')}
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
          {dot ? (
            <span
              aria-hidden
              className={cn(
                'ring-card absolute top-1 right-1 size-1.5 rounded-full ring-2',
                dot === 'ok' ? 'bg-primary' : 'bg-destructive',
              )}
            />
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left" align="center" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
