import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CornerDownLeft, BookMarked, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

import { deletePrompt } from '../idb'
import { useAiImageGenStore } from '../store'

type LibraryPopoverProps = {
  onInsert: (text: string) => void
}

/** 提示词库按钮：向上弹出卡片列表，点卡片插入输入框 */
export function LibraryPopover({ onInsert }: LibraryPopoverProps) {
  const { t } = useTranslation('tools-images')
  const prompts = useAiImageGenStore((state) => state.prompts)
  const removePrompt = useAiImageGenStore((state) => state.removePrompt)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle ? prompts.filter((entry) => entry.text.toLowerCase().includes(needle)) : prompts
  }, [prompts, query])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-full px-3 text-xs"
          title={t('ai-image-gen.toolbar.library')}
        >
          <BookMarked className="size-3.5" />
          <span className="hidden sm:inline">{t('ai-image-gen.toolbar.library')}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-2" align="start" side="top">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('ai-image-gen.library.search')}
          className="h-8 text-xs"
        />
        <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
          {!filtered.length && (
            <p className="text-muted-foreground p-4 text-center text-xs">
              {t('ai-image-gen.library.empty')}
            </p>
          )}
          {filtered.map((entry) => (
            <div key={entry.id} className="bg-muted/30 rounded-lg border p-2">
              <p className="line-clamp-3 text-xs break-words whitespace-pre-wrap">{entry.text}</p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-muted-foreground truncate text-[10px]">
                  {t(`ai-image-gen.library.source.${entry.source}`)} ·{' '}
                  {new Date(entry.createdAt).toLocaleDateString()}
                </span>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-xs"
                    onClick={() => {
                      onInsert(entry.text)
                      setOpen(false)
                    }}
                  >
                    <CornerDownLeft className="size-3" />
                    {t('ai-image-gen.library.insert')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label={t('ai-image-gen.library.delete')}
                    onClick={() => void deletePrompt(entry.id).then(() => removePrompt(entry.id))}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
