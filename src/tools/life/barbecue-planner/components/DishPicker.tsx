import { Check, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DISH_GROUP_ORDER,
  INGREDIENTS,
  PURCHASE_GROUPS,
  RECIPES,
  RECIPE_KIND_LABELS,
  SUPPLIES,
  UNIT_LABELS,
} from '../data/index'
import { formatMinutes, isNum, midpoint } from '../measure'
import type {
  EquipmentMode,
  Ingredient,
  PurchaseGroupId,
  QtyMode,
  ServeUnit,
  ShoppingLine,
} from '../types'
import { DishThumb } from './DishThumb'
import { UnitSelect } from './UnitSelect'

const GROUP_ORDER = DISH_GROUP_ORDER as readonly PurchaseGroupId[]
const SAUCE_TAB = 'sauce'

/** 这道菜长什么样：单串净重 / 每人几件 / 按克计 */
function dishSpec(item: Ingredient, lang: 'zh' | 'en'): string | null {
  if (item.unit === 'skewer') {
    if (!isNum(item.skewerGrams)) {
      return null
    }
    const { min, max } = item.skewerGrams
    const label = UNIT_LABELS.skewer[lang]
    return lang === 'zh'
      ? `${min === max ? `${min} g/${label}` : `${min}–${max} g/${label}`}`
      : `${min === max ? `${min} g per ${label}` : `${min}–${max} g per ${label}`}`
  }
  if (item.qty.mode === 'perPerson') {
    const measure = item.qty.perPerson.standard
    if (!isNum(measure)) {
      return null
    }
    const per = midpoint(measure) ?? 0
    // 量词跟着食材走：菜市场说"两只鸡翅"，不说"两个鸡翅"
    const label = (item.counter ?? UNIT_LABELS[item.unit])[lang]
    return lang === 'zh' ? `每人 ${per} ${label}` : `${per} ${label} each`
  }
  return lang === 'zh'
    ? `按 ${UNIT_LABELS[item.unit as ServeUnit][lang]}计`
    : `by ${UNIT_LABELS[item.unit as ServeUnit][lang]}`
}

function Tile({
  on,
  disabled,
  onClick,
  title,
  badges,
  meta,
  imageId,
  corner,
}: {
  on: boolean
  disabled?: boolean
  onClick: () => void
  title: string
  badges?: React.ReactNode
  meta: React.ReactNode
  /** 给了就在左边摆一张缩略图：菜品有图，配方没有 */
  imageId?: string
  /** 右下角那一格：手动模式下是数量填写框，其余时候不传 */
  corner?: React.ReactNode
}) {
  return (
    <Card
      className={[
        // 左图、中信息、右列（上勾选 + 下数量）。Card 默认 flex-col，这里必须显式转成一行
        'relative flex h-full flex-row items-stretch gap-2.5 rounded-lg border-none p-2 text-left transition-colors',
        on ? 'bg-primary/8 ring-primary ring-1' : 'bg-card ring-border ring-1',
        disabled ? 'opacity-45' : '',
      ].join(' ')}
    >
      {/* 整卡点击切换勾选，但右下角那一格要能独立输入，所以点击区做成铺底的按钮，
          内容和控件浮在它上面 —— 嵌套 button 是非法 HTML */}
      <button
        type="button"
        aria-pressed={on}
        aria-label={title}
        disabled={disabled}
        onClick={onClick}
        className={[
          'focus-visible:ring-ring absolute inset-0 rounded-lg focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
          disabled ? 'cursor-not-allowed' : 'hover:bg-accent/50',
        ].join(' ')}
      />
      {/* 包一层：Card 对"直接子元素里的首图"会去掉内边距并改成上圆角，那是整幅头图的排法 */}
      {imageId ? (
        <span className="pointer-events-none relative shrink-0">
          <DishThumb id={imageId} name={title} />
        </span>
      ) : null}
      <span className="pointer-events-none relative flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm">{title}</span>
          {badges}
        </span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
          {meta}
        </span>
      </span>
      <span className="pointer-events-none relative flex shrink-0 flex-col items-end justify-between">
        <span
          className={[
            'grid size-4 place-items-center rounded-sm border text-[9px] leading-none',
            on
              ? 'bg-primary border-primary text-primary-foreground'
              : 'bg-background border-border',
          ].join(' ')}
          aria-hidden
        >
          {on ? <Check className="size-3" /> : null}
        </span>
        {corner ? <span className="pointer-events-auto">{corner}</span> : null}
      </span>
    </Card>
  )
}

/**
 * 手动模式下的卡片数量框：只认整数，空值等于"没填"而不是"不买"，
 * 与采购清单里的步进器共用同一份 overrides，两处改的是同一个数。
 */
