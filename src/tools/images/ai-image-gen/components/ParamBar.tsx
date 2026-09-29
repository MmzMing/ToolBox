import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { IMAGE_MODEL_CATALOG } from '@/modules/ai/providers'

import { ASPECT_KEYS, MAX_COUNT, type GenParams } from '../ai-image-gen.service'
import { useAiImageGenStore } from '../store'

type ParamBarProps = {
  params: GenParams
  onParamsChange: (patch: Partial<GenParams>) => void
}

/** 出图参数 Popover：服务商 / 出图模型 / 比例与各家协议特有的参数 */
export function ParamBar({ params, onParamsChange }: ParamBarProps) {
  const { t } = useTranslation('tools-images')
  const genApi = useAiImageGenStore((state) => state.genApi)
  const setGenApi = useAiImageGenStore((state) => state.setGenApi)
  const modelLists = useAiImageGenStore((state) => state.modelLists)

  const provider = genApi.provider === 'gemini' ? 'gemini' : 'openai'
  const modelOptions = [
    ...new Set([...IMAGE_MODEL_CATALOG[provider], ...(modelLists[provider] ?? [])]),
  ]

  return (
    <div className="space-y-3">
      <Field label={t('ai-image-gen.settings.provider')}>
        <Select
          value={provider}
          onValueChange={(value) =>
            setGenApi({ provider: value === 'gemini' ? 'gemini' : 'openai' })
          }
        >
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai">OpenAI</SelectItem>
            <SelectItem value="gemini">Gemini</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field label={t('ai-image-gen.params.model')}>
        <Select
          value={genApi.model || '__none__'}
          onValueChange={(value) => setGenApi({ model: value === '__none__' ? '' : value })}
        >
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue placeholder={t('ai-image-gen.settings.unassigned')} />
          </SelectTrigger>
          <SelectContent>
            {!genApi.model && (
              <SelectItem value="__none__">{t('ai-image-gen.settings.unassigned')}</SelectItem>
            )}
            {modelOptions.map((model) => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label={t('ai-image-gen.params.aspect')}>
        <Select
          value={params.aspect}
          onValueChange={(value) => onParamsChange({ aspect: value as GenParams['aspect'] })}
        >
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASPECT_KEYS.map((aspect) => (
              <SelectItem key={aspect} value={aspect}>
                {aspect === 'auto' ? t('ai-image-gen.params.aspectAuto') : aspect}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label={t('ai-image-gen.params.quality')}>
          <Select
            value={params.quality}
            onValueChange={(value) => onParamsChange({ quality: value as GenParams['quality'] })}
          >
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['auto', 'low', 'medium', 'high'] as const).map((quality) => (
                <SelectItem key={quality} value={quality}>
                  {quality}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t('ai-image-gen.params.count')}>
          <Select
            value={String(params.count)}
            onValueChange={(value) => onParamsChange({ count: Number(value) })}
          >
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: MAX_COUNT }, (_, index) => index + 1).map((count) => (
                <SelectItem key={count} value={String(count)}>
                  ×{count}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Separator />

      {provider === 'gemini' ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('ai-image-gen.params.imageSize')}>
            <Select
              value={params.imageSize}
              onValueChange={(value) =>
                onParamsChange({ imageSize: value as GenParams['imageSize'] })
              }
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['1K', '2K', '4K'] as const).map((size) => (
                  <SelectItem key={size} value={size}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t('ai-image-gen.params.seed')}>
            <Input
              className="h-8 text-xs"
              inputMode="numeric"
              value={params.seed}
              placeholder={t('ai-image-gen.params.seedPlaceholder')}
              onChange={(event) => onParamsChange({ seed: event.target.value })}
            />
          </Field>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('ai-image-gen.params.background')}>
              <Select
                value={params.background}
                onValueChange={(value) =>
                  onParamsChange({ background: value as GenParams['background'] })
                }
              >
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['auto', 'transparent', 'opaque'] as const).map((background) => (
                    <SelectItem key={background} value={background}>
                      {background}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('ai-image-gen.params.outputFormat')}>
              <Select
                value={params.outputFormat}
                onValueChange={(value) =>
                  onParamsChange({ outputFormat: value as GenParams['outputFormat'] })
                }
              >
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['png', 'jpeg', 'webp'] as const).map((format) => (
                    <SelectItem key={format} value={format}>
                      {format}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {params.outputFormat !== 'png' && (
            <Field label={t('ai-image-gen.params.compression')}>
              <Input
                className="h-8 text-xs"
                type="number"
                min={0}
                max={100}
                value={params.outputCompression}
                onChange={(event) =>
                  onParamsChange({ outputCompression: Number(event.target.value) })
                }
              />
            </Field>
          )}
          <Field label={t('ai-image-gen.params.fidelity')}>
            <Select
              value={params.inputFidelity}
              onValueChange={(value) =>
                onParamsChange({ inputFidelity: value as GenParams['inputFidelity'] })
              }
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['high', 'low'] as const).map((fidelity) => (
                  <SelectItem key={fidelity} value={fidelity}>
                    {fidelity}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <p className="text-muted-foreground text-xs">
            {t('ai-image-gen.params.seedUnsupported')}
          </p>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
