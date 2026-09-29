import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  PanelField,
  PanelGroup,
  PanelRadioField,
  PanelSection,
  PanelSliderField,
} from '@/components/panel-fields'
import { Textarea } from '@/components/ui/textarea'
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

/** 生成侧：左侧实时预览，右侧分节参数栏 */
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
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
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

      <PanelGroup>
        <PanelSection title={t('sectionContent')}>
          <PanelField label={t('textLabel')} span={2} htmlFor="qr-text">
            <Textarea
              id="qr-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t('textPlaceholder')}
              className="min-h-20 font-mono text-sm"
            />
          </PanelField>
        </PanelSection>

        <PanelSection title={t('sectionStyle')}>
          <PanelRadioField
            label={t('levelLabel')}
            hint={t(`level-${errorCorrectionLevel}`)}
            value={errorCorrectionLevel}
            onChange={(value) => setErrorCorrectionLevel(value as QrErrorCorrectionLevel)}
            options={qrErrorCorrectionLevels.map((level) => ({ value: level, label: level }))}
          />
          <PanelSliderField
            label={t('sizeLabel')}
            value={width}
            onChange={setWidth}
            min={QR_WIDTH_RANGE.min}
            max={QR_WIDTH_RANGE.max}
            step={16}
            format={(value) => `${value} px`}
          />
          <PanelSliderField
            label={t('marginLabel')}
            value={margin}
            onChange={setMargin}
            min={QR_MARGIN_RANGE.min}
            max={QR_MARGIN_RANGE.max}
            step={1}
            format={(value) => t('marginValue', { n: value })}
          />
          <PanelField label={t('darkColorLabel')} htmlFor="qr-dark-color">
            <Input
              id="qr-dark-color"
              type="color"
              value={darkColor}
              onChange={(event) => setDarkColor(event.target.value)}
              aria-label={t('darkColorLabel')}
              className="h-8 w-full cursor-pointer p-1"
            />
          </PanelField>
          <PanelField label={t('lightColorLabel')} htmlFor="qr-light-color">
            <Input
              id="qr-light-color"
              type="color"
              value={lightColor}
              onChange={(event) => setLightColor(event.target.value)}
              aria-label={t('lightColorLabel')}
              className="h-8 w-full cursor-pointer p-1"
            />
          </PanelField>
        </PanelSection>

        <PanelSection title={t('sectionExport')}>
          <PanelRadioField
            label={t('formatLabel')}
            value={format}
            onChange={(value) => setFormat(value as OutputFormat)}
            options={outputFormats.map((value) => ({ value, label: value.toUpperCase() }))}
          />
        </PanelSection>

        <div className="p-4">
          <Button
            className="w-full"
            disabled={previewSrc === ''}
            onClick={() => void handleDownload()}
          >
            <Download data-icon="inline-start" />
            {format === 'svg' ? t('downloadSvg') : t('downloadPng')}
          </Button>
        </div>
      </PanelGroup>
    </div>
  )
}
