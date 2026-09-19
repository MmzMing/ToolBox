import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
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
  MAX_COUNT,
  MIN_COUNT,
  generateLorem,
  loremTypes,
  type LoremType,
} from './lorem-ipsum-generator.service'

export default function LoremIpsumGenerator() {
  const { t } = useTranslation('tools-text')

  const [type, setType] = useState<LoremType>('paragraphs')
  const [countText, setCountText] = useState('3')
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const parsedCount = Number(countText)

  const handleGenerate = () => {
    try {
      setOutput(generateLorem(type, parsedCount))
      setError(null)
    } catch {
      setError(t('common:error'))
    }
  }

  const rows = useMemo(() => (type === 'paragraphs' ? 12 : type === 'sentences' ? 6 : 4), [type])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-2">
          <Label>{t('lorem-ipsum-generator.typeLabel')}</Label>
          <Select value={type} onValueChange={(value) => setType(value as LoremType)}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {loremTypes.map((item) => (
                <SelectItem key={item} value={item}>
                  {t(`lorem-ipsum-generator.type-${item}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2 sm:w-40">
          <Label htmlFor="lorem-count">{t('common:generateCount')}</Label>
          <Input
            id="lorem-count"
            type="number"
            min={MIN_COUNT}
            max={MAX_COUNT}
            value={countText}
            onChange={(event) => setCountText(event.target.value)}
          />
        </div>

        <Button type="button" onClick={handleGenerate}>
          {t('common:generate')}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label>{t('common:output')}</Label>
        <TextareaCopyable value={output} rows={rows} className="font-mono text-sm" />
      </div>
    </div>
  )
}
