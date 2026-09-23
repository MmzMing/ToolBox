import { useTranslation } from 'react-i18next'
import { Layers, Plus, Trash2 } from 'lucide-react'

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

export type WorkspaceCardInfo = {
  id: string
  name: string
  description: string
  imageCount: number
  jobCount: number
  activeCount: number
  updatedAt: number
}

type WorkspaceViewProps = {
  cards: WorkspaceCardInfo[]
  onOpen: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
}

/** 工作区列表：只展示工作区自身信息，不展示任何图片 */
export function WorkspaceView({ cards, onOpen, onCreate, onDelete }: WorkspaceViewProps) {
  const { t } = useTranslation('tools-images')

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-6 px-4 py-6">
      <header className="shrink-0">
        <div className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
            <SparklesIcon />
          </span>
          <h1 className="truncate text-xl font-semibold md:text-2xl">{t('ai-image-gen.title')}</h1>
          <span className="bg-primary text-primary-foreground shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
            {t('ai-image-gen.badge')}
          </span>
        </div>
        <p className="text-muted-foreground mt-2 text-sm">{t('ai-image-gen.description')}</p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
          <button
            type="button"
            onClick={onCreate}
            className="bg-card hover:border-primary/60 flex aspect-[210/297] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-center transition-colors"
          >
            <span className="bg-muted flex size-16 items-center justify-center rounded-full">
              <Plus className="size-8" />
            </span>
            <span className="text-base font-medium">{t('ai-image-gen.workspace.new')}</span>
            <span className="text-muted-foreground text-sm">
              {t('ai-image-gen.workspace.newDescription')}
            </span>
          </button>
          {cards.map((card) => (
            <WorkspaceCard key={card.id} card={card} onOpen={onOpen} onDelete={onDelete} />
          ))}
        </div>
      </div>
    </div>
  )
}

function SparklesIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden
    >
      <path d="M11 3 9.8 7.4a2 2 0 0 1-1.4 1.4L4 10l4.4 1.2a2 2 0 0 1 1.4 1.4L11 17l1.2-4.4a2 2 0 0 1 1.4-1.4L18 10l-4.4-1.2a2 2 0 0 1-1.4-1.4Z" />
      <path d="M18 15.5 17.3 17.8a1 1 0 0 1-.7.7L14.5 19l2.1.6a1 1 0 0 1 .7.7l.7 2.2.6-2.2a1 1 0 0 1 .7-.7l2.1-.6-2.1-.6a1 1 0 0 1-.7-.7Z" />
    </svg>
  )
}

function WorkspaceCard({
  card,
  onOpen,
  onDelete,
}: {
  card: WorkspaceCardInfo
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation('tools-images')
  const running = card.activeCount > 0

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onOpen(card.id)}
        className="bg-card hover:border-primary/50 flex aspect-[210/297] w-full cursor-pointer flex-col rounded-xl border p-4 text-left transition-colors"
      >
        <div className="flex items-start gap-2 pr-7">
          <span className="bg-muted/60 text-muted-foreground group-hover:text-primary flex size-7 shrink-0 items-center justify-center rounded-md">
            <Layers className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">
            {card.name || t('ai-image-gen.workspace.untitled')}
          </span>
        </div>

        <p className="text-muted-foreground mt-2 line-clamp-2 min-h-5 text-xs">
          {card.description || t('ai-image-gen.workspace.noDescription')}
        </p>

        <p className="text-muted-foreground mt-auto flex flex-wrap items-center gap-x-1.5 pt-3 text-[10px]">
          {running ? (
            <span className="bg-primary/15 text-primary rounded-full px-1.5 py-0.5">
              {t('ai-image-gen.workspace.running', { count: card.activeCount })}
            </span>
          ) : null}
          <span>
            {t('ai-image-gen.workspace.jobCount', { count: card.jobCount })} ·{' '}
            {t('ai-image-gen.workspace.imageCount', { count: card.imageCount })} ·{' '}
            {new Date(card.updatedAt).toLocaleDateString()}
          </span>
        </p>
      </button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive absolute top-2 right-2 z-10 size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={t('ai-image-gen.workspace.delete')}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('ai-image-gen.workspace.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('ai-image-gen.workspace.deleteConfirmDesc', {
                name: card.name || t('ai-image-gen.workspace.untitled'),
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
