import { AlertCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { IoCard } from '@/components/io-card'
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
import {
  conversionLabel,
  conversions,
  getConversion,
  type ConversionId,
} from './format-converter.service'

/** 按分组聚合，保持 conversions 声明顺序 */
const groups = [...new Set(conversions.map((item) => item.group))]

/**
 * 格式转换：下拉切换九种互转，输入与输出各一张 IoCard。
 * PC 两栏并排，平板与手机单栏堆叠（平板有侧栏占宽，两栏会挤）。
 */
export default function FormatConverter() {
  const { t } = useTranslation('tools-development', { keyPrefix: 'format-converter' })
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
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="format-conversion" className="shrink-0">
          {t('conversionLabel')}
        </Label>
        <Select
          value={conversionId}
          onValueChange={(value) => setConversionId(value as ConversionId)}
        >
          <SelectTrigger id="format-conversion" className="w-fit md:max-w-sm">
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

      <div className="grid gap-4 xl:grid-cols-2">
        <IoCard
          kind="input"
          title={tCommon('input')}
          tag={def.from}
          value={input}
          onValueChange={setInput}
          placeholder={t('inputPlaceholder')}
        />
        <IoCard
          kind="output"
          title={tCommon('output')}
          tag={def.to}
          value={output}
          language={def.outputLanguage}
          placeholder={t('outputPlaceholder')}
        />
      </div>
    </div>
  )
}