function CardQty({
  name,
  value,
  unit,
  onCommit,
  onUnit,
}: {
  name: string
  value: number
  unit: ServeUnit
  onCommit: (amount: number) => void
  onUnit: (unit: ServeUnit) => void
}) {
  const { t } = useTranslation('tools-life', { keyPrefix: 'barbecue-planner' })
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    const raw = draft ?? ''
    setDraft(null)
    if (raw.trim() === '') {
      return
    }
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) {
      onCommit(Math.max(0, Math.round(parsed)))
    }
  }
  const shown = draft ?? String(value)
  const edited = draft !== null && draft !== String(value)

  return (
    <span className="flex items-center gap-1">
      <input
        type="text"
        inputMode="numeric"
        aria-label={`${name} ${t('shop.qty')}`}
        value={shown}
        // 选中即改数字，不必先手动清空；Enter 提交，Esc 放弃草稿
        onFocus={(event) => event.target.select()}
        onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ''))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
          if (event.key === 'Escape') {
            setDraft(null)
            event.currentTarget.blur()
          }
        }}
        onClick={(event) => event.stopPropagation()}
        className={[
          'bg-background h-6 w-12 rounded border px-1 text-center font-mono text-xs tabular-nums outline-none',
          edited ? 'border-primary' : 'border-border',
        ].join(' ')}
      />
      <UnitSelect value={unit} ariaLabel={name} onChange={onUnit} />
    </span>
  )
}

/** 一道菜一格：左边缩略图，中间两行信息（烤制时间／规格／要不要腌），右边上勾选下数量。 */
function DishTile({
  item,
  mode,
  lang,
  on,
  onToggle,
  manual,
  line,
  onQuantity,
  onUnit,
}: {
  item: Ingredient
  mode: EquipmentMode
  lang: 'zh' | 'en'
  on: boolean
  onToggle: () => void
  /** 手动模式：勾上的卡片右下角才出现数量框 */
  manual: boolean
  /** 这道菜当前算出来的采购行，缺席表示引擎没给它量（比如忌口排除了） */
  line: ShoppingLine | undefined
  onQuantity: (amount: number) => void
  onUnit: (unit: ServeUnit) => void
}) {
  const { t } = useTranslation('tools-life', { keyPrefix: 'barbecue-planner' })
  const window = item.cook.windows.find((w) => w.mode === mode)
  const spec = dishSpec(item, lang)
  return (
    <Tile
      on={on}
      disabled={!window}
      onClick={onToggle}
      title={item.name[lang]}
      imageId={item.id}
      corner={
        manual && on && line && line.amount !== null ? (
          <CardQty
            name={item.name[lang]}
            value={line.amount}
            unit={line.unit}
            onCommit={onQuantity}
            onUnit={onUnit}
          />
        ) : null
      }
      meta={
        <>
          {window ? (
            <span className="font-mono">{formatMinutes(window.minutes)}</span>
          ) : (
            <span className="text-destructive">{t('dish.noDevice')}</span>
          )}
          {spec ? <span className="truncate">{spec}</span> : null}
          {item.prep.includes('marinate') ? <span>{t('dish.needsMarinate')}</span> : null}
        </>
      }
    />
  )
}

/**
 * 点菜区。二级 tabs 按采购分组切换，最后一格是调料 ——
 * 调料跟着口味走而不是跟着菜走，所以和点菜放在同一层里自由勾选。
 */
