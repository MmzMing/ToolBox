import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  buildCron,
  cronFieldNames,
  cronPresets,
  cronReferenceGroups,
  describeCron,
  type CronFieldName,
  type CronParts,
} from './crontab-generator.service'

const INITIAL_PARTS: CronParts = {
  minute: '*/5',
  hour: '*',
  dayOfMonth: '*',
  month: '*',
  dayOfWeek: '*',
}

export default function CrontabGenerator() {
  const { t, i18n } = useTranslation('tools-development')
  const [parts, setParts] = useState<CronParts>(INITIAL_PARTS)

  const locale: 'zh' | 'en' = i18n.language.startsWith('zh') ? 'zh' : 'en'

  const { expression, error } = useMemo(() => {
    try {
      return { expression: buildCron(parts), error: null as string | null }
    } catch (err) {
      return { expression: '', error: err instanceof Error ? err.message : String(err) }
    }
  }, [parts])

  const description = error === null ? describeCron(expression, locale) : ''

  const handleFieldChange = (name: CronFieldName, value: string) => {
    setParts((previous) => ({ ...previous, [name]: value }))
  }

  const handlePresetClick = (preset: CronParts) => {
    setParts({ ...preset })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cronFieldNames.map((name) => (
          <div key={name} className="flex flex-col gap-2">
            <Label htmlFor={`crontab-${name}`}>{t(`crontab-generator.${name}`)}</Label>
            <Input
              id={`crontab-${name}`}
              value={parts[name]}
              onChange={(event) => handleFieldChange(name, event.target.value)}
              className="font-mono"
              placeholder="*"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('crontab-generator.presetsLabel')}</Label>
        <div className="flex flex-wrap gap-2">
          {cronPresets.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handlePresetClick(preset.parts)}
            >
              {t(`crontab-generator.preset-${preset.id}`)}
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label>{t('crontab-generator.expressionLabel')}</Label>
        <InputCopyable
          value={expression}
          readOnly
          className="font-mono"
          placeholder="*/5 * * * *"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('crontab-generator.descriptionLabel')}</Label>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{t('crontab-generator.referenceLabel')}</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {cronReferenceGroups.map((group) => (
            <Card key={group.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {t(`crontab-generator.reference-group-${group.id}`)}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {group.items.map((item) => (
                  <div
                    key={item.descriptionKey}
                    className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <SpanCopyable value={item.value} className="shrink-0 sm:w-40" />
                    <span className="text-muted-foreground text-sm">
                      {t(`crontab-generator.${item.descriptionKey}`)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
