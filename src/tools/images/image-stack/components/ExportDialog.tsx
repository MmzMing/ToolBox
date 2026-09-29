import { Clipboard, Download, Eye, FolderArchive } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ImageLightbox } from '@/components/image-lightbox'
import { ParamField } from '@/components/param-field'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  buildSliceNames,
  buildStackFileName,
  buildSliceZipName,
  EXPORT_FORMATS,
  extensionOf,
  supportsAlpha,
  type ExportFormat,
} from '../image-stack.service'
import { buildLongFileName, buildLongSegmentName, buildLongZipName } from '../long-stack.service'
import {
  copyBlobToClipboard,
  renderLongToBlob,
  renderLongSegments,
  renderSceneToBlob,
  renderSlices,
} from '../export-image'
import { buildSliceZip } from '../export-zip'
import { downloadBlob } from '../download'
import { useImageStackStore } from '../store'
import { useAssetResolver, useLongGeometry, useSplitGeometry, useStitchScene } from '../use-scene'

const CLIPBOARD_SUPPORTED =
  typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function'

/** 格式与质量两个模式共用 */
function FormatControls() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const exportOption = useImageStackStore((state) => state.exportOption)
  const setExportOption = useImageStackStore((state) => state.setExportOption)

  return (
    <>
      <ParamField label={t('export.format')}>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          className="w-full"
          value={exportOption.format}
          onValueChange={(value) => {
            if (value) {
              setExportOption({ format: value as ExportFormat })
            }
          }}
        >
          {EXPORT_FORMATS.map((format) => (
            <ToggleGroupItem key={format} value={format} className="flex-1 text-xs">
              {format === 'jpeg' ? 'JPG' : format.toUpperCase()}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </ParamField>

      {exportOption.format === 'png' ? null : (
        <ParamField
          label={t('export.quality')}
          hint={`${Math.round(exportOption.quality * 100)}%`}
          htmlFor="stack-quality"
        >
          <Slider
            id="stack-quality"
            min={10}
            max={100}
            step={1}
            value={[Math.round(exportOption.quality * 100)]}
            onValueChange={([value = 92]) => setExportOption({ quality: value / 100 })}
          />
        </ParamField>
      )}
    </>
  )
}

/** 弹窗外壳：触发按钮常驻画布工具条，动作按钮收在弹窗里 */
function ExportDialogShell({
  description,
  children,
  footer,
  disabled,
}: {
  description: string
  children: React.ReactNode
  footer: (closeDialog: () => void) => React.ReactNode
  disabled: boolean
}) {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5" disabled={disabled}>
          <Download className="size-4" />
          {t('export.title')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{t('export.title')}</DialogTitle>
          <DialogDescription className="font-mono text-xs tabular-nums">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">{children}</div>
        <DialogFooter>{footer(() => setOpen(false))}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StitchExport() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const scene = useStitchScene()
  const resolveFull = useAssetResolver('full')
  const exportOption = useImageStackStore((state) => state.exportOption)
  const hasContent = useImageStackStore((state) => state.layers.some((layer) => layer.imageId))
  const [isBusy, setIsBusy] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const previewRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current)
      }
    }
  }, [])

  const openPreview = useCallback((url: string) => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current)
    }
    previewRef.current = url
    setPreviewUrl(url)
    setPreviewOpen(true)
  }, [])

  const run = useCallback(
    async (action: () => Promise<void>) => {
      setIsBusy(true)
      try {
        await action()
      } catch {
        toast.error(t('export.failed'))
      } finally {
        setIsBusy(false)
      }
    },
    [t],
  )

  const losesAlpha =
    !supportsAlpha(exportOption.format) && scene.style.background.type === 'transparent'
  const busy = isBusy || !hasContent

  return (
    <>
      <ExportDialogShell
        disabled={!hasContent}
        description={t('stage.size', {
          width: scene.canvas.width,
          height: scene.canvas.height,
        })}
        footer={(close) => (
          <>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={busy || !CLIPBOARD_SUPPORTED}
              title={CLIPBOARD_SUPPORTED ? undefined : t('export.clipboardUnsupported')}
              onClick={() =>
                run(async () => {
                  const blob = await renderSceneToBlob(scene, resolveFull, exportOption)
                  await copyBlobToClipboard(blob)
                  toast.success(t('export.copied'))
                })
              }
            >
              <Clipboard className="size-4" />
              {t('export.copy')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={isBusy}
              onClick={() => {
                // 灯箱与弹窗各自是模态框，先关弹窗再开灯箱，避免两层焦点陷阱打架
                close()
                run(async () => {
                  const blob = await renderSceneToBlob(scene, resolveFull, {
                    format: 'png',
                    quality: 1,
                  })
                  openPreview(URL.createObjectURL(blob))
                })
              }}
            >
              <Eye className="size-4" />
              {t('export.preview')}
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const blob = await renderSceneToBlob(scene, resolveFull, exportOption)
                  downloadBlob(blob, buildStackFileName(exportOption.format))
                })
              }
            >
              <Download className="size-4" />
              {t('export.download')}
            </Button>
          </>
        )}
      >
        <FormatControls />
        {losesAlpha ? (
          <p className="text-muted-foreground text-xs">{t('export.alphaLost')}</p>
        ) : null}
      </ExportDialogShell>

      {previewUrl ? (
        <ImageLightbox
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          src={previewUrl}
          alt={t('export.previewAlt')}
          caption={`${scene.canvas.width} × ${scene.canvas.height}`}
        />
      ) : null}
    </>
  )
}