export function DishPicker({
  selected,
  sauces,
  basics,
  mode,
  qtyMode,
  lineOf,
  onToggle,
  onBulk,
  onToggleSauce,
  onBulkSauces,
  onToggleBasic,
  onBulkBasics,
  onQtyMode,
  onQuantity,
  onUnit,
}: {
  selected: string[]
  sauces: string[]
  basics: string[]
  mode: EquipmentMode
  qtyMode: QtyMode
  /** 取某道菜当前算出来的采购行，手动模式的数量框以它为初值 */
  lineOf: (id: string) => ShoppingLine | undefined
  onToggle: (id: string) => void
  onBulk: (ids: string[], select: boolean) => void
  onToggleSauce: (id: string) => void
  onBulkSauces: (ids: string[], select: boolean) => void
  onToggleBasic: (id: string) => void
  onBulkBasics: (ids: string[], select: boolean) => void
  onQtyMode: (mode: QtyMode) => void
  onQuantity: (id: string, amount: number) => void
  onUnit: (id: string, unit: ServeUnit) => void
}) {
  const { t, i18n } = useTranslation('tools-life', { keyPrefix: 'barbecue-planner' })
  const lang = i18n.language.startsWith('zh') ? 'zh' : 'en'
  const [group, setGroup] = useState<string>(GROUP_ORDER[0])
  const [query, setQuery] = useState('')
  const keyword = query.trim().toLowerCase()
  /** 中英文名都认，跨分组找：一百多道菜逐组翻太慢 */
  const searched = useMemo(
    () =>
      keyword
        ? INGREDIENTS.filter(
            (item) =>
              item.name.zh.toLowerCase().includes(keyword) ||
              item.name.en.toLowerCase().includes(keyword),
          )
        : [],
    [keyword],
  )
  const searchableIds = searched
    .filter((item) => item.cook.windows.some((w) => w.mode === mode))
    .map((item) => item.id)
  const allSearchedOn =
    searchableIds.length > 0 && searchableIds.every((id) => selected.includes(id))

  const byGroup = GROUP_ORDER.map((id) => ({
    id,
    label: PURCHASE_GROUPS.find((entry) => entry.id === id)?.name[lang] ?? id,
    items: INGREDIENTS.filter((item) => item.group === id),
  }))

  const sauceList = RECIPES.filter((recipe) => recipe.kind !== 'marinade')
  const pickedDishes = new Set(selected)
  const basicList = SUPPLIES.filter((item) => item.group === 'condiment')
  const basicIds = basicList.map((item) => item.id)
  const allBasicsOn = basicIds.every((id) => basics.includes(id))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('dish.search')}
            aria-label={t('dish.search')}
            className="h-8 pr-8 pl-8 text-sm"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('dish.searchClear')}
              title={t('dish.searchClear')}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        {/* 数量谁说了算：auto 由引擎按池摊薄，manual 时每张勾上的卡片右下角出现填写框 */}
        <div
          className="bg-muted flex shrink-0 items-center gap-0.5 rounded-md p-0.5"
          title={t('qty.hint')}
        >
          {(['auto', 'manual'] as const).map((option) => (
            <Button
              key={option}
              size="sm"
              variant={qtyMode === option ? 'default' : 'ghost'}
              className="h-7 px-2 text-xs"
              onClick={() => onQtyMode(option)}
            >
              {t(`qty.${option}`)}
            </Button>
          ))}
        </div>
      </div>

      {keyword ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-muted-foreground text-xs">
              {t('dish.searchHint', {
                total: searched.length,
                picked: searched.filter((item) => selected.includes(item.id)).length,
              })}
            </p>
            {searched.length > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground h-6 shrink-0 px-2 text-xs"
                onClick={() => onBulk(searchableIds, !allSearchedOn)}
              >
                {allSearchedOn ? t('dish.clearMatches') : t('dish.selectMatches')}
              </Button>
            ) : null}
          </div>
          {searched.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('dish.noSearchResult')}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {searched.map((item) => (
                <DishTile
                  key={item.id}
                  item={item}
                  mode={mode}
                  lang={lang}
                  on={selected.includes(item.id)}
                  onToggle={() => onToggle(item.id)}
                  manual={qtyMode === 'manual'}
                  line={lineOf(item.id)}
                  onQuantity={(amount) => onQuantity(item.id, amount)}
                  onUnit={(unit) => onUnit(item.id, unit)}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <Tabs value={group} onValueChange={setGroup} className="flex flex-col gap-3">
          {/* 与上方结果 tabs 同宽：药丸只包住标签，装不下才换行。
          TabsList 在纵向 flex 容器里会被拉伸成整行，所以钉死 w-fit；h-8 是横向形态的默认高度，换行时会顶出外框。 */}
          <TabsList className="flex w-fit max-w-full flex-wrap gap-y-1 group-data-horizontal/tabs:h-auto">
            {byGroup.map((entry) => {
              const on = entry.items.filter((item) => selected.includes(item.id)).length
              return (
                <TabsTrigger
                  key={entry.id}
                  value={entry.id}
                  className="h-6 flex-none gap-1.5 px-2.5"
                >
                  {entry.label}
                  {on > 0 ? (
                    <Badge variant="secondary" className="px-1 py-0 font-mono text-[10px]">
                      {on}
                    </Badge>
                  ) : null}
                </TabsTrigger>
              )
            })}
            <TabsTrigger value={SAUCE_TAB} className="h-6 flex-none gap-1.5 px-2.5">
              {t('tabs.sauces')}
              {sauces.length + basics.length > 0 ? (
                <Badge variant="secondary" className="px-1 py-0 font-mono text-[10px]">
                  {sauces.length + basics.length}
                </Badge>
              ) : null}
            </TabsTrigger>
          </TabsList>

          {byGroup.map((entry) => {
            const selectable = entry.items
              .filter((item) => item.cook.windows.some((w) => w.mode === mode))
              .map((item) => item.id)
            const allOn = selectable.length > 0 && selectable.every((id) => selected.includes(id))
            return (
              <TabsContent key={entry.id} value={entry.id} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-muted-foreground text-xs">
                    {t('dish.groupHint', {
                      total: entry.items.length,
                      picked: entry.items.filter((i) => selected.includes(i.id)).length,
                    })}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground h-6 shrink-0 px-2 text-xs"
                    onClick={() => onBulk(selectable, !allOn)}
                  >
                    {allOn ? t('dish.clearGroup') : t('dish.selectAll')}
                  </Button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {entry.items.map((item) => (
                    <DishTile
                      key={item.id}
                      item={item}
                      mode={mode}
                      lang={lang}
                      on={selected.includes(item.id)}
                      onToggle={() => onToggle(item.id)}
                      manual={qtyMode === 'manual'}
                      line={lineOf(item.id)}
                      onQuantity={(amount) => onQuantity(item.id, amount)}
                      onUnit={(unit) => onUnit(item.id, unit)}
                    />
                  ))}
                </div>
              </TabsContent>
            )
          })}

          <TabsContent value={SAUCE_TAB} className="flex flex-col gap-5">
            {/* 基本：一瓶一瓶买来直接用的成品调料，勾了才进采购清单 */}
            <section className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">{t('sauce.basic')}</h3>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground h-6 shrink-0 px-2 text-xs"
                  onClick={() => onBulkBasics(basicIds, !allBasicsOn)}
                >
                  {allBasicsOn ? t('dish.clearGroup') : t('dish.selectAll')}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {t('sauce.basicHint')}
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {basicList.map((supply) => (
                  <Tile
                    key={supply.id}
                    on={basics.includes(supply.id)}
                    onClick={() => onToggleBasic(supply.id)}
                    title={supply.name[lang]}
                    badges={
                      supply.optional ? (
                        <Badge variant="outline" className="px-1 py-0 text-[10px]">
                          {t('badge.optional')}
                        </Badge>
                      ) : null
                    }
                    meta={supply.use ? <span className="truncate">{supply.use[lang]}</span> : null}
                  />
                ))}
              </div>
            </section>

            {/* 调配：自己按方子称料混合的撒料、刷酱、蘸料与盐 */}
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">{t('sauce.blend')}</h3>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {t('sauce.hint', { total: sauceList.length, picked: sauces.length })}
              </p>
              {RECIPE_KIND_LABELS.map((kind) => {
                const items = sauceList.filter((recipe) => recipe.kind === kind.id)
                if (items.length === 0) {
                  return null
                }
                const ids = items.map((recipe) => recipe.id)
                const allOn = ids.every((id) => sauces.includes(id))
                return (
                  <div key={kind.id} className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <h4 className="text-sm font-semibold">{kind.name[lang]}</h4>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground h-6 shrink-0 px-2 text-xs"
                        onClick={() => onBulkSauces(ids, !allOn)}
                      >
                        {allOn ? t('dish.clearGroup') : t('dish.selectAll')}
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                      {items.map((recipe) => {
                        const on = sauces.includes(recipe.id)
                        const fits = recipe.appliesTo.filter((id) => pickedDishes.has(id)).length
                        const spice = recipe.spice ?? 0
                        const covers =
                          recipe.base.kind === 'batch' ? recipe.base.covers?.[lang] : undefined
                        const servings =
                          recipe.base.kind === 'people' ? recipe.base.basePeople : null
                        return (
                          <Tile
                            key={recipe.id}
                            on={on}
                            onClick={() => onToggleSauce(recipe.id)}
                            title={recipe.name[lang]}
                            badges={
                              spice >= 2 ? (
                                <Badge
                                  variant="outline"
                                  className="px-1 py-0 font-mono text-[10px]"
                                >
                                  {t('recipe.heat')} {spice}/3
                                </Badge>
                              ) : null
                            }
                            meta={
                              <>
                                {covers ? <span className="truncate">{covers}</span> : null}
                                {servings !== null ? (
                                  <span>{t('sauce.yieldPeople', { n: servings })}</span>
                                ) : null}
                                {fits > 0 ? (
                                  <span className="truncate">{t('sauce.fits', { n: fits })}</span>
                                ) : (
                                  <span className="text-muted-foreground/70 truncate">
                                    {t('sauce.noFit')}
                                  </span>
                                )}
                              </>
                            }
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </section>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
