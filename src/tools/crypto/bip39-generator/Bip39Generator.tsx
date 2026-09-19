import { BookOpenText, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  bip39WordlistIds,
  generateBip39Mnemonic,
  mnemonicWordCounts,
  type Bip39WordlistId,
  type MnemonicWordCount,
} from './bip39-generator.service'

const WORDLIST_LABEL_KEYS: Record<Bip39WordlistId, string> = {
  english: 'wordlistEnglish',
  'chinese-simplified': 'wordlistSimplifiedChinese',
  'chinese-traditional': 'wordlistTraditionalChinese',
}

export default function Bip39Generator() {
  const { t } = useTranslation('tools-crypto')
  const [wordlistId, setWordlistId] = useState<Bip39WordlistId>('english')
  const [wordCount, setWordCount] = useState<MnemonicWordCount>(12)
  const [mnemonic, setMnemonic] = useState(() => generateBip39Mnemonic('english', 12))

  const handleGenerate = () => {
    setMnemonic(generateBip39Mnemonic(wordlistId, wordCount))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-2">
          <Label>{t('bip39-generator.language')}</Label>
          <Select
            value={wordlistId}
            onValueChange={(value) => setWordlistId(value as Bip39WordlistId)}
          >
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {bip39WordlistIds.map((id) => (
                <SelectItem key={id} value={id}>
                  {t(`bip39-generator.${WORDLIST_LABEL_KEYS[id]}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>{t('bip39-generator.wordCount')}</Label>
          <Select
            value={String(wordCount)}
            onValueChange={(value) => setWordCount(Number(value) as MnemonicWordCount)}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {mnemonicWordCounts.map((count) => (
                <SelectItem key={count} value={String(count)}>
                  {count}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleGenerate} className="gap-2">
          <RefreshCw className="size-4" />
          {t('common:generate')}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('common:output')}</Label>
        <TextareaCopyable value={mnemonic} rows={4} className="font-mono" />
      </div>

      <div className="text-muted-foreground flex items-start gap-1.5 text-xs">
        <BookOpenText className="mt-0.5 size-3.5 shrink-0" />
        <span>{t('bip39-generator.offlineNote')}</span>
      </div>
    </div>
  )
}
