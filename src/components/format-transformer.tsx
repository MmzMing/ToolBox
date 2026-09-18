import { AlertCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface FormatTransformerProps {
  /** 纯逻辑转换函数（来自工具的 service.ts），抛错时在输出区上方展示错误 */
  transformer: (value: string) => string
  inputPlaceholder?: string
  inputLabel?: string
  outputLabel?: string
  defaultValue?: string
  /** 输出区是否高亮 */
  highlight?: boolean
  language?: string
  rows?: number
}

/** 「输入 → 转换 → 输出」文本工具骨架（对应 it-tools FormatTransformer） */
export function FormatTransformer({
  transformer,
  inputPlaceholder,
  inputLabel,
  outputLabel,
  defaultValue = '',
  highlight,
  language,
  rows = 8,
}: FormatTransformerProps) {
  const { t } = useTranslation('common')
  const [input, setInput] = useState(defaultValue)

  const { output, error } = useMemo(() => {
    if (input === '') {
      return { output: '', error: null as Error | null }
    }
    try {
      return { output: transformer(input), error: null as Error | null }
    } catch (err) {
      return {
        output: '',
        error: err instanceof Error ? err : new Error(String(err)),
      }
    }
  }, [input, transformer])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {inputLabel && <Label>{inputLabel}</Label>}
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={inputPlaceholder}
          className="min-h-40 font-mono text-sm"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>{t('error')}</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        {outputLabel && <Label>{outputLabel}</Label>}
        <TextareaCopyable value={output} rows={rows} highlight={highlight} language={language} />
      </div>
    </div>
  )
}
