import { AlertCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ArrowRight, MoveRight } from 'lucide-react'
import {
  conversionLabel,
  conversions,
  getConversion,
  type ConversionId,
} from './format-converter.service'

/** 按分组聚合，保持 conversions 声明顺序 */
const groups = [...new Set(conversions.map((c) => c.group))]

/** 格式转换：下拉切换九种互转，左输入右输出（移动端上下堆叠） */
export default function FormatConverter() {
  const { t } = useTranslation('tools-converter')
  const { t: tCommon } = useTranslation('common')
  const [conversionId, setConversionId] = useState<ConversionId>('yaml-to-json')
  const [input, setInput] = useState('')

  const def = getConversion(conversionId)

  const { output, error } = useMemo(() => {
    if (input.trim() === '') {
      return { output: '', error: null as Error | null }
    }
    try {
      return { output: def.transform(input), error: null as Error | null }
    } catch (err) {
      return { output: '', error: err instanceof Error ? err : new Error(String(err)) }
    }
  }, [input, def])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{t('format-converter.conversionLabel')}</Label>
        <Select
          value={conversionId}
          onValueChange={(value) => setConversionId(value as ConversionId)}
        >
          <SelectTrigger className="md:max-w-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => (
              <SelectGroup key={group}>
                <SelectLabel>{group}</SelectLabel>
                {conversions
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {conversionLabel(item)}
                    </SelectItem>
                  ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>{tCommon('error')}</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
        <div className="flex min-w-0 flex-col gap-2">
          <Label className="flex items-center gap-1.5">
            {tCommon('input')}
            <span className="text-muted-foreground text-xs font-normal">({def.from})</span>
          </Label>
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t('format-converter.inputPlaceholder')}
            className="min-h-48 font-mono text-sm lg:min-h-72"
          />
        </div>

        <div className="text-muted-foreground hidden items-center lg:flex" aria-hidden="true">
          <MoveRight className="size-5" />
        </div>
        <div className="hidden" aria-hidden="true">
          <ArrowRight className="size-4" />
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <Label className="flex items-center gap-1.5">
            {tCommon('output')}
            <span className="text-muted-foreground text-xs font-normal">({def.to})</span>
          </Label>
          <TextareaCopyable
            value={output}
            rows={12}
            highlight
            language={def.outputLanguage}
            className="lg:min-h-72"
            placeholder={tCommon('output')}
          />
        </div>
      </div>
    </div>
  )
}
