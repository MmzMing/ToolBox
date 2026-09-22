import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Plus } from 'lucide-react'

import type { ImageRecord } from '../idb'

export type SessionCardInfo = {
  jobId: string
  prompt: string
  createdAt: number
  count: number
  done: number
  thumb?: ImageRecord
}

type WorkspaceViewProps = {
  cards: SessionCardInfo[]
  onOpen: (jobId: string) => void
}

/** 工作区：进入工具默认展示的会话卡片网格 */
export function WorkspaceView({ cards, onOpen }: WorkspaceViewProps) {
  const { t } = useTranslation('tools-images')

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="shrink-0">
        <div className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
            <SparklesIcon />
          </span>
          <h1 className="truncate text-xl font-semibold md:text-2xl">{t('ai-image-gen.title')}</h1>
        </div>
        <p className="text-muted-foreground mt-2 text-sm">{t('ai-image-gen.description')}</p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <button
            type="button"
            onClick={() => onOpen('')}
            className="border-input text-muted-foreground hover:border-primary/60 hover:text-foreground flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed transition-colors"
          >
            <Plus className="size-6" />
            <span className="text-sm">{t('ai-image-gen.workspace.new')}</span>
          </button>
          {cards.map((card) => (
            <SessionCard key={card.jobId} card={card} onOpen={onOpen} />
          ))}
        </div>
        {!cards.length && (
          <p className="text-muted-foreground mt-6 text-center text-xs">
            {t('ai-image-gen.workspace.empty')}
          </p>
        )}
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

function SessionCard({ card, onOpen }: { card: SessionCardInfo; onOpen: (jobId: string) => void }) {
  const { t } = useTranslation('tools-images')
  const src = useMemo(() => (card.thumb ? URL.createObjectURL(card.thumb.blob) : ''), [card.thumb])
  useEffect(() => {
    return () => {
      if (src) {
        URL.revokeObjectURL(src)
      }
    }
  }, [src])
  const running = card.done < card.count

  return (
    <button
      type="button"
      onClick={() => onOpen(card.jobId)}
      className="group bg-card hover:border-primary/50 flex min-h-44 flex-col overflow-hidden rounded-xl border text-left transition-colors"
    >
      <div className="bg-muted/40 relative h-28 shrink-0">
        {src ? (
          <img src={src} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center">
            {running ? (
              <Loader2 className="text-muted-foreground size-5 animate-spin" />
            ) : (
              <span className="text-muted-foreground text-xs">
                {t('ai-image-gen.card.cancelled')}
              </span>
            )}
          </div>
        )}
        {running && (
          <span className="bg-primary/15 text-primary absolute top-2 right-2 rounded-full px-1.5 py-0.5 text-[10px]">
            {card.done}/{card.count}
          </span>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-xs">{card.prompt}</p>
        <p className="text-muted-foreground mt-auto text-[10px]">
          {t('ai-image-gen.workspace.count', { count: card.count })} ·{' '}
          {new Date(card.createdAt).toLocaleString()}
        </p>
      </div>
    </button>
  )
}
