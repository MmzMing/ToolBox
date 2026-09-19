import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ULID_COUNT_RANGE, generateUlids } from './ulid-generator.service'

export default function UlidGenerator() {
  const { t } = useTranslation('tools-crypto')
  const [count, setCount] = useState(5)
  const [ulids, setUlids] = useState<string[]>(() => generateUlids(5))

  const handleGenerate = () => {
    const safeCount = Math.min(ULID_COUNT_RANGE.max, Math.max(ULID_COUNT_RANGE.min, count))
    setUlids(generateUlids(safeCount))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-2">
        <div className="flex w-32 flex-col gap-2">
          <Label htmlFor="ulid-count">{t('common:generateCount')}</Label>
          <Input
            id="ulid-count"
            type="number"
            min={ULID_COUNT_RANGE.min}
            max={ULID_COUNT_RANGE.max}
            value={count}
            onChange={(event) => setCount(Number(event.target.value) || ULID_COUNT_RANGE.min)}
          />
        </div>
        <Button onClick={handleGenerate} className="gap-2">
          <RefreshCw className="size-4" />
          {t('common:generate')}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {ulids.map((ulid, index) => (
          <InputCopyable
            key={ulid}
            value={ulid}
            readOnly
            className="font-mono"
            aria-label={`ulid-${index + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
