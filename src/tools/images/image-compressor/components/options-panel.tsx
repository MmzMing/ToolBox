import { RotateCcw } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  PanelField,
  PanelNumberField,
  PanelSection,
  PanelSliderField,
  PanelSwitchField,
} from '@/components/panel-fields'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

  // 所选模式必需的参数未填写时提醒（留空时引擎按原始尺寸处理）
  const methodNeedsValue = Boolean(
    resize.method &&
    ((resize.method === 'fitWidth' && !resize.width) ||
      (resize.method === 'fitHeight' && !resize.height) ||
      (resize.method === 'setShort' && !resize.short) ||
      (resize.method === 'setLong' && !resize.long) ||
      (resize.method === 'setCropRatio' && (!resize.cropWidthRatio || !resize.cropHeightRatio)) ||
      (resize.method === 'setCropSize' && (!resize.cropWidthSize || !resize.cropHeightSize))),
  )

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <ScrollArea className="min-h-0 flex-1">
        <div className="divide-y">
          <PanelSection title={t('panel.resizeLabel')}>
            <div className="col-span-2">
              <Select
                value={resize.method ?? ''}
                onValueChange={(value) =>
                  update((draft) => {
                    draft.resize.method =
                      value === '' ? undefined : (value as CompressOption['resize']['method'])
                  })
                }
              >
                <SelectTrigger className="w-full">
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
            </div>

            {methodNeedsValue && (
              <p className="text-destructive col-span-2 text-xs">{t('panel.resizeParamsHint')}</p>
            )}

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
              <>
                <PanelField label={t('panel.paperSize')}>
                  <Select
                    value={resize.presetCrop.paperSize}
                    onValueChange={(value) =>
                      update((draft) => {
                        draft.resize.presetCrop!.paperSize = value
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
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
                </PanelField>
                <PanelField label={t('panel.orientation')}>
                  <Select
                    value={resize.presetCrop.orientation}
                    onValueChange={(value) =>
                      update((draft) => {
                        draft.resize.presetCrop!.orientation = value as 'portrait' | 'landscape'
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="portrait">{t('panel.portrait')}</SelectItem>
                      <SelectItem value="landscape">{t('panel.landscape')}</SelectItem>
                    </SelectContent>
                  </Select>
                </PanelField>
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
              </>
            )}
          </PanelSection>

          <PanelSection title={t('panel.formatLabel')}>
            <div className="col-span-2">
              <Select
                value={option.format.target ?? ''}
                onValueChange={(value) =>
                  update((draft) => {
                    draft.format.target =
                      value === '' ? undefined : (value as CompressOption['format']['target'])
                  })
                }
              >
                <SelectTrigger className="w-full">
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
            </div>
            {option.format.target === 'jpg' && (
              <PanelField label={t('panel.transparentFill')}>
                <input
                  type="color"
                  value={option.format.transparentFill}
                  onChange={(event) =>
                    update((draft) => {
                      draft.format.transparentFill = event.target.value.toUpperCase()
                    })
                  }
                  aria-label={t('panel.transparentFill')}
                  className="border-border size-8 w-full cursor-pointer rounded-md border bg-transparent p-1"
                />
              </PanelField>
            )}
          </PanelSection>

          {/* JPEG/WEBP */}
          {visibility.jpeg && (
            <>
              <PanelSection title={t('panel.jpegLabel')}>
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
              </PanelSection>
            </>
          )}

          {/* PNG */}
          {visibility.png && (
            <>
              <PanelSection title={t('panel.pngLabel')}>
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
              </PanelSection>
            </>
          )}

          {/* GIF */}
          {visibility.gif && (
            <>
              <PanelSection title={t('panel.gifLabel')}>
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
              </PanelSection>
            </>
          )}

          {/* AVIF */}
          {visibility.avif && (
            <>
              <PanelSection title={t('panel.avifLabel')}>
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
              </PanelSection>
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
    </Card>
  )
}

/**
 * 三个私有壳只负责类型适配（压缩选项里的数值允许 undefined），
 * 排版一律交给共享原语，避免再长出一套侧栏控件。
 */
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
    <PanelNumberField
      label={label}
      value={value === undefined ? '' : String(value)}
      onChange={(raw) => {
        if (raw.trim() === '') {
          onChange(undefined)
          return
        }
        const parsed = Number(raw)
        onChange(Number.isFinite(parsed) ? parsed : undefined)
      }}
    />
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
    <PanelSliderField
      label={label}
      value={value}
      onChange={onChange}
      min={min}
      max={max}
      step={step}
      format={(current) => String(current)}
    />
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
  return <PanelSwitchField label={label} checked={checked} onChange={onChange} />
}
