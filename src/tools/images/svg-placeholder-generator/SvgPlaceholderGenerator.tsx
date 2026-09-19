import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { buildSvgPlaceholder, svgToDataUri } from './svg-placeholder-generator.service'

export default function SvgPlaceholderGenerator() {
  const { t } = useTranslation('tools-images')

  const [width, setWidth] = useState('800')
  const [height, setHeight] = useState('600')
  const [bgColor, setBgColor] = useState('#e2e8f0')
  const [fgColor, setFgColor] = useState('#334155')
  const [text, setText] = useState('')
  const [fontSize, setFontSize] = useState('24')

  const parsedWidth = Number(width)
  const parsedHeight = Number(height)
  const parsedFontSize = Number(fontSize)
  const isValid =
    Number.isFinite(parsedWidth) &&
    parsedWidth > 0 &&
    Number.isFinite(parsedHeight) &&
    parsedHeight > 0 &&
    Number.isFinite(parsedFontSize) &&
    parsedFontSize > 0

  const svg = useMemo(() => {
    if (!isValid) {
      return ''
    }
    const resolvedText = text === '' ? `${parsedWidth}×${parsedHeight}` : text
    try {
      return buildSvgPlaceholder({
        width: parsedWidth,
        height: parsedHeight,
        bgColor,
        fgColor,
        text: resolvedText,
        fontSize: parsedFontSize,
      })
    } catch {
      return ''
    }
  }, [isValid, text, parsedWidth, parsedHeight, bgColor, fgColor, parsedFontSize])

  const dataUri = useMemo(() => (svg === '' ? '' : svgToDataUri(svg)), [svg])

  const handleDownload = () => {
    if (svg === '') {
      return
    }
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `placeholder-${parsedWidth}x${parsedHeight}.svg`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="placeholder-width">{t('svg-placeholder-generator.widthLabel')}</Label>
          <Input
            id="placeholder-width"
            type="number"
            min={1}
            value={width}
            onChange={(event) => setWidth(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="placeholder-height">{t('svg-placeholder-generator.heightLabel')}</Label>
          <Input
            id="placeholder-height"
            type="number"
            min={1}
            value={height}
            onChange={(event) => setHeight(event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <Label htmlFor="placeholder-bg">{t('svg-placeholder-generator.bgColorLabel')}</Label>
          <Input
            id="placeholder-bg"
            type="color"
            value={bgColor}
            onChange={(event) => setBgColor(event.target.value)}
            className="size-9 cursor-pointer p-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="placeholder-fg">{t('svg-placeholder-generator.fgColorLabel')}</Label>
          <Input
            id="placeholder-fg"
            type="color"
            value={fgColor}
            onChange={(event) => setFgColor(event.target.value)}
            className="size-9 cursor-pointer p-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="placeholder-font-size">
            {t('svg-placeholder-generator.fontSizeLabel')}
          </Label>
          <Input
            id="placeholder-font-size"
            type="number"
            min={1}
            value={fontSize}
            onChange={(event) => setFontSize(event.target.value)}
            className="w-24"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="placeholder-text">{t('svg-placeholder-generator.textLabel')}</Label>
        <Input
          id="placeholder-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('svg-placeholder-generator.textPlaceholder')}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('svg-placeholder-generator.previewLabel')}</Label>
        {dataUri === '' ? (
          <div className="text-muted-foreground flex min-h-40 items-center justify-center rounded-lg border border-dashed text-sm">
            {t('svg-placeholder-generator.invalidSize')}
          </div>
        ) : (
          <img
            src={dataUri}
            alt="Placeholder preview"
            className="max-h-96 max-w-full rounded-lg border"
          />
        )}
      </div>

      <Tabs defaultValue="data-uri" className="gap-4">
        <TabsList>
          <TabsTrigger value="data-uri">
            {t('svg-placeholder-generator.dataUriOutputLabel')}
          </TabsTrigger>
          <TabsTrigger value="svg">{t('svg-placeholder-generator.svgOutputLabel')}</TabsTrigger>
        </TabsList>
        <TabsContent value="data-uri" className="flex flex-col gap-3">
          <InputCopyable value={dataUri} readOnly />
        </TabsContent>
        <TabsContent value="svg" className="flex flex-col gap-3">
          <TextareaCopyable value={svg} rows={6} />
        </TabsContent>
      </Tabs>

      <Button className="w-fit" onClick={handleDownload} disabled={svg === ''}>
        <Download data-icon="inline-start" />
        {t('svg-placeholder-generator.download')}
      </Button>
    </div>
  )
}
