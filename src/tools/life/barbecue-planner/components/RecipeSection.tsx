import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { RECIPE_KIND_LABELS, RECIPES } from '../data/index'
import { referenceRecipe } from '../engine'
import type { RecipeKind, RecipePlan } from '../types'

function RecipeCard({
  recipe,
  spice,
  lang,
}: {
  recipe: RecipePlan
  spice: number
  lang: 'zh' | 'en'
}) {
  const { t } = useTranslation('tools-life', { keyPrefix: 'barbecue-planner' })
  return (
    <Card className="flex min-w-0 flex-col gap-3 rounded-xl p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">{recipe.name[lang]}</h4>
        <span className="text-muted-foreground font-mono text-xs">{recipe.scaledTo[lang]}</span>
      </div>

      <ul className="flex flex-col gap-1">
        {recipe.lines.map((line, index) => (
          <li
            key={`${line.name.zh}-${index}`}
            className="flex items-baseline justify-between gap-3 text-sm"
          >
            <span className="text-muted-foreground min-w-0">{line.name[lang]}</span>
            <span className="shrink-0 font-mono tabular-nums">
              {line.amount}
              {line.unit !== 'to-taste' ? (
                <span className="text-muted-foreground ml-1 text-xs">{line.unit}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {spice > 0 ? (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">{t('recipe.heat')}</span>
          <Badge variant="outline" className="font-mono text-[10px]">
            {spice} / 3
          </Badge>
        </div>
      ) : null}

      {recipe.timing ? (
        <p className="text-xs leading-relaxed">
          <span className="text-muted-foreground font-semibold">{t('recipe.timing')}：</span>
          {recipe.timing[lang]}
        </p>
      ) : null}
      {recipe.glutenFreeSwap ? (
        <p className="text-xs leading-relaxed">
          <span className="text-muted-foreground font-semibold">
            {t('recipe.glutenFreeSwap')}：
          </span>
          {recipe.glutenFreeSwap[lang]}
        </p>
      ) : null}
      {recipe.note ? (
        <p className="text-muted-foreground border-border border-t pt-2 text-xs leading-relaxed">
          {recipe.note[lang]}
        </p>
      ) : null}
    </Card>
  )
}

/**
 * 参考配方：调研来的每一版腌料、撒料、刷酱、蘸料与盐都原样列在这里，
 * 不随本桌点了什么菜而增减或缩放 —— 要买哪几样仍然在「菜单」里勾。
 */
export function RecipeSection({ lang }: { lang: 'zh' | 'en' }) {
  const { t } = useTranslation('tools-life', { keyPrefix: 'barbecue-planner' })
  const blocks: { kind: RecipeKind; label: string }[] = [
    { kind: 'marinade', label: t('recipe.marinadeKind') },
    ...RECIPE_KIND_LABELS.map((entry) => ({ kind: entry.id, label: entry.name[lang] })),
  ]
  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted-foreground text-xs leading-relaxed">{t('recipe.refHint')}</p>
      {blocks.map((block) => {
        const recipes = RECIPES.filter((recipe) => recipe.kind === block.kind)
        if (recipes.length === 0) {
          return null
        }
        return (
          <section key={block.kind} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">{block.label}</h3>
              <p className="text-muted-foreground font-mono text-xs">{recipes.length}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {recipes.map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={referenceRecipe(recipe)}
                  spice={recipe.spice ?? 0}
                  lang={lang}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