/**
 * 长图：成品可能超出画布上限，于是同一套渲染既出整张也出分段。
 * 分段时「下载整张」与「复制到剪贴板」失去意义（那张图根本画不出来），
 * 所以禁用而不是藏起来，让用户看得见为什么点不动。
 */
function LongExport() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const { layout } = useLongGeometry()
  const style = useImageStackStore((state) => state.longStyle)
  const resolveFull = useAssetResolver('full')
  const exportOption = useImageStackStore((state) => state.exportOption)
  const [isBusy, setIsBusy] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const previewRef = useRef<string | null>(null)

  const target = { geometry: layout, style, resolveAsset: resolveFull, option: exportOption }
  const segments = layout.segments
  const segmented = segments.length > 1
  const empty = layout.bands.length === 0
  const unsplittable = layout.unsplittable.length > 0
  // 单张就超上限时连分段都救不了，只能让用户先减宽度或换图
  const blocked = empty || unsplittable
  const losesAlpha = !supportsAlpha(exportOption.format) && style.background.type === 'transparent'

  useEffect(() => {
    return () => {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current)
      }
    }
  }, [])

  const run = useCallback(
    async (action: () => Promise<void>) => {
      setIsBusy(true)
      try {
        await action()
      } catch {
        toast.error(t(unsplittable ? 'long.unsplittable' : 'export.failed'))
      } finally {
        setIsBusy(false)
      }
    },
    [t, unsplittable],
  )

  const busy = isBusy || blocked

  return (
    <>
      <ExportDialogShell
        disabled={empty}
        description={t('long.pixels', {
          width: layout.width,
          height: layout.height,
          megapixels: Math.round((layout.width * layout.height) / 10_000) / 100,
        })}
        footer={(close) => (
          <>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={busy || segmented || !CLIPBOARD_SUPPORTED}
              title={
                segmented
                  ? t('long.segmentsBlocked')
                  : CLIPBOARD_SUPPORTED
                    ? undefined
                    : t('export.clipboardUnsupported')
              }
              onClick={() =>
                run(async () => {
                  await copyBlobToClipboard(await renderLongToBlob(target))
                  toast.success(t('export.copied'))
                })
              }
            >
              <Clipboard className="size-4" />
              {t('export.copy')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={isBusy || blocked}
              onClick={() => {
                close()
                run(async () => {
                  const window = segmented ? segments[0] : undefined
                  const blob = await renderLongToBlob(target, window, window ? 'top' : 'all')
                  if (previewRef.current) {
                    URL.revokeObjectURL(previewRef.current)
                  }
                  previewRef.current = URL.createObjectURL(blob)
                  setPreviewUrl(previewRef.current)
                  setPreviewOpen(true)
                })
              }}
            >
              <Eye className="size-4" />
              {segmented ? t('long.previewFirst') : t('export.preview')}
            </Button>
            {segmented ? (
              <Button
                size="sm"
                className="gap-1.5"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const names = segments.map((_, index) =>
                      buildLongSegmentName(index, segments.length, exportOption.format),
                    )
                    downloadBlob(
                      await buildSliceZip(await renderLongSegments(target, names)),
                      buildLongZipName(),
                    )
                    toast.success(t('export.zipDone', { total: segments.length }))
                  })
                }
              >
                <FolderArchive className="size-4" />
                {t('export.zip')}
              </Button>
            ) : (
              <Button
                size="sm"
                className="gap-1.5"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    downloadBlob(
                      await renderLongToBlob(target),
                      buildLongFileName(exportOption.format),
                    )
                  })
                }
              >
                <Download className="size-4" />
                {t('export.download')}
              </Button>
            )}
          </>
        )}
      >
        <FormatControls />
        {losesAlpha ? (
          <p className="text-muted-foreground text-xs">{t('export.alphaLost')}</p>
        ) : null}
        {segmented ? (
          <p className="text-muted-foreground text-xs">
            {t('long.segments', { total: segments.length, px: layout.maxSegmentHeight })}
          </p>
        ) : null}
        {unsplittable ? (
          <p className="text-destructive text-xs">
            {t('long.unsplittable', { total: layout.unsplittable.length })}
          </p>
        ) : null}
      </ExportDialogShell>

      {previewUrl ? (
        <ImageLightbox
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          src={previewUrl}
          alt={t('export.previewAlt')}
          caption={`${layout.width} × ${layout.height}`}
        />
      ) : null}
    </>
  )
}

