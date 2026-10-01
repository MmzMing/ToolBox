/**
 * 部件库：10 组表现部件的开关。
 *
 * 关掉一组里的一部分，planner 就只会从剩下的里抽——这是"整片风格由我定，
 * 细节交给随机"的用法。每组都保底留一个可用件（构图留中央、登场退场留直切…），
 * 否则抽不到候选会让分镜退化。
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { GROUP_KEYS, defOf, isSpecial, orderOf } from '../engine/registry'
import { SET_ORDER, setOn } from '../engine/sets'
import type { GroupKey, PartSet, Project } from '../engine/types'

type PartsPanelProps = {
  enabled: Project['enabled']
  extra: boolean
  traditional: boolean
  /** 三套带独立开关的集合（文字PV系 / キネティック / 恐怖） */
  sets: Record<PartSet, boolean>
  onFlags: (part: { extra?: boolean; traditional?: boolean }) => void
  onSetFlag: (set: PartSet, on: boolean) => void
  onSet: (group: GroupKey, key: string, on: boolean) => void
  onBulk: (group: GroupKey, mode: 'on' | 'off' | 'flip') => void
}

/** 每组必须保留的兜底件 */
const KEEP: Partial<Record<GroupKey, string>> = {
  layout: 'center',
  enter: 'cut',
  exit: 'cut',
  hold: 'still',
  treat: 'none',
  bg: 'none',
  cam: 'push',
}

export function PartsPanel({
  enabled,
  extra,
  traditional,
  sets,
  onFlags,
  onSetFlag,
  onSet,
  onBulk,
}: PartsPanelProps) {
  const { t } = useTranslation('tools-video', { keyPrefix: 'music-to-video' })
  const [query, setQuery] = useState('')
  // 860 件全渲染会拖慢面板，所以只渲染展开的分组
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return GROUP_KEYS.map((group) => {
      const items = orderOf(group).filter((k) => !isSpecial(group, k))
      const shown = q
        ? items.filter((k) => `${t(`parts.${group}.${k}`)} ${k}`.toLowerCase().includes(q))
        : items
      const on = items.filter((k) => enabled[group]?.[k] !== false).length
      return { group, items, shown, on }
    }).filter((g) => !query.trim() || g.shown.length > 0)
  }, [enabled, query, t])

  const total = groups.reduce((a, g) => a + g.items.length, 0)
  const totalOn = groups.reduce((a, g) => a + g.on, 0)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('parts.search')}
          className="h-7 flex-1 text-xs"
          aria-label={t('parts.search')}
        />
        <span className="text-muted-foreground font-mono text-[11px]">
          {totalOn}/{total}
        </span>
      </div>

      <div className="border-input flex flex-col gap-1 rounded-md border p-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-[11px] font-medium">{t('parts.useExtra')}</Label>
          <Switch checked={extra} onCheckedChange={(v) => onFlags({ extra: v })} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-[11px] font-medium">{t('parts.useTraditional')}</Label>
          <Switch checked={traditional} onCheckedChange={(v) => onFlags({ traditional: v })} />
        </div>
        {SET_ORDER.map((set) => (
          <div key={set} className="flex items-center justify-between gap-2">
            <Label className="text-[11px] font-medium">{t(`parts.set_${set}`)}</Label>
            <Switch checked={sets[set]} onCheckedChange={(v) => onSetFlag(set, v)} />
          </div>
        ))}
        <p className="text-muted-foreground text-[10px] leading-4">{t('parts.setsHint')}</p>
      </div>

      {groups.map(({ group, items, shown }) => {
        const expanded = !!query.trim() || !!open[group]
        return (
          <details
            key={group}
            open={expanded}
            onToggle={(e) => {
              // 先把 open 取出来：state updater 可能延后到事件对象被回收之后才执行
              const isOpen = e.currentTarget.open
              setOpen((o) => ({ ...o, [group]: isOpen }))
            }}
            className="border-input rounded-md border"
          >
            <summary className="hover:bg-accent/50 flex cursor-pointer items-center justify-between px-2 py-1.5 text-xs">
              <span className="font-medium">{t(`groups.${group}`)}</span>
              <span className="text-muted-foreground font-mono text-[11px]">
                {items.filter((k) => enabled[group]?.[k] !== false).length}/{items.length}
              </span>
            </summary>
            <div className="flex gap-1 px-2 pb-1">
              {(['on', 'off', 'flip'] as const).map((mode) => (
                <Button
                  key={mode}
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => {
                    onBulk(group, mode)
                    const keep = KEEP[group]
                    if (keep && mode === 'off') onSet(group, keep, true)
                  }}
                >
                  {t(`parts.${mode}`)}
                </Button>
              ))}
            </div>
            {expanded ? (
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 px-2 pb-2">
                {shown.map((k) => {
                  const def = defOf(group, k)
                  const setOff = Boolean(def?.set && !setOn(sets, def.set))
                  const excluded =
                    (def?.extra && !extra) || (def?.traditional && !traditional) || setOff
                  // 悬停显示 key 与适用情绪，和JIZURA的做法一致（手法列表的 title）
                  const moods = (def?.tags ?? []).map((m) => t(`moods.${m}`)).join('、')
                  return (
                    <label
                      key={k}
                      className={
                        excluded
                          ? 'text-muted-foreground/60 flex min-w-0 items-center gap-1.5 text-[11px]'
                          : 'flex min-w-0 cursor-pointer items-center gap-1.5 text-[11px]'
                      }
                      title={excluded ? t('parts.excludedHint') : moods ? `${k}（${moods}）` : k}
                    >
                      <input
                        type="checkbox"
                        className="accent-primary size-3.5 shrink-0"
                        checked={enabled[group]?.[k] !== false}
                        onChange={(e) => onSet(group, k, e.target.checked)}
                      />
                      <span className="truncate">{t(`parts.${group}.${k}`)}</span>
                      {def?.extra ? (
                        <span className="text-primary text-[9px]">{t('parts.badgeExtra')}</span>
                      ) : null}
                      {def?.traditional ? (
                        <span className="text-muted-foreground text-[9px]">
                          {t('parts.badgeTraditional')}
                        </span>
                      ) : null}
                      {def?.set ? (
                        <span className="text-primary text-[9px]">
                          {t(`parts.badge_${def.set}`)}
                        </span>
                      ) : null}
                    </label>
                  )
                })}
              </div>
            ) : null}
          </details>
        )
      })}
    </div>
  )
}
