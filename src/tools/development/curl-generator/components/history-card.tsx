import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useCurlHistoryStore, type HistoryEntry } from '@/stores/curl-history.store'
import { normalizeModel, type HttpRequestModel } from '../curl-generator.service'

interface HistoryCardProps {
  onLoad: (model: HttpRequestModel) => void
}

function timeAgo(at: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(at))
}

/** 请求历史：常驻右栏，点条目回填，悬停可单条删除 */
export function HistoryCard({ onLoad }: HistoryCardProps) {
  const { t, i18n } = useTranslation('tools-development')
  const ns = (key: string) => t(`curl-generator.${key}`)
  const entries = useCurlHistoryStore((state) => state.entries)
  const removeEntry = useCurlHistoryStore((state) => state.remove)
  const clearHistory = useCurlHistoryStore((state) => state.clear)

  const load = (entry: HistoryEntry) => {
    const restored = normalizeModel(entry.model)
    if (restored !== null) onLoad(restored)
  }

  return (
    <Card className="gap-0 p-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b py-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          {ns('historyTitle')}
          {entries.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {entries.length}
            </Badge>
          )}
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => clearHistory()}
          disabled={entries.length === 0}
        >
          {ns('historyClear')}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 p-2">
        {entries.length === 0 ? (
          <p className="text-muted-foreground px-2 py-3 text-xs">{ns('historyEmpty')}</p>
        ) : (
          <ScrollArea className="max-h-56">
            <div className="flex flex-col gap-1 pr-2">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="hover:bg-accent/60 flex items-center gap-2 rounded-md px-2 py-1.5"
                >
                  <Badge variant="outline" className="h-5 shrink-0 px-1.5 font-mono text-[10px]">
                    {entry.summary.split(' ')[0]}
                  </Badge>
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left font-mono text-xs"
                    onClick={() => load(entry)}
                  >
                    {entry.summary.replace(/^\S+\s/, '') || entry.command.split('\n')[0]}
                  </button>
                  <span className="text-muted-foreground shrink-0 text-[11px]">
                    {timeAgo(entry.at, i18n.language)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    onClick={() => removeEntry(entry.id)}
                    aria-label={ns('rows.delete')}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
