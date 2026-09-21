import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ParamField } from '@/components/param-field'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  QR_MARGIN_RANGE,
  QR_WIDTH_RANGE,
  generateQrDataUrl,
  generateQrSvg,
  qrErrorCorrectionLevels,
  type QrErrorCorrectionLevel,
} from '../qr-code.service'

const outputFormats = ['png', 'svg'] as const

type OutputFormat = (typeof outputFormats)[number]

/** 生成侧：左侧实时预览，右侧参数卡片 */
export function GeneratePanel() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'qr-code.generate' })
  const { t: tCommon } = useTranslation('common')

  const [text, setText] = useState('https://example.com')
  const [errorCorrectionLevel, setErrorCorrectionLevel] = useState<QrErrorCorrectionLevel>('M')
  const [width, setWidth] = useState(256)
  const [margin, setMargin] = useState(2)
  const [darkColor, setDarkColor] = useState('#000000')
  const [lightColor, setLightColor] = useState('#ffffff')
  const [format, setFormat] = useState<OutputFormat>('png')

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
        setSvgMarkup('')
        setHasError(false)
        return
      }
      // 预览始终走矢量：放大不糊，导出格式由「输出格式」单独决定
      void generateQrSvg(text, options)
        .then((svg) => {
          if (!cancelled) {
            setSvgMarkup(svg)
            setHasError(false)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setHasError(true)
          }
        })
    }, 150)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [text, options])

  const activeSvg = text === '' ? '' : svgMarkup
  const previewSrc =
    activeSvg === '' ? '' : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(activeSvg)}`

  const handleDownload = async () => {
    if (text === '') {
      return
    }
    const anchor = document.createElement('a')
    anchor.download = `qr-code.${format}`
    if (format === 'svg') {
      const url = URL.createObjectURL(new Blob([activeSvg], { type: 'image/svg+xml' }))
      anchor.href = url
      anchor.click()
      URL.revokeObjectURL(url)
      return
    }
    try {
      anchor.href = await generateQrDataUrl(text, options)
      anchor.click()
    } catch {
      setHasError(true)
    }
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-3">
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-4 md:min-h-80">
          {previewSrc === '' ? (
            <p className="text-muted-foreground text-sm">{t('emptyPreview')}</p>
          ) : (
            <img
              src={previewSrc}
              alt="QR code preview"
              className="max-h-[min(52vh,420px)] w-auto max-w-full"
            />
          )}
        </div>
        <p className="text-muted-foreground text-center text-xs">
          {width} × {width} px
        </p>
        {hasError && (
          <Alert variant="destructive">
            <AlertDescription>{tCommon('error')}</AlertDescription>
          </Alert>
        )}
      </div>

      <Card className="gap-4">
        <CardHeader className="border-b pb-0">
          <CardTitle className="text-sm">{t('paramsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ParamField label={t('textLabel')}>
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t('textPlaceholder')}
              className="min-h-20 font-mono text-sm"
            />
          </ParamField>

          <Separator />

          <ParamField label={t('levelLabel')} hint={t(`level-${errorCorrectionLevel}`)}>
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              value={errorCorrectionLevel}
              onValueChange={(value) => {
                if (value) {
                  setErrorCorrectionLevel(value as QrErrorCorrectionLevel)
                }
              }}
              className="w-full"
            >
              {qrErrorCorrectionLevels.map((level) => (
                <ToggleGroupItem key={level} value={level} className="flex-1">
                  {level}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </ParamField>

          <ParamField label={t('sizeLabel')} hint={`${width} px`}>
            <Slider
              min={QR_WIDTH_RANGE.min}
              max={QR_WIDTH_RANGE.max}
              step={16}
              value={[width]}
              onValueChange={(values) => setWidth(values[0] ?? width)}
            />
          </ParamField>

          <ParamField label={t('marginLabel')} hint={String(margin)}>
            <Slider
              min={QR_MARGIN_RANGE.min}
              max={QR_MARGIN_RANGE.max}
              step={1}
              value={[margin]}
              onValueChange={(values) => setMargin(values[0] ?? margin)}
            />
          </ParamField>

          <div className="grid grid-cols-2 gap-3">
            <ParamField label={t('darkColorLabel')}>
              <Input
                type="color"
                value={darkColor}
                onChange={(event) => setDarkColor(event.target.value)}
                aria-label={t('darkColorLabel')}
                className="h-8 w-full cursor-pointer p-1"
              />
            </ParamField>
            <ParamField label={t('lightColorLabel')}>
              <Input
                type="color"
                value={lightColor}
                onChange={(event) => setLightColor(event.target.value)}
                aria-label={t('lightColorLabel')}
                className="h-8 w-full cursor-pointer p-1"
              />
            </ParamField>
          </div>

          <Separator />

          <ParamField label={t('formatLabel')}>
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              value={format}
              onValueChange={(value) => {
                if (value) {
                  setFormat(value as OutputFormat)
                }
              }}
              className="w-full"
            >
              {outputFormats.map((value) => (
                <ToggleGroupItem key={value} value={value} className="flex-1">
                  {value.toUpperCase()}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </ParamField>
        </CardContent>
        <CardFooter className="border-t pt-4">
          <Button
            className="w-full"
            disabled={previewSrc === ''}
            onClick={() => void handleDownload()}
          >
            <Download data-icon="inline-start" />
            {format === 'svg' ? t('downloadSvg') : t('downloadPng')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
