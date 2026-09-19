import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  slugifyAll,
  slugifyText,
  slugSeparators,
  slugVariants,
  type SlugSeparator,
} from './slugify-string.service'

export default function SlugifyString() {
  const { t } = useTranslation('tools-web')

  const [text, setText] = useState('')
  const [lower, setLower] = useState(true)
  const [separator, setSeparator] = useState<SlugSeparator>('-')
  const [removeStopwords, setRemoveStopwords] = useState(false)

  const slug = useMemo(
    () => slugifyText(text, { lower, replacement: separator, removeStopwords }),
    [text, lower, separator, removeStopwords],
  )
  const variants = useMemo(() => slugifyAll(text), [text])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="slugify-text">{t('slugify-string.textLabel')}</Label>
        <Textarea
          id="slugify-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Hello World 你好"
          className="min-h-24"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
          <Label htmlFor="slugify-lower">{t('slugify-string.lowercaseLabel')}</Label>
          <Switch id="slugify-lower" checked={lower} onCheckedChange={setLower} />
        </div>

        <div className="flex flex-col gap-2">
          <Label>{t('slugify-string.separatorLabel')}</Label>
          <Select value={separator} onValueChange={(value) => setSeparator(value as SlugSeparator)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {slugSeparators.map((item) => (
                <SelectItem key={item} value={item}>
                  {item === '-'
                    ? t('slugify-string.separatorDash')
                    : t('slugify-string.separatorUnderscore')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
          <Label htmlFor="slugify-stopwords">{t('slugify-string.stopwordsLabel')}</Label>
          <Switch
            id="slugify-stopwords"
            checked={removeStopwords}
            onCheckedChange={setRemoveStopwords}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('common:output')}</Label>
        <InputCopyable value={slug} readOnly className="font-mono text-sm" />
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('slugify-string.variantsLabel')}</Label>
        <div className="flex flex-col gap-2">
          {slugVariants.map((variant) => (
            <div key={variant} className="grid items-center gap-2 sm:grid-cols-[10rem_1fr]">
              <span className="text-muted-foreground text-sm">
                {t(`slugify-string.variant-${variant}`)}
              </span>
              <InputCopyable value={variants[variant]} readOnly className="font-mono text-sm" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
