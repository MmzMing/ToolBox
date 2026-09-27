import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'

interface TitleInputProps {
  title: string
  onCommit: (title: string) => void
}

/**
 * 草稿名：无边框输入框，静止时看着就是一段文字，hover / 聚焦才浮出边框
 * （沿用简历编辑器左上角的改名写法）。Enter 提交，Esc 放弃。
 */
export function TitleInput({ title, onCommit }: TitleInputProps) {
  const { t } = useTranslation('tools-text')
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <Input
      value={draft ?? title}
      aria-label={t('markdown-editor.docName')}
      title={t('markdown-editor.docName')}
      placeholder={t('markdown-editor.docNamePlaceholder')}
      className="hover:border-input focus-visible:bg-background h-8 w-40 shrink-0 border-transparent bg-transparent text-sm font-medium md:w-56"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = (draft ?? title).trim()
        setDraft(null)
        onCommit(next)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          setDraft(null)
        }
      }}
    />
  )
}
