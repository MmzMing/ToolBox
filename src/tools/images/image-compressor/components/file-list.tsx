import { CheckCircle2, Download, Eye, Loader2, RefreshCw, Trash2, XCircle } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { downloadBlob, formatFileSize, outputFileName, percentSaved } from '../service'
import type { ImageItem } from '../store'
import { useCompressorStore } from '../store'
import { reCompressOne } from '../use-compressor-worker'

interface FileListProps {
  onCompare: (key: number) => void
}

/** 文件列表：缩略图/尺寸/前后大小/节省率/状态/操作 */
export function FileList({ onCompare }: FileListProps) {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-compressor' })
  const list = useCompressorStore((state) => state.list)
  const removeItem = useCompressorStore((state) => state.removeItem)

  // 订阅 Map 引用 + useMemo 派生：选择器返回新数组会触发 React getSnapshot 死循环
  const sorted = useMemo(() => [...list.values()].sort((a, b) => a.key - b.key), [list])

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14">{t('list.preview')}</TableHead>
            <TableHead className="min-w-40">{t('list.name')}</TableHead>
            <TableHead className="hidden md:table-cell">{t('list.dimension')}</TableHead>
            <TableHead>{t('list.size')}</TableHead>
            <TableHead className="hidden sm:table-cell">{t('list.decrease')}</TableHead>
            <TableHead className="w-28 text-right">{t('list.action')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((item) => (
            <Row
              key={item.key}
              item={item}
              onCompare={onCompare}
              onRemove={() => removeItem(item.key)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

interface RowProps {
  item: ImageItem
  onCompare: (key: number) => void
  onRemove: () => void
}

function Row({ item, onCompare, onRemove }: RowProps) {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-compressor' })
  const reCompressing = item.status === 'processing'

  const target = useCompressorStore((state) => state.option.format.target)

  const saved = item.compress ? percentSaved(item.blob.size, item.compress.blob.size) : null
  const canCompare = Boolean(item.compress) && !item.preservedOriginal

  return (
    <TableRow>
      <TableCell>
        <button
          type="button"
          className="bg-muted/60 block size-10 overflow-hidden rounded-md border transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canCompare}
          title={canCompare ? t('compare.title') : undefined}
          onClick={() => canCompare && onCompare(item.key)}
        >
          <img
            src={item.preview?.src ?? item.src}
            alt={item.name}
            className="size-full object-cover"
          />
        </button>
      </TableCell>

      <TableCell className="max-w-48">
        <div className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-medium" title={item.name}>
            {item.name}
          </span>
          {item.preservedOriginal && (
            <span className="text-muted-foreground text-xs">{t('list.preservedOriginal')}</span>
          )}
          {item.processError && (
            <span className="text-destructive truncate text-xs" title={item.processError}>
              {t(`errors.${item.processError}`, { defaultValue: item.processError })}
            </span>
          )}
        </div>
      </TableCell>

      <TableCell className="hidden md:table-cell">
        <span className="text-muted-foreground font-mono text-xs">
          {item.width > 0 ? `${item.width}×${item.height}` : '—'}
          {item.compress &&
            (item.compress.width !== item.width || item.compress.height !== item.height) && (
              <span className="text-primary block">
                {item.compress.width}×{item.compress.height}
              </span>
            )}
        </span>
      </TableCell>

      <TableCell>
        <span className="font-mono text-xs">
          {formatFileSize(item.blob.size)}
          {item.compress && (
            <span className="text-primary ml-1">→ {formatFileSize(item.compress.blob.size)}</span>
          )}
        </span>
      </TableCell>

      <TableCell className="hidden sm:table-cell">
        {saved === null ? (
          <StatusBadge item={item} />
        ) : (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              saved >= 0
                ? 'bg-primary/10 text-primary'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}
          >
            {saved >= 0 ? `-${saved}%` : `+${-saved}%`}
          </span>
        )}
      </TableCell>

      <TableCell className="text-right">
        <div className="inline-flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!canCompare}
            title={t('compare.title')}
            onClick={() => onCompare(item.key)}
          >
            <Eye />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!item.compress}
            title={t('list.downloadOne')}
            onClick={() =>
              item.compress &&
              downloadBlob(item.compress.blob, outputFileName(item.name, target ?? undefined))
            }
          >
            <Download />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={reCompressing}
            title={t('list.reCompress')}
            onClick={() => reCompressOne(item.key)}
          >
            <RefreshCw className={reCompressing ? 'animate-spin' : undefined} />
          </Button>
          <Button variant="ghost" size="icon-sm" title={t('list.removeOne')} onClick={onRemove}>
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function StatusBadge({ item }: { item: ImageItem }) {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-compressor' })
  if (item.status === 'processing') {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
        <Loader2 className="size-3.5 animate-spin" />
        {t('status.processing')}
      </span>
    )
  }
  if (item.status === 'error') {
    return (
      <span className="text-destructive inline-flex items-center gap-1.5 text-xs">
        <XCircle className="size-3.5" />
        {t('status.error')}
      </span>
    )
  }
  return (
    <span className="text-primary inline-flex items-center gap-1.5 text-xs">
      <CheckCircle2 className="size-3.5" />
      {t('status.done')}
    </span>
  )
}
