import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Ban, Download, Eye, Loader2, ScanSearch, Trash2, X } from 'lucide-react'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { buildImageFileName } from '@/utils/file-name'

import { ActionBar, ActionButton } from '../canvas/nodes/action-bar'
import type { ImageRecord } from '../idb'
import { objectUrlOf } from '../object-url'
import type { Job, JobSlot } from '../store'

import { NodeDialog } from './NodeDialog'

export type CardItem =
  { kind: 'slot'; job: Job; slot: JobSlot } | { kind: 'image'; record: ImageRecord }

type ImageCardProps = {
  item: CardItem
  /** 选中时动作条常驻、卡片描一圈主色；未选中的节点不露动作条 */
  selected?: boolean
  /** 多选时让位给选框上方的对齐条：悬停也不出 */
  barHidden?: boolean
  /** 反推对话框开着没：开关归画布管，同一时刻只允许一个节点有它 */
  dialogOpen: boolean
  onToggleDialog: () => void
  /** 这张图当前那条识图任务：决定对话框的转圈与取消 */
  visionJob?: Job
  onOpen: (record: ImageRecord) => void
  onRetry: (jobId: string) => void
  onCancel: (jobId: string) => void
  /** 识别这张图：指令留空即回落到默认 skill 的四候选反推 */
  onVision: (imageId: string, instruction: string) => void
  onOpenSettings: () => void
  onDelete: () => void
}

export function ImageCard({
  item,
  selected = false,
  barHidden = false,
  dialogOpen,
  onToggleDialog,
  visionJob,
  onOpen,
  onRetry,
  onCancel,
  onVision,
  onOpenSettings,
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

  /** 单击只用来选中节点，看图与重试都放双击，否则想选卡片就先误开灯箱 */
  const handleDoubleClick = () => {
    if (record) {
      onOpen(record)
    } else if (job && (status === 'failed' || status === 'cancelled')) {
      onRetry(job.id)
    }
  }

  return (
    <div className="relative h-full">
      {/* 裁剪层单独一层：动作条要浮到卡片上方，根节点不能 overflow-hidden。
          它必须 own 定位上下文，否则底下那条 absolute 的元信息带会跳过它的圆角裁剪，
          直角压在选中描边上，看着就像圆角被啃掉了一块 */}
      <div
        className={cn(
          'bg-muted/40 relative h-full overflow-hidden rounded-lg border',
          // 选中态与提示词节点（PromptNode）同一套描边，否则点了图片节点只有动作条出来、
          // 卡片本身毫无反馈；ring 不占布局，不会把卡片撑大 1px
          selected && 'border-primary ring-primary ring-2',
        )}
      >
        <div className="block h-full w-full cursor-grab" onDoubleClick={handleDoubleClick}>
          {record && src ? (
            <img
              src={src}
              alt={record.meta.prompt}
              draggable={false}
              className="h-full w-full object-contain"
            />
          ) : status === 'failed' ? (
            <div className="flex h-full min-h-24 flex-col items-center justify-center gap-2 p-4 text-center">
              <AlertTriangle className="text-destructive size-5" />
              <p className="text-muted-foreground text-xs">
                {errorCode
                  ? t(`ai-image-gen.errors.${errorCode}`)
                  : t('ai-image-gen.errors.unknown')}
              </p>
            </div>
          ) : status === 'cancelled' ? (
            <div className="flex h-full min-h-24 flex-col items-center justify-center gap-2 p-4 text-center">
              <Ban className="text-muted-foreground size-5" />
              <p className="text-muted-foreground text-xs">{t('ai-image-gen.card.cancelled')}</p>
            </div>
          ) : (
            <div className="relative flex h-full min-h-24 flex-col items-center justify-center gap-2 p-4">
              <Skeleton className="absolute inset-0 animate-pulse rounded-none" />
              <Loader2 className="text-muted-foreground relative size-5 animate-spin" />
              <p className="text-muted-foreground relative text-xs">
                {status === 'pending'
                  ? t('ai-image-gen.card.queued')
                  : t('ai-image-gen.card.generating')}
              </p>
            </div>
          )}
        </div>

        {metaLine && (
          <p className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 pt-4 pb-1 text-[10px] text-white/90">
            {metaLine}
          </p>
        )}
      </div>

      <div
        className={cn(
          'transition-opacity',
          !barHidden && (selected || dialogOpen) ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <ActionBar>
          {record && (
            <>
              <ActionButton
                label={t('ai-image-gen.reverse.button')}
                icon={<ScanSearch className="size-3 shrink-0" />}
                active={dialogOpen}
                onClick={onToggleDialog}
              />
              <ActionButton
                label={t('ai-image-gen.card.download')}
                icon={<Download className="size-3 shrink-0" />}
                onClick={() => void downloadRecord(record)}
              />
              <ActionButton
                label={t('ai-image-gen.card.details')}
                icon={<Eye className="size-3 shrink-0" />}
                onClick={() => setDetailsOpen(true)}
              />
            </>
          )}
          {job && (status === 'pending' || status === 'generating') && (
            <ActionButton
              label={t('ai-image-gen.card.cancel')}
              icon={<X className="size-3 shrink-0" />}
              onClick={() => onCancel(job.id)}
            />
          )}
          {job && (status === 'failed' || status === 'cancelled') && (
            <ActionButton
              label={t('ai-image-gen.card.retry')}
              icon={<AlertTriangle className="text-destructive size-3 shrink-0" />}
              onClick={() => onRetry(job.id)}
            />
          )}
          <ActionButton
            label={t('ai-image-gen.card.delete')}
            icon={<Trash2 className="text-destructive size-3 shrink-0" />}
            onClick={onDelete}
          />
        </ActionBar>
      </div>

      {/* 工具条那颗按钮才开对话框：多选时说不清要反推哪一张，所以一并藏掉 */}
      {record && dialogOpen && !barHidden ? (
        <NodeDialog
          key={record.id}
          target={{ kind: 'vision', record }}
          busy={visionJob?.status === 'queued' || visionJob?.status === 'running'}
          onCancel={visionJob ? () => onCancel(visionJob.id) : undefined}
          onClose={onToggleDialog}
          onSubmit={(instruction) => onVision(record.id, instruction)}
          onOpenSettings={onOpenSettings}
        />
      ) : null}

      {record && (
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          {/* 固定一块可读的画幅：窄屏跟着视口收，长 JSON 与提示词都在框内换行，超出只在框内滚 */}
          <DialogContent className="flex max-h-[min(80vh,42rem)] w-[min(92vw,52rem)] max-w-none flex-col gap-3 sm:max-w-none">
            <DialogHeader className="shrink-0">
              <DialogTitle>{t('ai-image-gen.details.title')}</DialogTitle>
            </DialogHeader>
            <dl className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto pr-1 text-sm">
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      {/* anywhere 才会真正压小 min-content：break-word 下长串 JSON 仍会把弹框撑出横向滚动条 */}
      <dd className="min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap">{value}</dd>
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
