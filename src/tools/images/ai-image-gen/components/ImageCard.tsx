import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  Ban,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  Repeat,
  Trash2,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { buildImageFileName } from '@/utils/file-name'

import type { ImageRecord } from '../idb'
import { objectUrlOf } from '../object-url'
import type { Job, JobSlot } from '../store'

export type CardItem =
  { kind: 'slot'; job: Job; slot: JobSlot } | { kind: 'image'; record: ImageRecord }

type ImageCardProps = {
  item: CardItem
  onOpen: (record: ImageRecord) => void
  onRetry: (jobId: string) => void
  onCancel: (jobId: string) => void
  onReference: (record: ImageRecord) => void
  onRemix: (record: ImageRecord) => void
  onDelete: () => void
}

export function ImageCard({
  item,
  onOpen,
  onRetry,
  onCancel,
  onReference,
  onRemix,
  onDelete,
}: ImageCardProps) {
  const { t } = useTranslation('tools-images')
  const [detailsOpen, setDetailsOpen] = useState(false)

  const record = item.kind === 'image' ? item.record : undefined
  const job = item.kind === 'slot' ? item.job : undefined
  const slot = item.kind === 'slot' ? item.slot : undefined
  const src = record ? objectUrlOf(record.id, record.blob) : ''

  const status = slot?.status ?? 'done'
  const errorCode = slot?.errorCode ?? job?.errorCode
  const metaLine = record
    ? [
        record.meta.model,
        record.meta.durationMs ? `${Math.round(record.meta.durationMs / 1000)}s` : '',
        record.meta.usage?.totalTokens ? `${record.meta.usage.totalTokens} tok` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  const handleClick = () => {
    if (record) {
      onOpen(record)
    } else if (job && (status === 'failed' || status === 'cancelled')) {
      onRetry(job.id)
    }
  }

  return (
    <div className="group bg-muted/40 relative overflow-hidden rounded-lg border">
      <button type="button" className="block w-full" onClick={handleClick}>
        {record && src ? (
          <img
            src={src}
            alt={record.meta.prompt}
            draggable={false}
            className="w-full object-cover"
          />
        ) : status === 'failed' ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 p-4 text-center">
            <AlertTriangle className="text-destructive size-5" />
            <p className="text-muted-foreground text-xs">
              {errorCode ? t(`ai-image-gen.errors.${errorCode}`) : t('ai-image-gen.errors.unknown')}
            </p>
          </div>
        ) : status === 'cancelled' ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 p-4 text-center">
            <Ban className="text-muted-foreground size-5" />
            <p className="text-muted-foreground text-xs">{t('ai-image-gen.card.cancelled')}</p>
          </div>
        ) : (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 p-4">
            <Skeleton className="absolute inset-0 animate-pulse rounded-none" />
            <Loader2 className="text-muted-foreground relative size-5 animate-spin" />
            <p className="text-muted-foreground relative text-xs">
              {status === 'pending'
                ? t('ai-image-gen.card.queued')
                : t('ai-image-gen.card.generating')}
            </p>
          </div>
        )}
      </button>

      <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {record && (
          <>
            <CardAction
              label={t('ai-image-gen.card.download')}
              onClick={() => void downloadRecord(record)}
            >
              <Download className="size-3.5" />
            </CardAction>
            <CardAction
              label={t('ai-image-gen.card.reference')}
              onClick={() => onReference(record)}
            >
              <Repeat className="size-3.5" />
            </CardAction>
            <CardAction label={t('ai-image-gen.card.remix')} onClick={() => onRemix(record)}>
              <RefreshCw className="size-3.5" />
            </CardAction>
            <CardAction label={t('ai-image-gen.card.details')} onClick={() => setDetailsOpen(true)}>
              <Eye className="size-3.5" />
            </CardAction>
          </>
        )}
        {job && (status === 'pending' || status === 'generating') && (
          <CardAction label={t('ai-image-gen.card.cancel')} onClick={() => onCancel(job.id)}>
            <X className="size-3.5" />
          </CardAction>
        )}
        {job && (status === 'failed' || status === 'cancelled') && (
          <CardAction label={t('ai-image-gen.card.retry')} onClick={() => onRetry(job.id)}>
            <RefreshCw className="size-3.5" />
          </CardAction>
        )}
        <CardAction label={t('ai-image-gen.card.delete')} onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </CardAction>
      </div>

      {metaLine && (
        <p className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 pt-4 pb-1 text-[10px] text-white/90">
          {metaLine}
        </p>
      )}

      {record && (
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('ai-image-gen.details.title')}</DialogTitle>
            </DialogHeader>
            <dl className="space-y-2 text-sm">
              <DetailRow label={t('ai-image-gen.details.prompt')} value={record.meta.prompt} />
              {record.meta.revisedPrompt && (
                <DetailRow
                  label={t('ai-image-gen.details.revised')}
                  value={record.meta.revisedPrompt}
                />
              )}
              <DetailRow
                label={t('ai-image-gen.details.model')}
                value={`${record.meta.provider} / ${record.meta.model}`}
              />
              <DetailRow
                label={t('ai-image-gen.details.params')}
                value={JSON.stringify(record.meta.params)}
              />
              {record.meta.usage?.totalTokens && (
                <DetailRow
                  label={t('ai-image-gen.details.usage')}
                  value={`${record.meta.usage.totalTokens} tokens`}
                />
              )}
              <DetailRow
                label={t('ai-image-gen.details.created')}
                value={new Date(record.meta.createdAt).toLocaleString()}
              />
            </dl>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function CardAction({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      className="nodrag bg-background/90 size-7"
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      {children}
    </Button>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="break-words whitespace-pre-wrap">{value}</dd>
    </div>
  )
}

async function downloadRecord(record: ImageRecord) {
  const url = URL.createObjectURL(record.blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = buildImageFileName(record.meta.prompt, record.meta.createdAt, record.mimeType)
  anchor.click()
  URL.revokeObjectURL(url)
}
