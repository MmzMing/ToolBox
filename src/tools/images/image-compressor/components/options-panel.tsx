import { RotateCcw, Settings2 } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { OutputFormats, type CompressOption } from '../options'
import { getCompressionOptionVisibility } from '../options'
import type { ImageItem } from '../store'
import { useCompressorStore } from '../store'
import { applyOptionAndRecompress } from '../use-compressor-worker'
import { PAPER_SIZES } from '../engines/image-base'

const RESIZE_METHODS = [
  'fitWidth',
  'fitHeight',
  'setShort',
  'setLong',
  'setCropRatio',
  'setCropSize',
  'presetCrop',
] as const

/** 右侧选项面板：resize / 输出格式 / 各格式参数 + 重置/应用 */
export function OptionsPanel() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-compressor' })
  const option = useCompressorStore((state) => state.tempOption)
  const setTempOption = useCompressorStore((state) => state.setTempOption)
  const resetTempOption = useCompressorStore((state) => state.resetTempOption)
  const list = useCompressorStore((state) => state.list)

  const update = (patch: (draft: CompressOption) => void) => {
    const draft = structuredClone(option)
    patch(draft)
    setTempOption(draft)
  }

  const visibility = useMemo(() => {
    const sourceMimes = [...list.values()].map((item: ImageItem) => item.blob.type)
    return getCompressionOptionVisibility(sourceMimes, option.format.target)
  }, [list, option.format.target])

  const resize = option.resize

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-4">
        <Settings2 className="text-muted-foreground size-4" />
        <span className="text-sm font-semibold">{t('panel.title')}</span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-5 p-4">
          {/* 调整图片尺寸 */}
          <section className="flex flex-col gap-3">
            <Label className="text-sm font-semibold">{t('panel.resizeLabel')}</Label>
            <Select
              value={resize.method ?? ''}
              onValueChange={(value) =>
                update((draft) => {
                  draft.resize.method =
                    value === '' ? undefined : (value as CompressOption['resize']['method'])
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t('panel.resizePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('panel.resizeOriginal')}</SelectItem>
                {RESIZE_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {t(`panel.resizeMethod.${method}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(resize.method === 'fitWidth' || resize.method === 'setCropRatio') && (
              <NumberField
                label={t('panel.width')}
                value={resize.method === 'fitWidth' ? resize.width : resize.cropWidthRatio}
                onChange={(value) =>
                  update((draft) => {
                    if (resize.method === 'fitWidth') draft.resize.width = value
                    else draft.resize.cropWidthRatio = value
                  })
                }
              />
            )}
            {resize.method === 'fitHeight' && (
              <NumberField
                label={t('panel.height')}
                value={resize.height}
                onChange={(value) =>
                  update((draft) => {
                    draft.resize.height = value
                  })
                }
              />
            )}
            {resize.method === 'setShort' && (
              <NumberField
                label={t('panel.shortSide')}
                value={resize.short}
                onChange={(value) =>
                  update((draft) => {
                    draft.resize.short = value
                  })
                }
              />
            )}
            {resize.method === 'setLong' && (
              <NumberField
                label={t('panel.longSide')}
                value={resize.long}
                onChange={(value) =>
                  update((draft) => {
                    draft.resize.long = value
                  })
                }
              />
            )}
            {resize.method === 'setCropRatio' && (
              <NumberField
                label={t('panel.heightRatio')}
                value={resize.cropHeightRatio}
                onChange={(value) =>
                  update((draft) => {
                    draft.resize.cropHeightRatio = value
                  })
                }
              />
            )}
            {resize.method === 'setCropSize' && (
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label={t('panel.width')}
                  value={resize.cropWidthSize}
                  onChange={(value) =>
                    update((draft) => {
                      draft.resize.cropWidthSize = value
                    })
                  }
                />
                <NumberField
                  label={t('panel.height')}
                  value={resize.cropHeightSize}
                  onChange={(value) =>
                    update((draft) => {
                      draft.resize.cropHeightSize = value
                    })
                  }
                />
              </div>
            )}
            {resize.method === 'presetCrop' && resize.presetCrop && (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-muted-foreground text-xs">{t('panel.paperSize')}</Label>
                  <Select
                    value={resize.presetCrop.paperSize}
                    onValueChange={(value) =>
                      update((draft) => {
                        draft.resize.presetCrop!.paperSize = value
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PAPER_SIZES).map(([key, paper]) => (
                        <SelectItem key={key} value={key}>
                          {paper.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-muted-foreground text-xs">{t('panel.orientation')}</Label>
                  <Select
                    value={resize.presetCrop.orientation}
                    onValueChange={(value) =>
                      update((draft) => {
                        draft.resize.presetCrop!.orientation = value as 'portrait' | 'landscape'
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="portrait">{t('panel.portrait')}</SelectItem>
                      <SelectItem value="landscape">{t('panel.landscape')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 grid grid-cols-2 gap-2">
                  <NumberField
                    label={t('panel.cropPx')}
                    value={resize.presetCrop.cropPx}
                    onChange={(value) =>
                      update((draft) => {
                        draft.resize.presetCrop!.cropPx = value ?? 0
                      })
                    }
                  />
                  <NumberField
                    label={t('panel.offsetPx')}
                    value={resize.presetCrop.offsetPx}
                    onChange={(value) =>
                      update((draft) => {
                        draft.resize.presetCrop!.offsetPx = value ?? 0
                      })
                    }
                  />
                </div>
              </div>
            )}
          </section>

          <Separator />

          {/* 输出格式 */}
          <section className="flex flex-col gap-3">
            <Label className="text-sm font-semibold">{t('panel.formatLabel')}</Label>
            <Select
              value={option.format.target ?? ''}
              onValueChange={(value) =>
                update((draft) => {
                  draft.format.target =
                    value === '' ? undefined : (value as CompressOption['format']['target'])
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t('panel.formatKeep')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('panel.formatKeep')}</SelectItem>
                {OutputFormats.map((format) => (
                  <SelectItem key={format} value={format}>
                    {format.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {option.format.target === 'jpg' && (
              <div className="flex items-center gap-3">
                <Label className="text-muted-foreground text-xs">
                  {t('panel.transparentFill')}
                </Label>
                <input
                  type="color"
                  value={option.format.transparentFill}
                  onChange={(event) =>
                    update((draft) => {
                      draft.format.transparentFill = event.target.value.toUpperCase()
                    })
                  }
                  className="size-7 cursor-pointer rounded border"
                  aria-label={t('panel.transparentFill')}
                />
              </div>
            )}
          </section>

          {/* JPEG/WEBP */}
          {visibility.jpeg && (
            <>
              <Separator />
              <section className="flex flex-col gap-3">
                <Label className="text-sm font-semibold">{t('panel.jpegLabel')}</Label>
                <SliderField
                  label={t('panel.quality')}
                  value={option.jpeg.quality}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(value) =>
                    update((draft) => {
                      draft.jpeg.quality = value
                    })
                  }
                />
                <SwitchField
                  label={t('panel.extreme')}
                  checked={option.jpeg.extreme}
                  onChange={(checked) =>
                    update((draft) => {
                      draft.jpeg.extreme = checked
                    })
                  }
                />
              </section>
            </>
          )}

          {/* PNG */}
          {visibility.png && (
            <>
              <Separator />
              <section className="flex flex-col gap-3">
                <Label className="text-sm font-semibold">{t('panel.pngLabel')}</Label>
                <SliderField
                  label={t('panel.colors')}
                  value={option.png.colors}
                  min={2}
                  max={256}
                  step={1}
                  onChange={(value) =>
                    update((draft) => {
                      draft.png.colors = value
                    })
                  }
                />
                <SliderField
                  label={t('panel.dithering')}
                  value={option.png.dithering}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(value) =>
                    update((draft) => {
                      draft.png.dithering = value
                    })
                  }
                />
                <SwitchField
                  label={t('panel.extreme')}
                  checked={option.png.extreme}
                  onChange={(checked) =>
                    update((draft) => {
                      draft.png.extreme = checked
                    })
                  }
                />
              </section>
            </>
          )}

          {/* GIF */}
          {visibility.gif && (
            <>
              <Separator />
              <section className="flex flex-col gap-3">
                <Label className="text-sm font-semibold">{t('panel.gifLabel')}</Label>
                <SliderField
                  label={t('panel.colors')}
                  value={option.gif.colors}
                  min={2}
                  max={256}
                  step={1}
                  onChange={(value) =>
                    update((draft) => {
                      draft.gif.colors = value
                    })
                  }
                />
                <SwitchField
                  label={t('panel.gifDithering')}
                  checked={option.gif.dithering}
                  onChange={(checked) =>
                    update((draft) => {
                      draft.gif.dithering = checked
                    })
                  }
                />
              </section>
            </>
          )}

          {/* AVIF */}
          {visibility.avif && (
            <>
              <Separator />
              <section className="flex flex-col gap-3">
                <Label className="text-sm font-semibold">{t('panel.avifLabel')}</Label>
                <SliderField
                  label={t('panel.avifQuality')}
                  value={option.avif.quality}
                  min={1}
                  max={100}
                  step={1}
                  onChange={(value) =>
                    update((draft) => {
                      draft.avif.quality = value
                    })
                  }
                />
                <SliderField
                  label={t('panel.avifSpeed')}
                  value={option.avif.speed}
                  min={1}
                  max={10}
                  step={1}
                  onChange={(value) =>
                    update((draft) => {
                      draft.avif.speed = value
                    })
                  }
                />
              </section>
            </>
          )}
        </div>
      </ScrollArea>

      <div className="flex shrink-0 gap-2 border-t p-3">
        <Button variant="outline" className="flex-1 gap-1.5" onClick={resetTempOption}>
          <RotateCcw className="size-4" />
          {t('panel.reset')}
        </Button>
        <Button
          className="flex-1"
          onClick={() => applyOptionAndRecompress(option)}
          disabled={list.size === 0}
        >
          {t('panel.apply')}
        </Button>
      </div>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | undefined
  onChange: (value: number | undefined) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <Input
        type="number"
        value={value ?? ''}
        onChange={(event) => {
          const raw = event.target.value
          const parsed = raw === '' ? undefined : Number(raw)
          onChange(Number.isFinite(parsed) ? parsed : undefined)
        }}
        className="h-8"
      />
    </div>
  )
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-muted-foreground text-xs">{label}</Label>
        <span className="text-xs font-medium">{value}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onChange(next)}
      />
    </div>
  )
}

function SwitchField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
