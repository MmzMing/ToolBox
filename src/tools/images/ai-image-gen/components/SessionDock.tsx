import { useTranslation } from 'react-i18next'
import { Archive, ArrowLeft, CheckSquare, Trash2 } from 'lucide-react'

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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type SessionDockProps = {
  selectionMode: boolean
  hasSelection: boolean
  onBack: () => void
  onToggleSelect: () => void
  onExport: () => void
  onClearAll: () => void
}

/** 会话视图右侧悬浮 dock：返回工作区 + 任务操作（仿简历编辑器） */
export function SessionDock({
  selectionMode,
  hasSelection,
  onBack,
  onToggleSelect,
  onExport,
  onClearAll,
}: SessionDockProps) {
  const { t } = useTranslation('tools-images')
  return (
    <div className="bg-card/90 fixed top-1/2 right-3 z-50 flex -translate-y-1/2 flex-col items-center gap-1 rounded-xl border p-1.5 shadow-lg backdrop-blur">
      <DockButton label={t('ai-image-gen.dock.back')} onClick={onBack}>
        <ArrowLeft className="size-4" />
      </DockButton>
      <DockButton
        label={
          selectionMode ? t('ai-image-gen.toolbar.exitSelect') : t('ai-image-gen.toolbar.select')
        }
        active={selectionMode}
        onClick={onToggleSelect}
      >
        <CheckSquare className="size-4" />
      </DockButton>
      <DockButton
        label={
          selectionMode && hasSelection
            ? t('ai-image-gen.toolbar.exportSelected')
            : t('ai-image-gen.toolbar.exportZip')
        }
        onClick={onExport}
      >
        <Archive className="size-4" />
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
  active = false,
  destructive = false,
  children,
}: {
  label: string
  onClick?: () => void
  active?: boolean
  destructive?: boolean
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
