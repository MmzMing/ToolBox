import { Download, Film, Loader2, ShieldCheck, Wand2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FileAddButtons, FileDropZone } from '@/components/file-drop-zone'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  PanelField,
  PanelGroup,
  PanelRadioField,
  PanelSection,
  PanelSelectField,
  PanelSwitchField,
} from '@/components/panel-fields'
import { useIsMobile } from '@/composable/use-breakpoint'
import { optimizeOptionsFor } from '@/modules/gif/optimize'
import { shrinkToTarget } from '@/modules/gif/shrink'
import { PLATFORM_TARGETS, type EncodeParams, type PlatformTargetId } from '@/modules/gif/targets'
import type { GifDescriptor } from '@/modules/gif/types'
import { useGifWorker } from '@/modules/gif/worker/use-gif-worker'
import { downloadBlob } from '@/utils/download'
import { formatBytes } from '@/utils/format-bytes'

import {
  budgetForDescriptor,
  customTargetBytes,
  MANUAL_COLORS,
  MANUAL_LOSSY,
  MANUAL_WIDTHS,
  manualToPlan,
  summarizeResult,
  targetBytesOf,
  type CompressMode,
  type ManualOptions,
} from './gif-compressor.service'

type Mode = 'manual' | 'target'

type Result = {
  blob: Blob
  url: string
  params: EncodeParams
  rounds: number
  metTarget: boolean
  originalBytes: number
}

