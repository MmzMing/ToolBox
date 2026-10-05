import { ChefHat, UtensilsCrossed } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { applyOverride, normalizePlannerInput, planBarbecue } from './barbecue-planner.service'
import { DishPicker } from './components/DishPicker'
import { EquipmentSection, YieldNote } from './components/EquipmentSection'
import { RecipeSection } from './components/RecipeSection'
import { SafetySection } from './components/SafetySection'
import { TimelineSection } from './components/TimelineSection'
import { Toolbar } from './components/Toolbar'
import { CONFLICTS } from './data/shared'
import type { PlannerInput, ServeUnit, ShoppingLine } from './types'

const EMPTY_INPUT: Partial<PlannerInput> = {
  people: 6,
  appetite: 'standard',
  dishes: [],
  equipmentMode: 'charcoal',
  grillStart: '18:30',
}

const RESULT_TABS = ['recipe', 'timeline', 'equipment', 'safety'] as const
type ResultTab = (typeof RESULT_TABS)[number]

export default function BarbecuePlanner() {
  const { t, i18n } = useTranslation('tools-life', { keyPrefix: 'barbecue-planner' })
  const lang = i18n.language.startsWith('zh') ? 'zh' : 'en'
  const [input, setInput] = useState<PlannerInput>(() => normalizePlannerInput(EMPTY_INPUT))
  const [picking, setPicking] = useState(true)
  const [resultTab, setResultTab] = useState<ResultTab>('recipe')

  const hasSelection = input.dishes.length > 0
  const plan = useMemo(() => planBarbecue(input), [input])

  /** 手动模式的数量框以「当前算出来的这一行」为初值，所以按食材 id 索引一次 */
  const lineById = useMemo(() => {
    const map = new Map<string, ShoppingLine>()
    for (const group of plan.shopping.groups) {
      for (const line of group.lines) {
        map.set(line.ingredientId, line)
      }
    }
    return map
  }, [plan])

  const patch = (next: Partial<PlannerInput>) =>
    setInput((previous) => normalizePlannerInput({ ...previous, ...next }))

  const toggleDish = (id: string) =>
    patch({
      dishes: input.dishes.includes(id)
        ? input.dishes.filter((item) => item !== id)
        : [...input.dishes, id],
    })

  /** 卡片上直接填数量：写进的就是采购清单步进器那份 overrides，两处改的是同一个数 */
  const setDishQty = (id: string, amount: number) =>
    patch({ overrides: applyOverride(input.overrides, id, amount) })

  /** 换量词同样两边共用：卡片下拉和清单下拉改的是同一份 unitChoices */
  const setDishUnit = (id: string, unit: ServeUnit) =>
    patch({ unitChoices: { ...input.unitChoices, [id]: unit } })

  const bulkDishes = (ids: string[], select: boolean) =>
    patch({
      dishes: select
        ? [...new Set([...input.dishes, ...ids])]
        : input.dishes.filter((id) => !ids.includes(id)),
    })

  const toggleSauce = (id: string) =>
    patch({
      sauces: input.sauces.includes(id)
        ? input.sauces.filter((item) => item !== id)
        : [...input.sauces, id],
    })

  const bulkSauces = (ids: string[], select: boolean) =>
    patch({
      sauces: select
        ? [...new Set([...input.sauces, ...ids])]
        : input.sauces.filter((id) => !ids.includes(id)),
    })

  const toggleBasic = (id: string) =>
    patch({
      basics: input.basics.includes(id)
        ? input.basics.filter((item) => item !== id)
        : [...input.basics, id],
    })

  const bulkBasics = (ids: string[], select: boolean) =>
    patch({
      basics: select
        ? [...new Set([...input.basics, ...ids])]
        : input.basics.filter((id) => !ids.includes(id)),
    })

  const openResult = (tab: string) => {
    setResultTab(tab as ResultTab)
    setPicking(false)
  }

  // 配方是参考表，一道没点也看得见，所以不再强制把菜单摊回去；初始仍是打开状态
  const showPicker = picking

  return (
    <div className="flex flex-col gap-4">
      <Toolbar
        input={input}
        plan={hasSelection ? plan : null}
        lang={lang}
        onChange={patch}
        onReset={() => {
          setInput(normalizePlannerInput(EMPTY_INPUT))
          setPicking(true)
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant={showPicker ? 'default' : 'outline'}
          onClick={() => setPicking((previous) => !previous)}
          className="gap-1.5"
        >
          <UtensilsCrossed className="size-4" />
          {t('tabs.dishes')}
          {hasSelection ? (
            <Badge variant={showPicker ? 'secondary' : 'default'} className="font-mono">
              {input.dishes.length}
            </Badge>
          ) : null}
        </Button>

        {RESULT_TABS.map((tab) => {
          const active = !showPicker && resultTab === tab
          const isRecipe = tab === 'recipe'
          return (
            <Button
              key={tab}
              size="sm"
              /* 配方必须走 ghost：outline 自带 dark:bg-input/30，同组会盖掉黄底，
                 而 text-warning-foreground 没有暗色对应值，暗主题下就成了深底深字（同 text-formatter/RulePanel 的坑） */
              variant={isRecipe ? 'ghost' : active ? 'default' : 'outline'}
              disabled={!isRecipe && !hasSelection}
              onClick={() => openResult(tab)}
              className={
                isRecipe
                  ? active
                    ? 'bg-warning text-warning-foreground hover:bg-warning/80 dark:hover:bg-warning/80'
                    : 'text-warning border-warning/40 hover:bg-warning/10 hover:text-warning dark:hover:bg-warning/10'
                  : undefined
              }
            >
              {/* 配方是参考配比，不依赖点了什么菜，所以单独用黄色与其余三块区分 */}
              {tab === 'recipe' ? <ChefHat className="size-3.5" /> : null}
              {t(`tabs.${tab}`)}
            </Button>
          )
        })}
      </div>

      {showPicker ? (
        <DishPicker
          key="dishes"
          selected={input.dishes}
          sauces={input.sauces}
          basics={input.basics}
          mode={input.equipmentMode}
          qtyMode={input.qtyMode}
          lineOf={(id) => lineById.get(id)}
          onQtyMode={(qtyMode) => patch({ qtyMode })}
          onQuantity={setDishQty}
          onUnit={setDishUnit}
          onToggle={toggleDish}
          onBulk={bulkDishes}
          onToggleSauce={toggleSauce}
          onBulkSauces={bulkSauces}
          onToggleBasic={toggleBasic}
          onBulkBasics={bulkBasics}
        />
      ) : (
        <div key={resultTab} className="bbq-panel-in min-w-0">
          {resultTab === 'recipe' ? <RecipeSection lang={lang} /> : null}
          {resultTab === 'timeline' ? (
            <div className="flex flex-col gap-4">
              <TimelineSection entries={plan.timeline} lang={lang} grillStart={input.grillStart} />
              <ConflictChoices input={input} onChange={patch} />
            </div>
          ) : null}
          {resultTab === 'equipment' ? (
            <div className="flex flex-col gap-3">
              <EquipmentSection plan={plan} lang={lang} />
              <YieldNote plan={plan} />
            </div>
          ) : null}
          {resultTab === 'safety' ? <SafetySection plan={plan} lang={lang} /> : null}
        </div>
      )}

      <p className="text-muted-foreground text-xs leading-relaxed">{t('disclaimer')}</p>
    </div>
  )
}

/** 来源互相矛盾的地方不做取舍，只让用户挑口径 */
function ConflictChoices({
  input,
  onChange,
}: {
  input: PlannerInput
  onChange: (patch: Partial<PlannerInput>) => void
}) {
  const { t, i18n } = useTranslation('tools-life', { keyPrefix: 'barbecue-planner' })
  const lang = i18n.language.startsWith('zh') ? 'zh' : 'en'
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">{t('conflictTitle')}</p>
      {CONFLICTS.map((conflict) => {
        const chosenId = input.conflictChoices[conflict.id] ?? conflict.defaultVariantId
        const chosen = conflict.variants.find((variant) => variant.id === chosenId)
        return (
          <div key={conflict.id} className="border-border rounded-lg border p-3">
            <p className="text-xs font-semibold">{conflict.title[lang]}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {conflict.variants.map((variant) => (
                <Button
                  key={variant.id}
                  size="sm"
                  variant={variant.id === chosenId ? 'default' : 'outline'}
                  onClick={() =>
                    onChange({
                      conflictChoices: { ...input.conflictChoices, [conflict.id]: variant.id },
                    })
                  }
                >
                  {variant.label[lang]}
                </Button>
              ))}
            </div>
            {chosen ? (
              <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                {chosen.body[lang]}
              </p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
