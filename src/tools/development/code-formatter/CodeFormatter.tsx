import { AlertCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { IoCard } from '@/components/io-card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  formatterModeDefs,
  getFormatterMode,
  jsonIndents,
  runFormatter,
  type FormatterMode,
  type JsonIndent,
} from './code-formatter.service'

/** 代码格式化：下拉切换六种模式（JSON 格式化/压缩/转 CSV、SQL/XML/YAML），输入与输出各一张卡片 */
export default function CodeFormatter() {
  const { t } = useTranslation('tools-development', { keyPrefix: 'code-formatter' })
  const { t: tCommon } = useTranslation('common')
  const [mode, setMode] = useState<FormatterMode>('json-format')
  const [indent, setIndent] = useState<JsonIndent>(2)
  const [delimiter, setDelimiter] = useState(',')
  const [input, setInput] = useState('')

  const def = getFormatterMode(mode)

  const { output, error } = useMemo(() => {
    if (input.trim() === '') {
      return { output: '', error: null as Error | null }
    }
    try {
      return {
        output: runFormatter(mode, input, { indent, delimiter }),
        error: null as Error | null,
      }
    } catch (err) {
      return { output: '', error: err instanceof Error ? err : new Error(String(err)) }
    }
  }, [mode, input, indent, delimiter])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="code-formatter-mode" className="shrink-0">
          {t('modeLabel')}
        </Label>
        <Select value={mode} onValueChange={(value) => setMode(value as FormatterMode)}>
          <SelectTrigger id="code-formatter-mode" className="w-fit md:max-w-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {formatterModeDefs.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {t(item.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 模式选项行 */}
      {def.hasOptions === 'indent' && (
        <div className="flex items-center gap-2">
          <Label className="text-muted-foreground text-xs">{t('indentLabel')}</Label>
          <Select
            value={String(indent)}
            onValueChange={(value) =>
              setIndent(value === 'tab' ? 'tab' : (Number(value) as JsonIndent))
            }
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {jsonIndents.map((item) => (
                <SelectItem key={String(item)} value={String(item)}>
                  {item === 'tab' ? 'Tab' : `${item} ${t('spaces')}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {def.hasOptions === 'delimiter' && (
        <div className="flex items-center gap-2">
          <Label className="text-muted-foreground text-xs">{t('delimiterLabel')}</Label>
          <Input
            value={delimiter}
            onChange={(event) => setDelimiter(event.target.value)}
            className="h-8 w-24 font-mono"
            maxLength={1}
          />
        </div>
      )}

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
          tag={def.inputLanguage.toUpperCase()}
          value={input}
          onValueChange={setInput}
          placeholder={t('inputPlaceholder')}
        />
        <IoCard
          kind="output"
          title={tCommon('output')}
          tag={def.outputLanguage.toUpperCase()}
          value={output}
          language={def.outputLanguage}
          placeholder={t('outputPlaceholder')}
        />
      </div>
    </div>
  )
}
