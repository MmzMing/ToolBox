import { ChevronDown, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  CLASS_IDS,
  PASSWORD_COUNT_RANGE,
  PASSWORD_LENGTH_RANGE,
  buildCharacterPool,
  validateGeneratorOptions,
  type PasswordClassId,
  type PasswordClassRule,
  type PasswordGeneratorOptions,
} from './password-generator.service'

const PANEL_KEY = 'password-strength-analyser.gen'

type GeneratorParamsProps = {
  options: PasswordGeneratorOptions
  onOptionsChange: (patch: Partial<PasswordGeneratorOptions>) => void
  onGenerate: () => void
  hasError: boolean
}

function toBoundedNumber(raw: string, fallback: number): number {
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback
}

export default function GeneratorParams({
  options,
  onOptionsChange,
  onGenerate,
  hasError,
}: GeneratorParamsProps) {
  const { t } = useTranslation('tools-crypto')
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const violations = useMemo(() => validateGeneratorOptions(options), [options])
  const poolSize = useMemo(() => buildCharacterPool(options).length, [options])
  const previewEntropy =
    poolSize > 1 ? Math.round(options.length * Math.log2(poolSize) * 100) / 100 : 0
  const finalLength = options.prefix.length + options.length + options.suffix.length

  const updateClass = (id: PasswordClassId, patch: Partial<PasswordClassRule>) =>
    onOptionsChange({
      classes: { ...options.classes, [id]: { ...options.classes[id], ...patch } },
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t(`${PANEL_KEY}.title`)}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="pwd-gen-length">{t(`${PANEL_KEY}.length`)}</Label>
          <div className="flex items-center gap-2">
            <Slider
              id="pwd-gen-length"
              min={PASSWORD_LENGTH_RANGE.min}
              max={PASSWORD_LENGTH_RANGE.max}
              step={1}
              value={[
                Math.min(
                  PASSWORD_LENGTH_RANGE.max,
                  Math.max(PASSWORD_LENGTH_RANGE.min, options.length),
                ),
              ]}
              onValueChange={(values) => onOptionsChange({ length: values[0] })}
              className="flex-1"
            />
            <Input
              type="number"
              min={PASSWORD_LENGTH_RANGE.min}
              max={PASSWORD_LENGTH_RANGE.max}
              value={options.length}
              aria-label={t(`${PANEL_KEY}.length`)}
              onChange={(event) =>
                onOptionsChange({
                  length: toBoundedNumber(event.target.value, PASSWORD_LENGTH_RANGE.min),
                })
              }
              className="w-16"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Label>{t(`${PANEL_KEY}.characterClasses`)}</Label>
          {CLASS_IDS.map((id) => {
            const rule = options.classes[id]
            return (
              <div key={id} className="flex items-center gap-2">
                <Switch
                  id={`pwd-gen-${id}`}
                  checked={rule.enabled}
                  onCheckedChange={(checked) =>
                    updateClass(id, { enabled: checked, min: checked ? rule.min : 0 })
                  }
                />
                <Label htmlFor={`pwd-gen-${id}`} className="min-w-0 flex-1 truncate font-normal">
                  {t(`${PANEL_KEY}.${id}`)}
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={options.length}
                  disabled={!rule.enabled}
                  value={rule.min}
                  aria-label={`${t(`${PANEL_KEY}.${id}`)} ${t(`${PANEL_KEY}.minCount`)}`}
                  onChange={(event) =>
                    updateClass(id, { min: Math.max(0, toBoundedNumber(event.target.value, 0)) })
                  }
                  className="w-14 shrink-0"
                />
              </div>
            )
          })}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="pwd-gen-prefix">{t(`${PANEL_KEY}.prefix`)}</Label>
            <Input
              id="pwd-gen-prefix"
              value={options.prefix}
              maxLength={32}
              placeholder={t(`${PANEL_KEY}.prefixPlaceholder`)}
              onChange={(event) => onOptionsChange({ prefix: event.target.value })}
              className="font-mono"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pwd-gen-suffix">{t(`${PANEL_KEY}.suffix`)}</Label>
            <Input
              id="pwd-gen-suffix"
              value={options.suffix}
              maxLength={32}
              placeholder={t(`${PANEL_KEY}.suffixPlaceholder`)}
              onChange={(event) => onOptionsChange({ suffix: event.target.value })}
              className="font-mono"
            />
          </div>
        </div>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
            <ChevronDown
              className={cn('size-4 transition-transform', !advancedOpen && '-rotate-90')}
            />
            {t(`${PANEL_KEY}.advanced`)}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pwd-gen-count">{t('common:generateCount')}</Label>
              <Input
                id="pwd-gen-count"
                type="number"
                min={PASSWORD_COUNT_RANGE.min}
                max={PASSWORD_COUNT_RANGE.max}
                value={options.count}
                onChange={(event) =>
                  onOptionsChange({
                    count: toBoundedNumber(event.target.value, PASSWORD_COUNT_RANGE.min),
                  })
                }
              />
            </div>
            <div className="flex items-start gap-2">
              <Switch
                id="pwd-gen-ambiguous"
                className="mt-0.5"
                checked={options.excludeAmbiguous}
                onCheckedChange={(checked) => onOptionsChange({ excludeAmbiguous: checked })}
              />
              <Label htmlFor="pwd-gen-ambiguous" className="font-normal">
                {t(`${PANEL_KEY}.excludeAmbiguous`)}
              </Label>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pwd-gen-excluded">{t(`${PANEL_KEY}.excludedChars`)}</Label>
              <Input
                id="pwd-gen-excluded"
                value={options.excludedChars}
                maxLength={32}
                placeholder={t(`${PANEL_KEY}.excludedCharsPlaceholder`)}
                onChange={(event) => onOptionsChange({ excludedChars: event.target.value })}
                className="font-mono"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {violations.map((violation) => (
          <Alert key={violation} variant="destructive">
            <AlertDescription>
              {t(`${PANEL_KEY}.errors.${violation}`, {
                min:
                  violation === 'countOutOfRange'
                    ? PASSWORD_COUNT_RANGE.min
                    : PASSWORD_LENGTH_RANGE.min,
                max:
                  violation === 'countOutOfRange'
                    ? PASSWORD_COUNT_RANGE.max
                    : PASSWORD_LENGTH_RANGE.max,
              })}
            </AlertDescription>
          </Alert>
        ))}
        {hasError && (
          <Alert variant="destructive">
            <AlertDescription>{t('common:error')}</AlertDescription>
          </Alert>
        )}

        <Button onClick={onGenerate} disabled={violations.length > 0} className="w-full gap-2">
          <RefreshCw className="size-4" />
          {t('common:generate')}
        </Button>
        <p className="text-muted-foreground text-xs">
          {t(`${PANEL_KEY}.summary`, { total: finalLength, entropy: previewEntropy })}
        </p>
      </CardContent>
    </Card>
  )
}
