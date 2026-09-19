import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { evaluateMath } from './math-evaluator.service'

export default function MathEvaluator() {
  const { t } = useTranslation('tools-math')
  const [expression, setExpression] = useState('')

  const result = useMemo<{ value: string; error: string | null }>(() => {
    try {
      return { value: evaluateMath(expression), error: null }
    } catch (err) {
      return { value: '', error: err instanceof Error ? err.message : String(err) }
    }
  }, [expression])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{t('math-evaluator.expressionLabel')}</Label>
        <Textarea
          value={expression}
          onChange={(event) => setExpression(event.target.value)}
          placeholder={t('math-evaluator.expressionPlaceholder')}
          className="min-h-32 font-mono text-sm"
        />
      </div>

      {result.error && (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label>{t('math-evaluator.resultLabel')}</Label>
        <TextareaCopyable
          value={result.error ? '' : result.value}
          rows={3}
          placeholder={t('common:output')}
        />
      </div>
    </div>
  )
}
