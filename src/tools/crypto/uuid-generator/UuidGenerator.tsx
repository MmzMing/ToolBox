import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { generateUuids } from './service'

export default function UuidGenerator() {
  const { t } = useTranslation('common')
  const [count, setCount] = useState(5)
  const [uuids, setUuids] = useState<string[]>(() => generateUuids(5))

  const regenerate = () => {
    setUuids(generateUuids(count))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-2">
        <div className="flex w-32 flex-col gap-2">
          <Label htmlFor="uuid-count">{t('generateCount')}</Label>
          <Input
            id="uuid-count"
            type="number"
            min={1}
            max={99}
            value={count}
            onChange={(event) => setCount(Number(event.target.value) || 1)}
          />
        </div>
        <Button onClick={regenerate} className="gap-2">
          <RefreshCw className="size-4" />
          {t('generate')}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {uuids.map((uuid, index) => (
          <InputCopyable key={uuid} value={uuid} readOnly aria-label={`uuid-${index + 1}`} />
        ))}
      </div>
    </div>
  )
}
