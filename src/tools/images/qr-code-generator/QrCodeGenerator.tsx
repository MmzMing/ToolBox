import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  QR_MARGIN_RANGE,
  QR_WIDTH_RANGE,
  generateQrDataUrl,
  generateQrSvg,
  qrErrorCorrectionLevels,
  type QrErrorCorrectionLevel,
} from './qr-code-generator.service'

export default function QrCodeGenerator() {
  const { t } = useTranslation('tools-images')
  const { t: tCommon } = useTranslation('common')

  const [text, setText] = useState('https://example.com')
  const [errorCorrectionLevel, setErrorCorrectionLevel] = useState<QrErrorCorrectionLevel>('M')
  const [width, setWidth] = useState(256)
  const [margin, setMargin] = useState(2)
  const [darkColor, setDarkColor] = useState('#000000')
  const [lightColor, setLightColor] = useState('#ffffff')
  const [isSvg, setIsSvg] = useState(false)

  const [pngDataUrl, setPngDataUrl] = useState('')
  const [svgMarkup, setSvgMarkup] = useState('')
  const [hasError, setHasError] = useState(false)

  const options = useMemo(
    () => ({ errorCorrectionLevel, width, margin, darkColor, lightColor }),
    [errorCorrectionLevel, width, margin, darkColor, lightColor],
  )

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (text === '') {
        setPngDataUrl('')
        setSvgMarkup('')
        setHasError(false)
        return
      }
      const task = isSvg
        ? generateQrSvg(text, options).then((svg) => {
            if (!cancelled) {
              setSvgMarkup(svg)
              setPngDataUrl('')
              setHasError(false)
            }
          })
        : generateQrDataUrl(text, options).then((dataUrl) => {
            if (!cancelled) {
              setPngDataUrl(dataUrl)
              setSvgMarkup('')
              setHasError(false)
            }
          })
      void task.catch(() => {
        if (!cancelled) {
          setHasError(true)
        }
      })
    }, 150)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [text, isSvg, options])

  const activePng = text === '' ? '' : pngDataUrl
  const activeSvg = text === '' ? '' : svgMarkup

  const previewSrc = isSvg
    ? activeSvg === ''
      ? ''
      : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(activeSvg)}`
    : activePng

  const handleDownload = () => {
    if (isSvg && activeSvg !== '') {
      const url = URL.createObjectURL(new Blob([activeSvg], { type: 'image/svg+xml' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'qr-code.svg'
      anchor.click()
      URL.revokeObjectURL(url)
      return
    }
    if (activePng !== '') {
      const anchor = document.createElement('a')
      anchor.href = activePng
      anchor.download = 'qr-code.png'
      anchor.click()
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{t('qr-code-generator.textLabel')}</Label>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="https://example.com"
          className="min-h-24 font-mono text-sm"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('qr-code-generator.levelLabel')}</Label>
        <RadioGroup
          value={errorCorrectionLevel}
          onValueChange={(value) => setErrorCorrectionLevel(value as QrErrorCorrectionLevel)}
          className="flex flex-wrap gap-x-6 gap-y-2"
        >
          {qrErrorCorrectionLevels.map((level) => (
            <Label key={level} className="flex items-center gap-2 font-normal">
              <RadioGroupItem value={level} />
              {t(`qr-code-generator.level-${level}`)}
            </Label>
          ))}
        </RadioGroup>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>
            {t('qr-code-generator.sizeLabel')} ({width})
          </Label>
          <Slider
            min={QR_WIDTH_RANGE.min}
            max={QR_WIDTH_RANGE.max}
            step={16}
            value={[width]}
            onValueChange={(values) => setWidth(values[0] ?? width)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>
            {t('qr-code-generator.marginLabel')} ({margin})
          </Label>
          <Slider
            min={QR_MARGIN_RANGE.min}
            max={QR_MARGIN_RANGE.max}
            step={1}
            value={[margin]}
            onValueChange={(values) => setMargin(values[0] ?? margin)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <Label htmlFor="qr-dark-color">{t('qr-code-generator.darkColorLabel')}</Label>
          <Input
            id="qr-dark-color"
            type="color"
            value={darkColor}
            onChange={(event) => setDarkColor(event.target.value)}
            className="size-9 cursor-pointer p-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="qr-light-color">{t('qr-code-generator.lightColorLabel')}</Label>
          <Input
            id="qr-light-color"
            type="color"
            value={lightColor}
            onChange={(event) => setLightColor(event.target.value)}
            className="size-9 cursor-pointer p-1"
          />
        </div>
        <Label className="flex items-center gap-2 font-normal">
          <Switch checked={isSvg} onCheckedChange={setIsSvg} />
          {t('qr-code-generator.svgFormat')}
        </Label>
      </div>

      {hasError && (
        <Alert variant="destructive">
          <AlertDescription>{tCommon('error')}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label>{t('qr-code-generator.previewLabel')}</Label>
        {previewSrc === '' ? (
          <div className="text-muted-foreground flex min-h-40 items-center justify-center rounded-lg border border-dashed text-sm">
            {t('qr-code-generator.emptyPreview')}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <img
              src={previewSrc}
              alt="QR code preview"
              width={Math.min(width, 320)}
              height={Math.min(width, 320)}
              className="max-w-full rounded-lg border"
            />
            <Button onClick={handleDownload}>
              <Download data-icon="inline-start" />
              {isSvg ? t('qr-code-generator.downloadSvg') : t('qr-code-generator.downloadPng')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