/** GIF 压缩：左预览/结果，右参数面板；目标体积模式下自动搜索达标参数。全程本地处理。 */
export default function GifCompressor() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'gif-compressor' })
  const isMobile = useIsMobile()
  const { inspect, optimize } = useGifWorker()

  const [source, setSource] = useState<ArrayBuffer | null>(null)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState('source.gif')
  const [descriptor, setDescriptor] = useState<GifDescriptor | null>(null)
  const [mode, setMode] = useState<Mode>('target')
  const [manual, setManual] = useState<ManualOptions>({
    width: 320,
    maxColors: 128,
    lossy: 80,
    dither: false,
  })
  const [preset, setPreset] = useState<PlatformTargetId>('slack')
  const [customKb, setCustomKb] = useState('200')
  const [useCustom, setUseCustom] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    if (!result) return
    return () => URL.revokeObjectURL(result.url)
  }, [result])

  useEffect(() => {
    if (!sourceUrl) return
    return () => URL.revokeObjectURL(sourceUrl)
  }, [sourceUrl])

  const budget = descriptor ? budgetForDescriptor(descriptor, isMobile) : null
  const summary = result ? summarizeResult(result.originalBytes, result.blob.size) : null

  const handleFiles = useCallback(
    async (files: File[]) => {
      const file = files.find((item) => /\.gif$/i.test(item.name) || item.type === 'image/gif')
      if (!file) {
        setError(t('error-invalid'))
        return
      }
      setError(null)
      setResult(null)
      setDescriptor(null)
      try {
        const bytes = await file.arrayBuffer()
        const info = await inspect(bytes)
        setSource(bytes)
        setSourceUrl(URL.createObjectURL(file))
        setDescriptor(info)
        setFileName(file.name)
        setManual((current) => ({ ...current, width: Math.min(current.width, info.width) }))
      } catch {
        setError(t('error-invalid'))
      }
    },
    [inspect, t],
  )

  const runCompress = useCallback(async () => {
    if (!source || !descriptor) return
    setBusy(true)
    setError(null)
    try {
      let params: EncodeParams
      let rounds = 1
      let blob: Blob
      let metTarget: boolean

      if (mode === 'manual') {
        const plan = manualToPlan(manual)
        params = plan.params
        blob = await optimize(source, optimizeOptionsFor(params, descriptor, plan.dither).options)
        metTarget = blob.size <= source.byteLength
      } else {
        const targetBytes = useCustom ? customTargetBytes(Number(customKb)) : targetBytesOf(preset)
        const outcome = await shrinkToTarget({
          bytes: source,
          source: descriptor,
          targetBytes,
          optimize,
        })
        params = outcome.params
        rounds = outcome.rounds
        blob = outcome.blob
        metTarget = outcome.ok
      }

      setResult({
        blob,
        url: URL.createObjectURL(blob),
        params,
        rounds,
        originalBytes: source.byteLength,
        metTarget,
      })
    } catch {
      setError(t('error-generic'))
    } finally {
      setBusy(false)
    }
  }, [customKb, descriptor, manual, mode, optimize, preset, source, t, useCustom])

  const workspace =
    descriptor && budget?.ok ? (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <FileAddButtons
            accept="image/gif,.gif"
            browseLabel={t('choose-file')}
            onFiles={(files) => void handleFiles(files)}
          />
          <span className="text-muted-foreground text-sm">
            {fileName} · {descriptor.width}×{descriptor.height} · {descriptor.frameCount}{' '}
            {t('frames-unit')}
          </span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('result-title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!result && <p className="text-muted-foreground text-sm">{t('result-empty')}</p>}
            {result && summary && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={result.metTarget ? 'default' : 'destructive'}>
                    {result.metTarget ? t('badge-pass') : t('badge-fail')}
                  </Badge>
                  <span className="text-sm">
                    {formatBytes(result.originalBytes)} → {formatBytes(result.blob.size)}
                  </span>
                  <span
                    className={
                      summary.grew ? 'text-destructive text-sm' : 'text-muted-foreground text-sm'
                    }
                  >
                    {summary.grew
                      ? t('result-grew')
                      : t('result-saved', { percent: Math.round(summary.savedRatio * 100) })}
                  </span>
                </div>
                <div className="flex flex-wrap items-start gap-4">
                  <figure className="flex flex-col gap-1">
                    <img src={result.url} alt="" className="max-h-72 rounded-md border" />
                    <figcaption className="text-muted-foreground text-xs">
                      {t('caption-result')} · {formatBytes(result.blob.size)}
                    </figcaption>
                  </figure>
                  <figure className="flex flex-col gap-1">
                    <img
                      src={sourceUrl ?? undefined}
                      alt=""
                      className="max-h-72 rounded-md border"
                    />
                    <figcaption className="text-muted-foreground text-xs">
                      {t('caption-original')} · {formatBytes(result.originalBytes)}
                    </figcaption>
                  </figure>
                </div>
                <p className="text-muted-foreground text-xs">
                  {t('result-params', {
                    width: result.params.width,
                    colors: result.params.maxColors,
                    lossy: result.params.lossy,
                    rounds: result.rounds,
                  })}
                </p>
                <Button
                  onClick={() =>
                    downloadBlob(result.blob, fileName.replace(/\.gif$/i, '') + '-compressed.gif')
                  }
                  variant="outline"
                  className="w-fit"
                >
                  <Download className="size-4" />
                  {t('download-button')}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    ) : (
      <FileDropZone
        accept="image/gif,.gif"
        title={t('drop-title')}
        subtitle={t('drop-subtitle')}
        browseLabel={t('choose-file')}
        pasteHint={t('paste-hint')}
        icon={Film}
        onFiles={(files) => void handleFiles(files)}
      />
    )

  const panel = (
    <PanelGroup>
      <PanelSection title={t('section-target')}>
        <PanelRadioField
          label={t('mode-label')}
          value={mode}
          onChange={(value) => setMode(value as CompressMode)}
          options={[
            { value: 'target', label: t('mode-target') },
            { value: 'manual', label: t('mode-manual') },
          ]}
        />
        {mode === 'target' && (
          <PanelField span={2} label={t('preset-label')}>
            <div className="flex flex-col gap-2">
              {PLATFORM_TARGETS.map((target) => (
                <Label
                  key={target.id}
                  className="flex cursor-pointer items-center gap-2 text-sm font-normal"
                >
                  <input
                    type="radio"
                    name="preset"
                    className="accent-primary"
                    checked={!useCustom && preset === target.id}
                    onChange={() => {
                      setPreset(target.id)
                      setUseCustom(false)
                    }}
                  />
                  {target.label}
                  <Badge variant="outline">{formatBytes(target.maxBytes)}</Badge>
                  {target.referenceOnly && (
                    <span className="text-muted-foreground text-xs">{t('reference-only')}</span>
                  )}
                </Label>
              ))}
              <Label className="flex cursor-pointer items-center gap-2 text-sm font-normal">
                <input
                  type="radio"
                  name="preset"
                  className="accent-primary"
                  checked={useCustom}
                  onChange={() => setUseCustom(true)}
                />
                {t('preset-custom')}
                <Input
                  value={customKb}
                  onChange={(event) => setCustomKb(event.target.value)}
                  className="h-8 w-24"
                  inputMode="numeric"
                />
                KB
              </Label>
            </div>
          </PanelField>
        )}
      </PanelSection>

      {mode === 'manual' && (
        <PanelSection title={t('section-manual')}>
          <PanelSelectField
            label={t('width-label')}
            value={String(manual.width)}
            onChange={(value) => setManual({ ...manual, width: Number(value) })}
            options={MANUAL_WIDTHS.filter((width) => !descriptor || width <= descriptor.width).map(
              (width) => ({ value: String(width), label: width + ' px' }),
            )}
          />
          <PanelSelectField
            label={t('colors-label')}
            value={String(manual.maxColors)}
            onChange={(value) => setManual({ ...manual, maxColors: Number(value) })}
            options={MANUAL_COLORS.map((colors) => ({
              value: String(colors),
              label: String(colors),
            }))}
          />
          <PanelSelectField
            label={t('lossy-label')}
            tip={t('lossy-hint')}
            value={String(manual.lossy)}
            onChange={(value) => setManual({ ...manual, lossy: Number(value) })}
            options={MANUAL_LOSSY.map((lossy) => ({ value: String(lossy), label: String(lossy) }))}
          />
          <PanelSwitchField
            label={t('dither-label')}
            tip={t('dither-hint')}
            checked={manual.dither}
            onChange={(checked) => setManual({ ...manual, dither: checked })}
          />
        </PanelSection>
      )}

      <PanelSection title={t('section-export')}>
        <div className="col-span-2 flex flex-col gap-2">
          <Button onClick={() => void runCompress()} disabled={busy || !descriptor || !budget?.ok}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            {busy ? t('compressing') : t('compress-button')}
          </Button>
          <p className="text-muted-foreground flex items-center gap-1 text-xs">
            <ShieldCheck className="size-3.5" />
            {t('privacy-note')}
          </p>
        </div>
      </PanelSection>
    </PanelGroup>
  )

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {budget && !budget.ok && (
        <Alert variant="destructive">
          <AlertDescription>
            {t(`budget-${budget.reason}`, { limit: budget.suggestion[budget.reason] })}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <div className="min-w-0">{workspace}</div>
        <div className="min-w-0">{panel}</div>
      </div>
    </div>
  )
}
