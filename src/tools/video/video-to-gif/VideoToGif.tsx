import { Download, Loader2, ShieldCheck, Wand2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FileDropZone } from '@/components/file-drop-zone'
import { VideoToGifIcon } from '@/components/icons/video-to-gif-icon'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  PanelGroup,
  PanelNumberField,
  PanelSection,
  PanelSelectField,
} from '@/components/panel-fields'
import { useIsMobile } from '@/composable/use-breakpoint'
import { centerCrop } from '@/modules/gif/crop'
import { attachHiddenVideo, detachVideo, extractVideoFrames } from '@/modules/gif/video-frames'
import { shrinkToTarget } from '@/modules/gif/shrink'
import { PLATFORM_TARGETS, type EncodeParams } from '@/modules/gif/targets'
import { useGifWorker } from '@/modules/gif/worker/use-gif-worker'
import { downloadBlob } from '@/utils/download'
import { formatBytes } from '@/utils/format-bytes'

import {
  ASPECTS,
  FPS_OPTIONS,
  gifFileName,
  isVideoFile,
  rangeSeconds,
  sizeForCrop,
  videoBudget,
  VIDEO_ACCEPT,
  WIDTH_OPTIONS,
  type AspectId,
} from './video-to-gif.service'

type Meta = { width: number; height: number; duration: number }

type Settings = {
  startSec: number
  endSec: number
  fps: number
  width: number
  aspect: AspectId
  loopCount: number
  /** 'off' 表示不做达标搜索；其余是平台预设 id 或 'custom' */
  target: string
  customKb: number
}

type Result = {
  blob: Blob
  url: string
  frames: number
  params: EncodeParams | null
  rounds: number
}

