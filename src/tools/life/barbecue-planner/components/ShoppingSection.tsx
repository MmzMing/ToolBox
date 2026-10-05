import { Check, Minus, Plus, Trash2, Undo2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UNIT_LABELS } from '../data/index'
import {
  CUSTOM_UNIT_CHOICES,
  adjustedLineCount,
  droppedLineCount,
  isAdjusted,
  isDropped,
  selectableLineIds,
  stepAmount,
  stepForUnit,
} from '../engine'
import type { BarbecuePlan, CustomItem, PurchaseGroupId, ServeUnit, ShoppingLine } from '../types'
import { UnitSelect } from './UnitSelect'

/**
 * 数量步进器。改到 0 就是"这次不买"，
 * 比原来单独的划掉按钮少一个概念 —— 买多少本来就是由人说了算的一件事。
 */
function QtyCell({
  line,
  lang,
  onCommit,
  onReset,
  onUnit,
}: {
  line: ShoppingLine
  lang: 'zh' | 'en'
  onCommit: (amount: number | null) => void
  onReset: () => void
  onUnit: (unit: ServeUnit) => void
}) {
  const { t } = useTranslation('tools-life', { keyPrefix: 'barbecue-planner' })
  const [draft, setDraft] = useState<string | null>(null)
  // 资料缺口的行没有默认量可参照，也就无从步进
  if (line.baseAmount === null) {
    return <span className="text-muted-foreground shrink-0 text-xs">{t('badge.gap')}</span>
  }

  const step = stepForUnit(line.unit)
  const adjusted = isAdjusted(line)
  const commit = (raw: string) => {
    setDraft(null)
    // 空框是「点进来又走开」，不是「这次不买」：Number('') 恰好等于 0，
    // 不在这里挡掉的话，只聚焦不输入就会把整行划掉。
    if (raw.trim() === '') {
      return
    }
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) {
      return
    }
    onCommit(
      Math.max(0, Math.round(parsed)) === line.baseAmount ? null : Math.max(0, Math.round(parsed)),
    )
  }
  /** 步到正好等于默认量时把 override 撤掉，行上不再挂"已改过" */
  const nudge = (delta: number) => {
    const next = stepAmount(line, delta)
    onCommit(next === line.baseAmount ? null : next)
  }

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        aria-label={t('shop.less')}
        title={`−${step}`}
        disabled={line.amount === 0}
        onClick={() => nudge(-step)}
        className="text-muted-foreground hover:bg-accent hover:text-foreground grid size-6 place-items-center rounded disabled:opacity-30"
      >
        <Minus className="size-3.5" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={`${line.name[lang]} ${t('shop.qty')}`}
        value={draft ?? String(line.amount)}
        onFocus={(event) => event.target.select()}
        onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ''))}
        onBlur={() => commit(draft ?? '')}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
          if (event.key === 'Escape') {
            setDraft(null)
            event.currentTarget.blur()
          }
        }}
        className={[
          'border-border bg-background focus:border-primary h-6 rounded border text-center font-mono text-xs tabular-nums outline-none',
          isDropped(line) ? 'text-muted-foreground/60' : '',
          line.unit === 'gram' ? 'w-14' : 'w-11',
        ].join(' ')}
      />
      <button
        type="button"
        aria-label={t('shop.more')}
        title={`+${step}`}
        onClick={() => nudge(step)}
        className="text-muted-foreground hover:bg-accent hover:text-foreground grid size-6 place-items-center rounded"
      >
        <Plus className="size-3.5" />
      </button>
      <span className="text-muted-foreground min-w-8 shrink-0 text-center text-[11px] whitespace-nowrap">
        <UnitSelect value={line.unit} ariaLabel={line.name[lang]} onChange={onUnit} />
      </span>
      {adjusted ? (
        <button
          type="button"
          aria-label={t('shop.resetOne')}
          title={t('shop.resetOne')}
          onClick={onReset}
          className="text-muted-foreground hover:text-foreground grid size-6 place-items-center rounded"
        >
          <Undo2 className="size-3.5" />
        </button>
      ) : null}
    </span>
  )
}

