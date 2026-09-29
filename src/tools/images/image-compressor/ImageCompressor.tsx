import { Download, Trash2 } from 'lucide-react'
import JSZip from 'jszip'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useBreakpoint } from '@/composable/use-breakpoint'
import { toast } from 'sonner'
import { CompareDialog } from './components/compare-dialog'
import { FileList } from './components/file-list'
import { OptionsPanel } from './components/options-panel'
import { UploadZone } from './components/upload-zone'
import { formatFileSize, outputFileName, percentSaved } from './service'
import { avifCheck } from './engines/support'
import { useCompressorStore, type ImageItem } from './store'
import { applyOptionAndRecompress, useWorkerHandler } from './use-compressor-worker'

/** 图片压缩工作台（移植自 tools-pic 图小小）：左工作区（上传/列表）+ 右选项面板 */
export default function ImageCompressor() {
  useWorkerHandler()

  const breakpoint = useBreakpoint()
  const hasFiles = useCompressorStore((state) => state.list.size > 0)
  const [compareKey, setCompareKey] = useState<number | null>(null)
  const compareItem = useCompressorStore((state) =>
    compareKey === null ? null : (state.list.get(compareKey) ?? null),
  )

  // 探测浏览器 AVIF 编码能力，不支持时从格式表移除
  useEffect(() => {
    void avifCheck()
  }, [])

  return (
    <div className="flex flex-col gap-4">
      {breakpoint === 'mobile' ? (
        <div className="flex flex-col gap-4">
          <div className="min-w-0">
            {hasFiles ? <ListSection onCompare={setCompareKey} /> : <UploadZone />}
          </div>
          <div className="h-[560px]">
            <OptionsPanel />
          </div>
        </div>
      ) : (
        <ResizablePanelGroup orientation="horizontal" className="min-h-[560px] rounded-lg">
          <ResizablePanel defaultSize={68} minSize={40}>
            <div className="h-full overflow-auto pr-2">
              {hasFiles ? <ListSection onCompare={setCompareKey} /> : <UploadZone />}
            </div>
          </ResizablePanel>
          <ResizableHandle
            withHandle
            className="hover:[&>div]:bg-primary focus-visible:[&>div]:bg-primary active:[&>div]:bg-primary mx-1 w-1 [&>div]:transition-colors [&>div]:duration-150"
          />
          <ResizablePanel defaultSize={32} minSize={24}>
            <div className="h-full pl-1">
              <OptionsPanel />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      <CompareDialog item={compareItem} onClose={() => setCompareKey(null)} />
    </div>
  )
}

/** 左侧工作区：统计摘要 + 继续添加 + 文件列表 */
function ListSection({ onCompare }: { onCompare: (key: number) => void }) {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-compressor' })
  const list = useCompressorStore((state) => state.list)
  const items = useMemo<ImageItem[]>(() => [...list.values()], [list])
  const originSize = useCompressorStore((state) => state.originSize)
  const outputSize = useCompressorStore((state) => state.outputSize)
  const clearAll = useCompressorStore((state) => state.clearAll)
  const tempOption = useCompressorStore((state) => state.tempOption)
  const option = useCompressorStore((state) => state.option)

  const [zipping, setZipping] = useState(false)
  const doneCount = items.filter((item) => item.compress).length
  const saved = percentSaved(originSize, outputSize)

  const downloadAll = async () => {
    const zip = new JSZip()
    let count = 0
    for (const item of items) {
      if (!item.compress) {
        continue
      }
      zip.file(outputFileName(item.name, option.format.target ?? undefined), item.compress.blob)
      count++
    }
    if (count === 0) {
      return
    }
    setZipping(true)
    try {
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'toolbox-images.zip'
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success(t('workspace.downloadAllDone', { count }))
    } catch {
      toast.error(t('workspace.zipFailed'))
    } finally {
      setZipping(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm">
          <span className="font-semibold">{items.length}</span>
          <span className="text-muted-foreground">
            {' '}
            {t('workspace.summary', {
              origin: formatFileSize(originSize),
              output: formatFileSize(outputSize),
            })}
          </span>
          {originSize > 0 && (
            <span
              className={`ml-1.5 font-medium ${saved >= 0 ? 'text-primary' : 'text-amber-500'}`}
            >
              ({saved >= 0 ? `-${saved}%` : `+${-saved}%`})
            </span>
          )}
          {doneCount < items.length && (
            <span className="text-muted-foreground ml-1 text-xs">
              {t('workspace.pendingHint', { done: doneCount, total: items.length })}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <UploadZone compact />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={doneCount === 0 || zipping}
            onClick={() => void downloadAll()}
          >
            <Download className="size-4" />
            {t('workspace.downloadAll')}
          </Button>
          <Button variant="ghost" size="icon-sm" title={t('workspace.clear')} onClick={clearAll}>
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      </div>

      <FileList onCompare={onCompare} />

      {doneCount < items.length && (
        <p className="text-muted-foreground text-center text-xs">
          {t('workspace.autoApplyHint')}{' '}
          <button
            type="button"
            className="text-primary underline underline-offset-4"
            onClick={() => applyOptionAndRecompress(tempOption)}
          >
            {t('workspace.reapplyNow')}
          </button>
        </p>
      )}
    </div>
  )
}