function SplitExport() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const geometry = useSplitGeometry()
  const exportOption = useImageStackStore((state) => state.exportOption)
  const [isBusy, setIsBusy] = useState(false)

  const cols = geometry?.template.cols.length ?? 0
  const first = geometry?.cells[0]

  const slices = useCallback(async () => {
    if (!geometry) {
      return null
    }
    const names = buildSliceNames(
      geometry.source.name,
      cols,
      geometry.cells.length,
      exportOption.format,
    )
    return renderSlices(geometry.source, geometry.cells, names, exportOption)
  }, [geometry, cols, exportOption])

  const run = useCallback(
    async (action: () => Promise<void>) => {
      setIsBusy(true)
      try {
        await action()
      } catch {
        toast.error(t('export.failed'))
      } finally {
        setIsBusy(false)
      }
    },
    [t],
  )

  const disabled = !geometry || isBusy

  return (
    <ExportDialogShell
      disabled={!geometry}
      description={
        geometry && first
          ? t('export.splitSummary', {
              total: geometry.cells.length,
              width: first.width,
              height: first.height,
              extension: extensionOf(exportOption.format),
            })
          : t('export.splitEmpty')
      }
      footer={() => (
        <>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={disabled}
            onClick={() =>
              run(async () => {
                const files = await slices()
                for (const file of files ?? []) {
                  downloadBlob(file.blob, file.name)
                }
              })
            }
          >
            <Download className="size-4" />
            {t('export.each')}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={disabled}
            onClick={() =>
              run(async () => {
                const files = await slices()
                if (!files || files.length === 0 || !geometry) {
                  return
                }
                downloadBlob(await buildSliceZip(files), buildSliceZipName(geometry.source.name))
                toast.success(t('export.zipDone', { total: files.length }))
              })
            }
          >
            <FolderArchive className="size-4" />
            {t('export.zip')}
          </Button>
        </>
      )}
    >
      <FormatControls />
      {geometry ? (
        <p className="text-muted-foreground text-xs">
          {t('crop.summary', {
            sourceWidth: geometry.source.width,
            sourceHeight: geometry.source.height,
            cropWidth: geometry.crop.width,
            cropHeight: geometry.crop.height,
          })}
        </p>
      ) : null}
    </ExportDialogShell>
  )
}

/** 导出收进弹窗，所以侧栏不再为它单独占一张卡；三档只是动作不同 */
export function ExportDialog() {
  const mode = useImageStackStore((state) => state.mode)
  if (mode === 'stitch') {
    return <StitchExport />
  }
  return mode === 'long' ? <LongExport /> : <SplitExport />
}
