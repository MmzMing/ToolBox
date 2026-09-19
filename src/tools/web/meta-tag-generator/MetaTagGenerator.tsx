import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  generateMetaTags,
  twitterCardTypes,
  type TwitterCardType,
} from './meta-tag-generator.service'

export default function MetaTagGenerator() {
  const { t } = useTranslation('tools-web')
  const { t: tCommon } = useTranslation('common')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [siteName, setSiteName] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [pageUrl, setPageUrl] = useState('')
  const [author, setAuthor] = useState('')
  const [twitterCard, setTwitterCard] = useState<TwitterCardType>('summary_large_image')

  const output = useMemo(
    () =>
      generateMetaTags({ title, description, siteName, imageUrl, pageUrl, author, twitterCard }),
    [title, description, siteName, imageUrl, pageUrl, author, twitterCard],
  )

  const renderTextField = (
    id: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    placeholder: string,
  ) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="font-mono text-sm"
      />
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {renderTextField(
          'meta-title',
          t('meta-tag-generator.titleLabel'),
          title,
          setTitle,
          'ToolBox',
        )}
        {renderTextField(
          'meta-site-name',
          t('meta-tag-generator.siteNameLabel'),
          siteName,
          setSiteName,
          'ToolBox',
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="meta-description">{t('meta-tag-generator.descriptionLabel')}</Label>
        <Textarea
          id="meta-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t('meta-tag-generator.descriptionPlaceholder')}
          className="min-h-16 font-mono text-sm"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {renderTextField(
          'meta-image-url',
          t('meta-tag-generator.imageUrlLabel'),
          imageUrl,
          setImageUrl,
          'https://example.com/cover.png',
        )}
        {renderTextField(
          'meta-page-url',
          t('meta-tag-generator.pageUrlLabel'),
          pageUrl,
          setPageUrl,
          'https://example.com/page',
        )}
        {renderTextField(
          'meta-author',
          t('meta-tag-generator.authorLabel'),
          author,
          setAuthor,
          'Alice',
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="meta-twitter-card">{t('meta-tag-generator.twitterCardLabel')}</Label>
          <Select
            value={twitterCard}
            onValueChange={(value) => setTwitterCard(value as TwitterCardType)}
          >
            <SelectTrigger id="meta-twitter-card" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {twitterCardTypes.map((card) => (
                <SelectItem key={card} value={card}>
                  {card}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{tCommon('output')}</Label>
        <TextareaCopyable value={output} rows={10} highlight language="xml" />
      </div>
    </div>
  )
}
