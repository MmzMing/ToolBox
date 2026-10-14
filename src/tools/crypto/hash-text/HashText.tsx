import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { MorphSelect } from '@/components/select/morph-select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { hashAlgorithms, hashText, type HashAlgorithm } from './service'

export default function HashText() {
  const { t } = useTranslation('common')
  const [algorithm, setAlgorithm] = useState<HashAlgorithm>('SHA256')
  const [input, setInput] = useState('')

  /** 单个代理字符（截断的 emoji）会让 crypto-js 抛 URIError，渲染期抛错会整页白屏，必须就地降级 */
  const hashed = useMemo(() => {
    if (input === '') {
      return { output: '', error: null }
    }
    try {
      return { output: hashText(algorithm, input), error: null }
    } catch {
      return { output: '', error: t('error') }
    }
  }, [algorithm, input, t])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Hash</Label>
        <MorphSelect
          label="Hash"
          hideLabel
          className="w-48"
          items={hashAlgorithms.map((item) => ({ value: item, label: item }))}
          value={algorithm}
          onValueChange={(value) => setAlgorithm(value as HashAlgorithm)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('input')}</Label>
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="https://example.com"
          className="min-h-24 font-mono text-sm"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('output')}</Label>
        {hashed.error ? (
          <p className="text-destructive text-sm">{hashed.error}</p>
        ) : (
          <TextareaCopyable value={hashed.output} rows={4} />
        )}
      </div>
    </div>
  )
}
