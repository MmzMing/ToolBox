import { Check, ChevronDown, Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { InstallGuideBlock, InstallGuideStep } from '@/utils/install-guide'

interface InstallGuideProps {
  /** 文案命名空间 */
  ns: string
  /** 工具键前缀，如 maven-memo */
  scope: string
  /** 卡片标题 */
  title: string
  steps: readonly InstallGuideStep[]
}

function GuideBlock({ block, tr }: { block: InstallGuideBlock; tr: (key: string) => string }) {
  if (block.kind === 'link') {
    return (
      <a
        href={block.url}
        target="_blank"
        rel="noopener noreferrer"
        className="bg-card hover:bg-accent/60 flex min-w-0 items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors"
      >
        <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-md">
          <Download className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{tr(block.labelKey)}</span>
          <span className="text-muted-foreground block truncate font-mono text-xs">
            {block.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          </span>
        </span>
      </a>
    )
  }

  const noteKey = block.kind === 'code' || block.kind === 'file' ? block.noteKey : undefined
  const note = noteKey ? tr(noteKey) : undefined

  if (block.kind === 'code') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <SpanCopyable value={block.value} className="max-w-full shrink-0" />
        {note ? <span className="text-muted-foreground text-xs">{note}</span> : null}
      </div>
    )
  }

  if (block.kind === 'file') {
    return (
      <div className="min-w-0">
        <div className="bg-muted/60 flex items-center justify-between gap-2 rounded-t-md border px-3 py-1.5">
          <span className="text-muted-foreground truncate font-mono text-xs">
            {tr(block.nameKey)}
          </span>
          <SpanCopyable
            value={block.content}
            showText={false}
            className="bg-transparent px-1.5 py-0.5"
          />
        </div>
        <pre className="bg-muted/40 overflow-x-auto rounded-b-md border border-t-0 px-3 py-2 font-mono text-xs leading-relaxed">
          {block.content}
        </pre>
        {note ? <p className="text-muted-foreground mt-1 text-xs">{note}</p> : null}
      </div>
    )
  }

  if (block.kind === 'kv') {
    return (
      <div className="divide-border overflow-hidden rounded-lg border">
        {block.rows.map((row) => (
          <div
            key={row.labelKey}
            className="divide-border flex min-w-0 flex-col gap-1 border-b px-3 py-2 last:border-b-0 sm:flex-row sm:items-center sm:gap-3"
          >
            <span className="text-muted-foreground w-32 shrink-0 text-xs">{tr(row.labelKey)}</span>
            <SpanCopyable value={row.value} className="max-w-full self-start sm:self-auto" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <ul className="divide-border overflow-hidden rounded-lg border">
      {block.rows.map((row) => (
        <li
          key={row.labelKey}
          className="divide-border flex min-w-0 flex-col gap-1 border-b px-3 py-2 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-3"
        >
          <span className="text-muted-foreground w-32 shrink-0 text-xs">{tr(row.labelKey)}</span>
          <span className="flex min-w-0 items-start gap-1.5 text-sm">
            <Check className="text-primary mt-0.5 size-3.5 shrink-0" />
            <span>{tr(row.valueKey)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** 安装引导时间线：默认折叠，展开后显示编号节点与素材卡片 */
export function InstallGuide({ ns, scope, title, steps }: InstallGuideProps) {
  const { t } = useTranslation(ns)
  const key = (suffix: string) => t(`${scope}.${suffix}`)

  return (
    <Collapsible>
      <Card>
        <CardHeader>
          <CollapsibleTrigger className="group/trigger hover:text-foreground flex w-full cursor-pointer items-center gap-2 text-left">
            <span className="font-heading flex-1 text-base font-medium">{title}</span>
            <span className="text-muted-foreground font-mono text-xs tabular-nums">
              {steps.length}
            </span>
            <ChevronDown className="text-muted-foreground size-4 shrink-0 transition-transform duration-200 group-data-[state=open]/trigger:rotate-180" />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            <ol className="flex flex-col">
              {steps.map((step, index) => {
                const last = index === steps.length - 1
                return (
                  <li key={step.id} className="flex gap-3">
                    <div className="flex w-7 shrink-0 flex-col items-center">
                      <span className="border-primary/40 text-primary bg-primary/10 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums">
                        {index + 1}
                      </span>
                      {last ? null : <span aria-hidden className="bg-border mt-1 w-px flex-1" />}
                    </div>
                    <div
                      className={cn('flex min-w-0 flex-1 flex-col gap-2', last ? 'pb-1' : 'pb-6')}
                    >
                      <p className="text-sm font-medium">{key(`guide.${step.id}.title`)}</p>
                      {step.detailKey ? (
                        <p className="text-muted-foreground text-sm">{key(step.detailKey)}</p>
                      ) : null}
                      {step.blocks?.map((block, blockIndex) => (
                        <GuideBlock key={`${step.id}-${blockIndex}`} block={block} tr={key} />
                      ))}
                    </div>
                  </li>
                )
              })}
            </ol>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
