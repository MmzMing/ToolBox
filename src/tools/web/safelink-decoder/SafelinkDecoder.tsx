import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { decodeSafelink } from './safelink-decoder.service'

export default function SafelinkDecoder() {
  const { t } = useTranslation('tools-web')

  const [input, setInput] = useState('')

  const result = useMemo<{ steps: string[]; target: string; error: string | null }>(() => {
    if (input.trim() === '') {
      return { steps: [], target: '', error: null }
    }
    try {
      const { steps, target } = decodeSafelink(input)
      return { steps, target, error: null }
    } catch (err) {
      return { steps: [], target: '', error: err instanceof Error ? err.message : String(err) }
    }
  }, [input])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="safelink-input">{t('safelink-decoder.inputLabel')}</Label>
        <InputCopyable
          id="safelink-input"
          value={input}
          onValueChange={setInput}
          placeholder="https://go.example.com/?url=https%3A%2F%2Fexample.com"
          className="font-mono text-sm"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {result.error && (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}

      {!result.error && input.trim() !== '' && (
        <>
          <div className="flex flex-col gap-2">
            <Label>{t('safelink-decoder.targetLabel')}</Label>
            <InputCopyable value={result.target} readOnly className="font-mono text-sm" />
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('safelink-decoder.stepsLabel')}</Label>
            {result.steps.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('safelink-decoder.noRedirect')}</p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {result.steps.map((step, index) => (
                  <li key={step} className="flex items-center gap-2">
                    <span className="text-muted-foreground font-mono text-xs">{index + 1}.</span>
                    <SpanCopyable value={step} className="max-w-full" />
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </div>
  )
}
