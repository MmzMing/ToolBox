/**
 * 次要设置折叠块。面板高度有限，音频 / 歌词 / 风格这些主操作必须一直看得见，
 * 低频项收进这里，摘要留在标题行上以便不展开也能确认现状。
 */
import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

import type { LucideIcon } from 'lucide-react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

export function Section({
  icon: Icon,
  title,
  summary,
  children,
}: {
  icon: LucideIcon
  title: string
  summary?: string
  children: ReactNode
}) {
  return (
    <Collapsible className="border-input rounded-md border">
      <CollapsibleTrigger className="hover:bg-accent/40 group flex w-full items-center gap-2 px-2 py-1.5 text-left">
        <Icon className="text-muted-foreground size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{title}</span>
        {summary ? (
          <span className="text-muted-foreground shrink-0 font-mono text-[11px]">{summary}</span>
        ) : null}
        <ChevronDown className="text-muted-foreground size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-2 px-2 pb-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
