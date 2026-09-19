import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useCopy } from '@/composable/use-copy'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { loadEmojiGroups, searchEmojis, type EmojiItem } from './emoji-picker.service'

interface EmojiGridProps {
  emojis: EmojiItem[]
  onPick: (char: string) => void
}

function EmojiGrid({ emojis, onPick }: EmojiGridProps) {
  return (
    <div className="grid grid-cols-6 gap-1 sm:grid-cols-9 lg:grid-cols-12">
      {emojis.map((emoji) => (
        <button
          key={emoji.char}
          type="button"
          title={emoji.name}
          onClick={() => onPick(emoji.char)}
          className="hover:bg-accent flex h-9 w-full cursor-pointer items-center justify-center rounded-md text-xl transition-colors"
        >
          {emoji.char}
        </button>
      ))}
    </div>
  )
}

export default function EmojiPicker() {
  const { t } = useTranslation('tools-text')
  const { copy } = useCopy()

  const groups = useMemo(() => loadEmojiGroups(), [])

  const [query, setQuery] = useState('')
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '')

  const isSearching = query.trim() !== ''
  const results = useMemo(() => searchEmojis(query), [query])
  const activeGroup = groups.find((group) => group.id === groupId) ?? groups[0]

  const handlePick = (char: string) => {
    void copy(char)
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('emoji-picker.searchPlaceholder')}
      />

      {isSearching ? (
        results.length > 0 ? (
          <EmojiGrid emojis={results} onPick={handlePick} />
        ) : (
          <p className="text-muted-foreground py-8 text-center text-sm">
            {t('emoji-picker.noResults')}
          </p>
        )
      ) : (
        <Tabs value={activeGroup?.id} onValueChange={setGroupId} className="gap-4">
          <TabsList className="h-auto w-full flex-wrap justify-start">
            {groups.map((group) => (
              <TabsTrigger key={group.id} value={group.id}>
                {t(group.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>

          {groups.map((group) => (
            <TabsContent key={group.id} value={group.id}>
              <EmojiGrid emojis={group.emojis} onPick={handlePick} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}
