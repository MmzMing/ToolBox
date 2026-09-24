/**
 * 构图选择器：一个按钮 + 一个按需渲染的弹层。
 *
 * 为什么不用 Select：140 个构图 × 逐行一个控件，Select 的选项在挂载时就要全部建出来，
 * 47 行的分镜列表会一次性造近七千个元素与同等数量的翻译查找，切到该页要两秒多。
 * 弹层的内容只在打开时才渲染，顺带能按名字过滤，比在 140 项里滚更有用。
 */
import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { LAYOUT_ORDER, isSpecial } from '../engine/registry'

type Props = {
  /** 当前指定的构图，null = 自动 */
  value: string | null
  onChange: (layout: string | null) => void
  label: string
}

export function LayoutPicker({ value, onChange, label }: Props) {
  const { t } = useTranslation('tools-video', { keyPrefix: 'music-to-video' })
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  // 名字表按语言算一次就够，不必每行每次渲染都重算
  const named = useMemo(
    () =>
      LAYOUT_ORDER.filter((k) => !isSpecial('layout', k)).map((k) => ({
        key: k,
        name: t(`parts.layout.${k}`),
      })),
    [t],
  )

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return named
    return named.filter((n) => n.name.toLowerCase().includes(q) || n.key.toLowerCase().includes(q))
  }, [named, query])

  const current = named.find((n) => n.key === value)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={current ? current.name : label}
          className="hover:border-primary/60 hover:bg-accent/40 max-w-[104px] min-w-0 shrink-0 truncate rounded border border-transparent px-1 py-0.5 text-left text-[11px] transition-colors"
        >
          <span className={current ? '' : 'text-muted-foreground'}>
            {current ? current.name : t('lines.auto')}
          </span>
          <ChevronsUpDown className="text-muted-foreground ml-0.5 inline size-2.5 align-[-1px]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 min-w-0 p-1">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('lines.layoutSearch')}
          aria-label={t('lines.layoutSearch')}
          className="mb-1 h-7 text-xs"
          autoFocus
        />
        <div className="max-h-[240px] min-w-0 overflow-x-hidden overflow-y-auto">
          <button
            type="button"
            onClick={() => {
              onChange(null)
              setOpen(false)
            }}
            className={
              value === null
                ? 'bg-accent text-accent-foreground flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-xs'
                : 'hover:bg-accent/50 flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-xs'
            }
          >
            <span className="text-muted-foreground min-w-0 flex-1 truncate">{t('lines.auto')}</span>
            {value === null ? <Check className="size-3 shrink-0" /> : null}
          </button>
          {shown.map((n) => (
            <button
              key={n.key}
              type="button"
              onClick={() => {
                onChange(n.key)
                setOpen(false)
              }}
              className={
                n.key === value
                  ? 'bg-accent text-accent-foreground flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-xs'
                  : 'hover:bg-accent/50 flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-xs'
              }
            >
              <span className="min-w-0 flex-1 truncate">{n.name}</span>
              {n.key === value ? <Check className="size-3 shrink-0" /> : null}
            </button>
          ))}
          {shown.length === 0 ? (
            <p className="text-muted-foreground px-1.5 py-2 text-[11px]">
              {t('lines.noLayoutMatch')}
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
