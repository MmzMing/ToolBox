import { useTranslation } from 'react-i18next'
import { ArrowDown, Check, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

import type { GrammarError } from '@/tools/resume/ai/grammar'
import type { useGrammarCheck } from './useGrammarCheck'

type GrammarCheckDrawerProps = {
  check: ReturnType<typeof useGrammarCheck>
}

/** 把出错片段在整句里高亮出来；模型给的 context 有时并不真含 text，这时退回只显示 text */
function ContextSnippet({ error }: { error: GrammarError }) {
  const base = error.context || error.text
  const at = base.indexOf(error.text)
  if (at === -1) {
    return <>{base}</>
  }
  return (
    <>
      {base.slice(0, at)}
      <span className="grammar-error-text">{error.text}</span>
      {base.slice(at + error.text.length)}
    </>
  )
}

/**
 * 校对结果抽屉。
 *
 * `modal={false}`：用户要一边看抽屉一边看预览上的高亮，模态遮罩会把两边都盖掉。
 */
export function GrammarCheckDrawer({ check }: GrammarCheckDrawerProps) {
  const { t } = useTranslation('tools-resume')
  const { items, drawerOpen, setDrawerOpen, applyOne, applyAll, dismiss, select, clear } = check

  return (
    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen} modal={false}>
      <SheetContent
        side="right"
        className="top-14 h-[calc(100svh-3.5rem)] w-full min-w-0 gap-0 overflow-y-auto sm:max-w-md"
      >
        <SheetHeader className="border-b">
          <SheetTitle>{t('resume.grammar.title')}</SheetTitle>
          <SheetDescription>
            {items.length
              ? t('resume.grammar.found', { count: items.length })
              : t('resume.grammar.clean')}
          </SheetDescription>
        </SheetHeader>

        {items.length > 0 && (
          <div className="flex items-center gap-2 border-b p-4">
            <Button size="sm" onClick={applyAll}>
              <Check className="size-4" />
              {t('resume.grammar.applyAll')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={clear}
              aria-label={t('resume.grammar.clearAll')}
            >
              <X className="size-4" />
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-3 p-4">
          {items.map(({ error, index, position }) => (
            <div
              key={`${index}-${error.text}`}
              className={cn(
                'border-border bg-card flex flex-col gap-2 rounded-lg border p-3 text-sm',
                'hover:border-primary/50 cursor-pointer transition-colors',
              )}
              onClick={() => select(position)}
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline">{t(`resume.grammar.types.${error.type}`)}</Badge>
                {error.reason && !['错别字', '标点错误'].includes(error.reason) && (
                  <span className="text-muted-foreground truncate text-xs italic">
                    {error.reason}
                  </span>
                )}
              </div>

              <p className="text-muted-foreground leading-6">
                <ContextSnippet error={error} />
              </p>

              <div className="flex items-center gap-2">
                <ArrowDown className="text-muted-foreground size-4 shrink-0" />
                <span className="text-primary font-medium">{error.suggestion}</span>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(event) => {
                    event.stopPropagation()
                    applyOne(index)
                  }}
                >
                  {t('resume.grammar.apply')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(event) => {
                    event.stopPropagation()
                    dismiss(index)
                  }}
                >
                  {t('resume.grammar.ignore')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