/** 视频转 GIF：主线程逐帧 seek 取像素，Worker 里量化编码，可选按平台体积达标搜索。 */
export default function VideoToGif() {
  const { t } = useTranslation('tools-video', { keyPrefix: 'video-to-gif' })
  const isMobile = useIsMobile()
  const { encode, optimize } = useGifWorker()
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState('clip.mp4')
  const [meta, setMeta] = useState<Meta | null>(null)
  const [settings, setSettings] = useState<Settings>({
    startSec: 0,
    endSec: 0,
    fps: 12,
    width: 320,
    aspect: 'source',
    loopCount: 0,
    target: 'off',
    customKb: 200,
  })
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!result) return
    return () => URL.revokeObjectURL(result.url)
  }, [result])

  const loadFile = useCallback(
    async (file: File) => {
      if (!isVideoFile(file)) {
        setError(t('error-unsupported'))
        return
      }
      setError(null)
      setResult(null)
      setMeta(null)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      const url = URL.createObjectURL(file)
      urlRef.current = url
      setVideoUrl(url)
      setFileName(file.name)

      const probe = document.createElement('video')
      probe.preload = 'metadata'
      probe.muted = true
      probe.src = url
      try {
        const meta_ = await new Promise<Meta>((resolve, reject) => {
          probe.onloadedmetadata = () =>
            resolve({
              width: probe.videoWidth,
              height: probe.videoHeight,
              duration: probe.duration,
            })
          probe.onerror = () => reject(new Error('decode failed'))
          setTimeout(() => reject(new Error('decode timeout')), 10000)
        })
        if (!Number.isFinite(meta_.width) || meta_.width < 1) {
          throw new Error('no dimensions')
        }
        setMeta(meta_)
        setSettings((current) => ({ ...current, endSec: Math.min(meta_.duration, 20) }))
      } catch {
        setError(t('error-unsupported'))
        setVideoUrl(null)
      } finally {
        probe.removeAttribute('src')
      }
    },
    [t],
  )

  const delayCs = Math.max(1, Math.round(100 / settings.fps))
  const crop = meta
    ? centerCrop(meta, ASPECTS.find((item) => item.id === settings.aspect)?.ratio ?? null)
    : null
  const size = crop ? sizeForCrop(crop, settings.width) : null
  const frames =
    meta && size
      ? Math.round(
          rangeSeconds(settings.startSec, Math.min(settings.endSec, meta.duration)) * settings.fps,
        )
      : 0
  const budget = size ? videoBudget({ frames, size, delayCs, isMobile }) : null

  async function build() {
    if (!videoUrl || !meta || !crop || !size || frames < 1) return
    setBusy(true)
    setError(null)
    setNotice(null)
    setProgress({ done: 0, total: frames })
    const hidden = attachHiddenVideo(videoUrl)
    try {
      await new Promise<void>((resolve, reject) => {
        hidden.onloadeddata = () => resolve()
        hidden.onerror = () => reject(new Error('decode failed'))
        setTimeout(() => reject(new Error('decode timeout')), 15000)
      })
      const extraction = await extractVideoFrames(hidden, {
        startSec: settings.startSec,
        endSec: Math.min(settings.endSec, meta.duration),
        fps: settings.fps,
        size,
        crop,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      if (extraction.frames.length === 0) {
        throw new Error('no frames extracted')
      }
      if (extraction.skipped > 0) {
        setNotice(t('notice-skipped', { n: extraction.skipped }))
      }
      let blob = await encode(extraction.frames, {
        maxColors: 256,
        loopCount: settings.loopCount,
        delayCs,
      })
      let params: EncodeParams | null = null
      let rounds = 1

      if (settings.target !== 'off') {
        const targetBytes =
          settings.target === 'custom'
            ? Math.round(settings.customKb * 1024)
            : (PLATFORM_TARGETS.find((item) => item.id === settings.target)?.maxBytes ?? 0)
        const outcome = await shrinkToTarget({
          bytes: await blob.arrayBuffer(),
          source: size,
          targetBytes,
          start: { width: size.width, fps: settings.fps, maxColors: 256, lossy: 0 },
          optimize,
        })
        blob = outcome.blob
        params = outcome.params
        rounds = outcome.rounds
      }

      setResult({
        blob,
        url: URL.createObjectURL(blob),
        frames: extraction.frames.length,
        params,
        rounds,
      })
    } catch {
      setError(t('error-build'))
    } finally {
      detachVideo(hidden)
      setBusy(false)
      setProgress(null)
    }
  }

  const workspace =
    !meta || !videoUrl ? (
      <FileDropZone
        accept={VIDEO_ACCEPT}
        title={t('drop-title')}
        subtitle={t('drop-subtitle')}
        browseLabel={t('browse')}
        icon={VideoToGifIcon}
        minHeightClass="min-h-[360px]"
        onFiles={(files) => void loadFile(files[0])}
      />
    ) : (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {meta.width}×{meta.height} · {meta.duration.toFixed(1)}s
          </Badge>
          <span className="text-muted-foreground text-sm">{fileName}</span>
        </div>
        <video src={videoUrl} controls className="max-h-80 w-full rounded-md border bg-black" />
        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t('result-title')} · {formatBytes(result.blob.size)} · {result.frames}{' '}
                {t('frames-unit')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <img src={result.url} alt="" className="max-h-72 w-fit rounded-md border" />
              {result.params && (
                <p className="text-muted-foreground text-xs">
                  {t('result-params', {
                    width: result.params.width,
                    colors: result.params.maxColors,
                    lossy: result.params.lossy,
                    rounds: result.rounds,
                  })}
                </p>
              )}
              <Button
                className="w-fit"
                variant="outline"
                onClick={() => downloadBlob(result.blob, gifFileName(fileName))}
              >
                <Download className="size-4" />
                {t('download-button')}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    )

  const panel = (
    <PanelGroup>
      <PanelSection title={t('section-range')}>
        <PanelNumberField
          label={t('start-label')}
          value={String(settings.startSec)}
          min={0}
          max={meta?.duration ?? 0}
          step={0.1}
          onChange={(value) => setSettings({ ...settings, startSec: Number(value) })}
        />
        <PanelNumberField
          label={t('end-label')}
          value={String(settings.endSec)}
          min={0}
          max={meta?.duration ?? 0}
          step={0.1}
          onChange={(value) => setSettings({ ...settings, endSec: Number(value) })}
        />
      </PanelSection>

      <PanelSection title={t('section-output')}>
        <PanelSelectField
          label={t('fps-label')}
          value={String(settings.fps)}
          onChange={(value) => setSettings({ ...settings, fps: Number(value) })}
          options={FPS_OPTIONS.map((fps) => ({ value: String(fps), label: fps + ' fps' }))}
        />
        <PanelSelectField
          label={t('width-label')}
          value={String(settings.width)}
          onChange={(value) => setSettings({ ...settings, width: Number(value) })}
          options={WIDTH_OPTIONS.map((width) => ({ value: String(width), label: width + ' px' }))}
        />
        <PanelSelectField
          label={t('aspect-label')}
          value={settings.aspect}
          onChange={(value) => setSettings({ ...settings, aspect: value as AspectId })}
          options={ASPECTS.map((aspect) => ({ value: aspect.id, label: t(`aspect-${aspect.id}`) }))}
        />
        <PanelSelectField
          label={t('loop-label')}
          value={String(settings.loopCount)}
          onChange={(value) => setSettings({ ...settings, loopCount: Number(value) })}
          options={[
            { value: '0', label: t('loop-infinite') },
            ...[1, 2, 3].map((n) => ({ value: String(n), label: t('loop-times', { n }) })),
          ]}
        />
      </PanelSection>

      <PanelSection title={t('section-target')}>
        <PanelSelectField
          span={2}
          label={t('target-label')}
          value={settings.target}
          onChange={(value) => setSettings({ ...settings, target: value })}
          options={[
            { value: 'off', label: t('target-off') },
            ...PLATFORM_TARGETS.map((target) => ({
              value: target.id,
              label: target.label + ' \u00b7 ' + formatBytes(target.maxBytes),
            })),
            { value: 'custom', label: t('target-custom') },
          ]}
        />
        {settings.target === 'custom' && (
          <PanelNumberField
            span={2}
            label={t('custom-kb-label')}
            value={String(settings.customKb)}
            min={1}
            onChange={(value) => setSettings({ ...settings, customKb: Number(value) })}
          />
        )}
      </PanelSection>

      <PanelSection title={t('section-export')}>
        <div className="col-span-2 flex flex-col gap-2">
          <Button
            onClick={() => void build()}
            disabled={busy || !meta || !budget?.ok || frames < 1}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            {busy ? t('extracting') : t('build-button')}
          </Button>
          {progress && <Progress value={(progress.done / Math.max(1, progress.total)) * 100} />}
          {meta && (
            <p className="text-muted-foreground text-xs">
              {t('plan', { frames, seconds: ((frames * delayCs) / 100).toFixed(1) })}
            </p>
          )}
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
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
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