function LineRow({
  line,
  lang,
  checked,
  onToggle,
  onCommit,
  onReset,
  onUnit,
  onRemove,
}: {
  line: ShoppingLine
  lang: 'zh' | 'en'
  checked: boolean
  onToggle: () => void
  onCommit: (amount: number | null) => void
  onReset: () => void
  onUnit: (unit: ServeUnit) => void
  /** 只有自定义行能整条删掉 —— 调研来的行删了会丢掉默认量这个参照 */
  onRemove?: () => void
}) {
  const { t } = useTranslation('tools-life', { keyPrefix: 'barbecue-planner' })
  const out = isDropped(line)
  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={out}
        onClick={onToggle}
        className={[
          'flex min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 py-1.5 text-left transition-colors',
          out ? 'cursor-default' : 'hover:bg-accent/40',
        ].join(' ')}
      >
        <span
          className={[
            'border-border mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-[3px] border text-[9px] leading-none',
            out
              ? 'border-dashed opacity-40'
              : checked
                ? 'bg-primary border-primary text-primary-foreground'
                : 'bg-background',
          ].join(' ')}
          aria-hidden
        >
          {checked && !out ? '✓' : ''}
        </span>
        {/* 用途说明只给调料；纯蘸酱与基础必需品刻意不写，缺席本身就是"必买" */}
        <span
          className={[
            'min-w-0 truncate text-sm',
            out
              ? 'text-muted-foreground decoration-destructive line-through decoration-2'
              : checked
                ? 'text-muted-foreground line-through'
                : '',
          ].join(' ')}
        >
          {line.name[lang]}
          {line.use ? (
            <span
              className={
                out ? 'text-muted-foreground/50 text-[11px]' : 'text-muted-foreground text-[11px]'
              }
            >
              {` · ${line.use[lang]}`}
            </span>
          ) : null}
        </span>
        {out ? (
          <Badge
            variant="outline"
            className="border-destructive text-destructive px-1 py-0 text-[10px]"
          >
            {t('badge.dropped')}
          </Badge>
        ) : null}
        {!out && line.optional ? (
          <Badge variant="outline" className="shrink-0 px-1 py-0 text-[10px]">
            {t('badge.optional')}
          </Badge>
        ) : null}
      </button>
      <QtyCell line={line} lang={lang} onCommit={onCommit} onReset={onReset} onUnit={onUnit} />
      {onRemove ? (
        <button
          type="button"
          aria-label={`${t('custom.remove')} ${line.name[lang]}`}
          title={t('custom.remove')}
          onClick={onRemove}
          className="text-muted-foreground hover:text-foreground grid size-6 shrink-0 place-items-center rounded"
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : null}
    </li>
  )
}

/**
 * 「自己买的那一样」的行内表单：调研数据不认识某个牌子、某瓶饮料、摊子上顺的凉菜，
 * 但它们在菜市场同样要占一项。它顶掉分组卡片里那一行「加一样」，所以长出来的是列表的一部分。
 */
function AddRowForm({
  lang,
  onAdd,
  onCancel,
}: {
  lang: 'zh' | 'en'
  onAdd: (item: Omit<CustomItem, 'id' | 'group'>) => void
  onCancel: () => void
}) {
  const { t } = useTranslation('tools-life', { keyPrefix: 'barbecue-planner' })
  const [name, setName] = useState('')
  const [qty, setQty] = useState('1')
  const [unit, setUnit] = useState<ServeUnit>('piece')

  const trimmed = name.trim()
  const amount = Math.round(Number(qty))
  const canSubmit = trimmed !== '' && Number.isFinite(amount) && amount >= 0

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSubmit) {
      return
    }
    onAdd({ name: trimmed, amount, unit })
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-1 py-1">
      <Input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t('custom.name')}
        aria-label={t('custom.name')}
        className="h-7 min-w-0 flex-1 text-xs"
      />
      <Input
        type="number"
        min={0}
        step={1}
        value={qty}
        onChange={(event) => setQty(event.target.value)}
        aria-label={t('custom.qty')}
        className="h-7 w-12 shrink-0 px-0 text-center font-mono text-xs tabular-nums"
      />
      <Select value={unit} onValueChange={(value) => setUnit(value as ServeUnit)}>
        <SelectTrigger
          size="sm"
          aria-label={t('custom.unit')}
          className="w-[4.5rem] shrink-0 text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CUSTOM_UNIT_CHOICES.map((choice) => (
            <SelectItem key={choice} value={choice} className="text-xs">
              {UNIT_LABELS[choice][lang]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        className="text-primary h-7 shrink-0 px-1.5"
        disabled={!canSubmit}
        aria-label={t('custom.submit')}
        title={t('custom.submit')}
      >
        <Check className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 shrink-0 px-1.5"
        onClick={onCancel}
        aria-label={t('custom.cancel')}
        title={t('custom.cancel')}
      >
        <X className="size-3.5" />
      </Button>
    </form>
  )
}

/**
 * 采购清单。每张分组卡片底部都有一行「加一样」，自己买的东西就记在它所属的那组里。
 * 点行首的方框划勾，行尾的 −／+ 或直接输入改数量，
 * 改成 0 就是"这次不买"：留在屏上随时能改回来，但不进复制文本与导出图。
 */
