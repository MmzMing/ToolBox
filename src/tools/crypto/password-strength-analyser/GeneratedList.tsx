import { Gauge } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { Button } from '@/components/ui/button'
import type { GeneratedPassword } from './password-generator.service'

type GeneratedListProps = {
  items: GeneratedPassword[]
  onPick: (password: string) => void
}

export default function GeneratedList({ items, onPick }: GeneratedListProps) {
  const { t } = useTranslation('tools-crypto')

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div key={item.value} className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <InputCopyable value={item.value} readOnly className="font-mono" />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('password-strength-analyser.gen.pickForAnalysis')}
            title={t('password-strength-analyser.gen.pickForAnalysis')}
            onClick={() => onPick(item.value)}
          >
            <Gauge className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  )
}