export function ShoppingSection({
  plan,
  lang,
  checked,
  onToggle,
  onToggleGroup,
  onQuantity,
  onUnit,
  onResetAll,
  onAddCustom,
  onRemoveCustom,
}: {
  plan: BarbecuePlan
  lang: 'zh' | 'en'
  checked: Set<string>
  onToggle: (id: string) => void
  onToggleGroup: (ids: string[], select: boolean) => void
  onQuantity: (id: string, amount: number | null) => void
  onUnit: (id: string, unit: ServeUnit) => void
  onResetAll: () => void
  onAddCustom: (group: PurchaseGroupId, item: Omit<CustomItem, 'id' | 'group'>) => void
  onRemoveCustom: (id: string) => void
}) {
  const { t } = useTranslation('tools-life', { keyPrefix: 'barbecue-planner' })
  const [addingIn, setAddingIn] = useState<PurchaseGroupId | null>(null)
  const total = useMemo(() => selectableLineIds(plan).length, [plan])
  const dropped = useMemo(() => droppedLineCount(plan), [plan])
  const adjusted = useMemo(() => adjustedLineCount(plan), [plan])
  // 只有手动加的行能整条删掉 —— 调研来的行删了会丢掉默认量这个参照
  const customIds = useMemo(
    () => new Set(plan.input.customs.map((item) => item.id)),
    [plan.input.customs],
  )
  const done = useMemo(
    () =>
      plan.shopping.groups.reduce(
        (sum, group) =>
          sum + group.lines.filter((l) => !isDropped(l) && checked.has(l.ingredientId)).length,
        0,
      ),
    [plan, checked],
  )

  if (plan.shopping.groups.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('emptyResult')}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-sm font-medium">{t('shop.progress', { done, total })}</span>
          <span className="flex items-baseline gap-2">
            {dropped > 0 ? (
              <span className="text-destructive text-[11px]">
                {t('shop.zeroed', { n: dropped })}
              </span>
            ) : null}
            {adjusted > 0 ? (
              <button
                type="button"
                onClick={onResetAll}
                className="text-muted-foreground hover:text-foreground text-[11px] underline-offset-2 hover:underline"
              >
                {t('shop.resetAll')}
              </button>
            ) : null}
            <span className="text-muted-foreground font-mono text-xs tabular-nums">
              {total === 0 ? '0' : Math.round((done / total) * 100)}%
            </span>
          </span>
        </div>
        <Progress value={total === 0 ? 0 : (done / total) * 100} />
        <p className="text-muted-foreground text-[11px] leading-relaxed">{t('shop.qtyHint')}</p>
      </div>

      {/* 一列至少 340px 才装得下"名字 + 用途 + 步进器"一行，所以最多两列 */}
      <div className="grid gap-3 md:grid-cols-2">
        {plan.shopping.groups.map((group) => {
          const ids = group.lines
            .filter((line) => !isDropped(line))
            .map((line) => line.ingredientId)
          const groupDone = ids.filter((id) => checked.has(id)).length
          const allOn = ids.length > 0 && groupDone === ids.length
          return (
            <Card key={group.id} className="flex flex-col gap-1 rounded-xl p-3">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {group.label[lang]}
                  <span className="text-muted-foreground ml-1.5 font-mono text-xs">
                    {groupDone}/{ids.length}
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={() => onToggleGroup(ids, !allOn)}
                  className="text-muted-foreground hover:text-foreground text-[11px] underline-offset-2 hover:underline"
                >
                  {allOn ? t('dish.clearGroup') : t('dish.selectAll')}
                </button>
              </div>
              <ul className="divide-border flex flex-col divide-y">
                {group.lines.map((line) => (
                  <LineRow
                    key={line.ingredientId}
                    line={line}
                    lang={lang}
                    checked={checked.has(line.ingredientId)}
                    onToggle={() => onToggle(line.ingredientId)}
                    onCommit={(amount) => onQuantity(line.ingredientId, amount)}
                    onReset={() => onQuantity(line.ingredientId, null)}
                    onUnit={(unit) => onUnit(line.ingredientId, unit)}
                    onRemove={
                      customIds.has(line.ingredientId)
                        ? () => onRemoveCustom(line.ingredientId)
                        : undefined
                    }
                  />
                ))}
                {/* 每一组都能自己补一行：某瓶饮料、某个牌子，落在它所属的那组里而不是单列一张卡 */}
                <li>
                  {addingIn === group.id ? (
                    <AddRowForm
                      lang={lang}
                      onAdd={(item) => {
                        onAddCustom(group.id, item)
                        setAddingIn(null)
                      }}
                      onCancel={() => setAddingIn(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingIn(group.id)}
                      className="text-muted-foreground hover:bg-accent/40 hover:text-foreground flex w-full items-center gap-1.5 rounded px-1.5 py-1.5 text-left text-xs transition-colors"
                    >
                      <Plus className="size-3.5" />
                      {t('custom.add')}
                    </button>
                  )}
                </li>
              </ul>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
